import * as dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from '@prisma/client';
import { PrismaUserRepository } from '../../src/modules/users/infrastructure/prisma-user.repository';
import { PrismaMatchRepository } from '../../src/modules/matches/infrastructure/prisma-match.repository';
import { PrismaChatRepository } from '../../src/modules/chats/infrastructure/prisma-chat.repository';
import { PrismaMessageRepository } from '../../src/modules/messages/infrastructure/prisma-message.repository';
import { MatchStatus } from '../../src/modules/matches/domain/match-status.enum';

describe('Database Integration Tests (Real Prisma)', () => {
  let prisma: PrismaClient;
  let userRepo: PrismaUserRepository;
  let matchRepo: PrismaMatchRepository;
  let chatRepo: PrismaChatRepository;
  let messageRepo: PrismaMessageRepository;
  let isDbAvailable = false;

  beforeAll(async () => {
    try {
      prisma = new PrismaClient();
      await prisma.$connect();
      isDbAvailable = true;
      userRepo = new PrismaUserRepository(prisma);
      matchRepo = new PrismaMatchRepository(prisma);
      chatRepo = new PrismaChatRepository(prisma);
      messageRepo = new PrismaMessageRepository(prisma);
    } catch {
      console.warn('Real database connection not available, skipping live database integration tests');
      isDbAvailable = false;
    }
  });

  afterAll(async () => {
    if (isDbAvailable && prisma) {
      await prisma.$disconnect();
    }
  });

  beforeEach(async () => {
    if (!isDbAvailable) return;
    await prisma.message.deleteMany();
    await prisma.chatParticipant.deleteMany();
    await prisma.chat.deleteMany();
    await prisma.match.deleteMany();
    await prisma.user.deleteMany();
  });

  describe('User Persistence & Constraints', () => {
    it('should create and retrieve user by telegramUserId', async () => {
      if (!isDbAvailable) return;
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
      if (!isDbAvailable) return;
      await userRepo.create({ telegramUserId: 'unique_tg_1' });
      await expect(
        userRepo.create({ telegramUserId: 'unique_tg_1' }),
      ).rejects.toThrow();
    });
  });

  describe('Match Persistence', () => {
    it('should persist and query matches with participants', async () => {
      if (!isDbAvailable) return;
      const user1 = await userRepo.create({ telegramUserId: 'match_u1' });
      const user2 = await userRepo.create({ telegramUserId: 'match_u2' });

      const match = await matchRepo.create({
        matchKey: 'dating_match_42',
        user1Id: user1.id,
        user2Id: user2.id,
        status: MatchStatus.ACTIVE,
      });

      expect(match.id).toBeDefined();
      expect(match.matchKey).toBe('dating_match_42');

      const found = await matchRepo.findByMatchKey('dating_match_42');
      expect(found?.user1Id).toBe(user1.id);
      expect(found?.user2Id).toBe(user2.id);
    });

    it('should enforce unique constraint on matchKey', async () => {
      if (!isDbAvailable) return;
      const user1 = await userRepo.create({ telegramUserId: 'm_u1' });
      const user2 = await userRepo.create({ telegramUserId: 'm_u2' });

      await matchRepo.create({
        matchKey: 'dup_ext_match',
        user1Id: user1.id,
        user2Id: user2.id,
      });

      await expect(
        matchRepo.create({
          matchKey: 'dup_ext_match',
          user1Id: user1.id,
          user2Id: user2.id,
        }),
      ).rejects.toThrow();
    });
  });

  describe('Chat and Participant Transactional Creation & Idempotency', () => {
    it('should atomically create chat and participants inside a transaction', async () => {
      if (!isDbAvailable) return;
      const user1 = await userRepo.create({ telegramUserId: 'chat_u1' });
      const user2 = await userRepo.create({ telegramUserId: 'chat_u2' });
      const match = await matchRepo.create({
        matchKey: 'match_atom_1',
        user1Id: user1.id,
        user2Id: user2.id,
      });

      const result = await chatRepo.createWithParticipants({
        matchId: match.id,
        participantUserIds: [user1.id, user2.id],
      });

      expect(result.chat.id).toBeDefined();
      expect(result.participants).toHaveLength(2);

      const isU1Member = await chatRepo.isParticipant(result.chat.id, user1.id);
      const isU2Member = await chatRepo.isParticipant(result.chat.id, user2.id);
      expect(isU1Member).toBe(true);
      expect(isU2Member).toBe(true);
    });

    it('should guarantee idempotency when createWithParticipants is called again with same matchId', async () => {
      if (!isDbAvailable) return;
      const user1 = await userRepo.create({ telegramUserId: 'idem_u1' });
      const user2 = await userRepo.create({ telegramUserId: 'idem_u2' });
      const match = await matchRepo.create({
        matchKey: 'match_idem_1',
        user1Id: user1.id,
        user2Id: user2.id,
      });

      const first = await chatRepo.createWithParticipants({
        matchId: match.id,
        participantUserIds: [user1.id, user2.id],
      });

      const second = await chatRepo.createWithParticipants({
        matchId: match.id,
        participantUserIds: [user1.id, user2.id],
      });

      expect(second.chat.id).toBe(first.chat.id);
    });
  });

  describe('Message Persistence & Ordering', () => {
    it('should persist messages and retrieve them in descending chronological order', async () => {
      if (!isDbAvailable) return;
      const user1 = await userRepo.create({ telegramUserId: 'msg_u1' });
      const user2 = await userRepo.create({ telegramUserId: 'msg_u2' });
      const match = await matchRepo.create({
        matchKey: 'match_msg_1',
        user1Id: user1.id,
        user2Id: user2.id,
      });
      const chatRes = await chatRepo.createWithParticipants({
        matchId: match.id,
        participantUserIds: [user1.id, user2.id],
      });

      await messageRepo.create({
        chatId: chatRes.chat.id,
        senderId: user1.id,
        content: 'First message',
      });

      await messageRepo.create({
        chatId: chatRes.chat.id,
        senderId: user2.id,
        content: 'Second message',
      });

      const { messages, total } = await messageRepo.findByChatId(chatRes.chat.id, 10, 0);

      expect(total).toBe(2);
      expect(messages[0].content).toBe('Second message');
      expect(messages[1].content).toBe('First message');
    });
  });
});
