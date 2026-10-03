import { PrismaClient } from '@prisma/client';
import { PrismaUserRepository } from '../../src/modules/users/infrastructure/prisma-user.repository';
import { PrismaReferralRepository } from '../../src/modules/referrals/infrastructure/prisma-referral.repository';
import { PrismaMatchRepository } from '../../src/modules/matches/infrastructure/prisma-match.repository';
import { PrismaChatRepository } from '../../src/modules/chats/infrastructure/prisma-chat.repository';
import { PrismaMessageRepository } from '../../src/modules/messages/infrastructure/prisma-message.repository';
import { ReferralSource, ReferralType, ReferralStatus } from '../../src/modules/referrals/domain/referral-source.enum';
import { ChatVisibility } from '../../src/modules/chats/domain/chat-visibility.enum';
import { MatchStatus } from '../../src/modules/matches/domain/match-status.enum';

describe('Database Integration Tests (Real Prisma & SQLite)', () => {
  let prisma: PrismaClient;
  let userRepo: PrismaUserRepository;
  let referralRepo: PrismaReferralRepository;
  let matchRepo: PrismaMatchRepository;
  let chatRepo: PrismaChatRepository;
  let messageRepo: PrismaMessageRepository;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    userRepo = new PrismaUserRepository(prisma as any);
    referralRepo = new PrismaReferralRepository(prisma as any);
    matchRepo = new PrismaMatchRepository(prisma as any);
    chatRepo = new PrismaChatRepository(prisma as any);
    messageRepo = new PrismaMessageRepository(prisma as any);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Clean up test database in reverse relation order
    await prisma.message.deleteMany();
    await prisma.chatParticipant.deleteMany();
    await prisma.chat.deleteMany();
    await prisma.match.deleteMany();
    await prisma.referral.deleteMany();
    await prisma.user.deleteMany();
  });

  describe('User Persistence & Constraints', () => {
    it('should create and retrieve user by telegramUserId', async () => {
      const user = await userRepo.create({
        telegramUserId: 'tg_user_1',
        username: 'john_doe',
        firstName: 'John',
        lastName: 'Doe',
      });

      expect(user.id).toBeDefined();
      expect(user.telegramUserId).toBe('tg_user_1');

      const found = await userRepo.findByTelegramUserId('tg_user_1');
      expect(found).not.toBeNull();
      expect(found?.username).toBe('john_doe');
    });

    it('should enforce unique constraint on telegramUserId', async () => {
      await userRepo.create({ telegramUserId: 'unique_tg_1' });
      await expect(
        userRepo.create({ telegramUserId: 'unique_tg_1' }),
      ).rejects.toThrow();
    });
  });

  describe('Referral Persistence', () => {
    it('should persist referral records and query by user and payload', async () => {
      const user = await userRepo.create({ telegramUserId: 'ref_user_1' });
      const referral = await referralRepo.create({
        userId: user.id,
        type: ReferralType.MATCH,
        referenceId: 'match_xyz',
        source: ReferralSource.REFERRAL,
        rawPayload: 'ref_match_xyz',
        status: ReferralStatus.PENDING,
      });

      expect(referral.id).toBeDefined();
      expect(referral.referenceId).toBe('match_xyz');

      const found = await referralRepo.findByUserAndPayload(user.id, 'ref_match_xyz');
      expect(found).not.toBeNull();
      expect(found?.status).toBe(ReferralStatus.PENDING);

      // Update status to RESOLVED
      const updated = await referralRepo.updateStatus(referral.id, ReferralStatus.RESOLVED);
      expect(updated.status).toBe(ReferralStatus.RESOLVED);
    });
  });

  describe('Match Persistence', () => {
    it('should persist and query matches with participants', async () => {
      const user1 = await userRepo.create({ telegramUserId: 'match_u1' });
      const user2 = await userRepo.create({ telegramUserId: 'match_u2' });

      const match = await matchRepo.create({
        externalMatchId: 'dating_match_42',
        user1Id: user1.id,
        user2Id: user2.id,
        status: MatchStatus.ACTIVE,
      });

      expect(match.id).toBeDefined();
      expect(match.externalMatchId).toBe('dating_match_42');

      const found = await matchRepo.findByExternalMatchId('dating_match_42');
      expect(found?.user1Id).toBe(user1.id);
      expect(found?.user2Id).toBe(user2.id);
    });

    it('should enforce unique constraint on externalMatchId', async () => {
      const user1 = await userRepo.create({ telegramUserId: 'm_u1' });
      const user2 = await userRepo.create({ telegramUserId: 'm_u2' });

      await matchRepo.create({
        externalMatchId: 'dup_ext_match',
        user1Id: user1.id,
        user2Id: user2.id,
      });

      await expect(
        matchRepo.create({
          externalMatchId: 'dup_ext_match',
          user1Id: user1.id,
          user2Id: user2.id,
        }),
      ).rejects.toThrow();
    });
  });

  describe('Chat and Participant Transactional Creation & Idempotency', () => {
    it('should atomically create chat and participants inside a transaction', async () => {
      const user1 = await userRepo.create({ telegramUserId: 'chat_u1' });
      const user2 = await userRepo.create({ telegramUserId: 'chat_u2' });
      const match = await matchRepo.create({
        externalMatchId: 'match_atom_1',
        user1Id: user1.id,
        user2Id: user2.id,
      });

      const result = await chatRepo.createWithParticipants({
        matchId: match.id,
        visibility: ChatVisibility.HIDDEN,
        participantUserIds: [user1.id, user2.id],
      });

      expect(result.chat.id).toBeDefined();
      expect(result.chat.visibility).toBe(ChatVisibility.HIDDEN);
      expect(result.participants.length).toBe(2);

      // Verify participants in DB
      const isU1Participant = await chatRepo.isParticipant(result.chat.id, user1.id);
      const isU2Participant = await chatRepo.isParticipant(result.chat.id, user2.id);
      expect(isU1Participant).toBe(true);
      expect(isU2Participant).toBe(true);
    });

    it('should enforce unique constraint on [chatId, userId] preventing duplicate participants', async () => {
      const user1 = await userRepo.create({ telegramUserId: 'dup_part_u1' });
      const chat = await prisma.chat.create({
        data: { visibility: ChatVisibility.HIDDEN },
      });

      await prisma.chatParticipant.create({
        data: { chatId: chat.id, userId: user1.id },
      });

      // Attempting to add same participant again to same chat should fail
      await expect(
        prisma.chatParticipant.create({
          data: { chatId: chat.id, userId: user1.id },
        }),
      ).rejects.toThrow();
    });

    it('should guarantee idempotency when createWithParticipants is called again with same matchId', async () => {
      const user1 = await userRepo.create({ telegramUserId: 'idem_u1' });
      const user2 = await userRepo.create({ telegramUserId: 'idem_u2' });
      const match = await matchRepo.create({
        externalMatchId: 'match_idem_1',
        user1Id: user1.id,
        user2Id: user2.id,
      });

      const call1 = await chatRepo.createWithParticipants({
        matchId: match.id,
        visibility: ChatVisibility.HIDDEN,
        participantUserIds: [user1.id, user2.id],
      });

      const call2 = await chatRepo.createWithParticipants({
        matchId: match.id,
        visibility: ChatVisibility.HIDDEN,
        participantUserIds: [user1.id, user2.id],
      });

      expect(call1.chat.id).toBe(call2.chat.id);
      const count = await prisma.chat.count({ where: { matchId: match.id } });
      expect(count).toBe(1);
    });
  });

  describe('Database-Level Visibility Filtering', () => {
    it('should strictly exclude HIDDEN chats in findUserChats when includeHidden=false', async () => {
      const user = await userRepo.create({ telegramUserId: 'vis_user' });

      // Create a hidden chat
      await chatRepo.createWithParticipants({
        visibility: ChatVisibility.HIDDEN,
        participantUserIds: [user.id],
      });

      // Create a public chat
      await chatRepo.createWithParticipants({
        visibility: ChatVisibility.PUBLIC,
        participantUserIds: [user.id],
      });

      const normalList = await chatRepo.findUserChats(user.id, false);
      expect(normalList.length).toBe(1);
      expect(normalList[0].visibility).toBe(ChatVisibility.PUBLIC);

      const allList = await chatRepo.findUserChats(user.id, true);
      expect(allList.length).toBe(2);
    });

    it('should allow admin query to fetch all hidden chats', async () => {
      const user1 = await userRepo.create({ telegramUserId: 'admin_vis_1' });
      const user2 = await userRepo.create({ telegramUserId: 'admin_vis_2' });

      await chatRepo.createWithParticipants({
        visibility: ChatVisibility.HIDDEN,
        participantUserIds: [user1.id, user2.id],
      });

      const adminResult = await chatRepo.findAllHiddenChats(10, 0);
      expect(adminResult.total).toBe(1);
      expect(adminResult.chats[0].chat.visibility).toBe(ChatVisibility.HIDDEN);
      expect(adminResult.chats[0].participants.length).toBe(2);
    });
  });

  describe('Message Persistence & Ordering', () => {
    it('should persist messages and retrieve them in descending chronological order', async () => {
      const user = await userRepo.create({ telegramUserId: 'msg_sender' });
      const { chat } = await chatRepo.createWithParticipants({
        participantUserIds: [user.id],
      });

      await messageRepo.create({
        chatId: chat.id,
        senderId: user.id,
        content: 'First message',
      });

      await messageRepo.create({
        chatId: chat.id,
        senderId: user.id,
        content: 'Second message',
      });

      const result = await messageRepo.findByChatId(chat.id, 10, 0);
      expect(result.total).toBe(2);
      expect(result.messages[0].content).toBe('Second message');
      expect(result.messages[1].content).toBe('First message');
    });
  });
});
