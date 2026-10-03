import { FindOrCreateTelegramUserUseCase } from '../../src/modules/users/application/find-or-create-telegram-user.use-case';
import { ProcessReferralUseCase } from '../../src/modules/referrals/application/process-referral.use-case';
import { ResolveMatchContextUseCase } from '../../src/modules/matches/application/resolve-match-context.use-case';
import { GetOrCreateMatchChatUseCase } from '../../src/modules/chats/application/get-or-create-match-chat.use-case';
import { SendMessageUseCase } from '../../src/modules/messages/application/send-message.use-case';
import { GetChatMessagesUseCase } from '../../src/modules/messages/application/get-chat-messages.use-case';
import { GetUserChatsUseCase } from '../../src/modules/chats/application/get-user-chats.use-case';
import { HandleTelegramStartUseCase } from '../../src/modules/telegram/application/handle-telegram-start.use-case';
import { User } from '../../src/modules/users/domain/user.entity';
import { Referral } from '../../src/modules/referrals/domain/referral.entity';
import { Match } from '../../src/modules/matches/domain/match.entity';
import { Chat } from '../../src/modules/chats/domain/chat.entity';
import { ChatParticipant } from '../../src/modules/chats/domain/chat-participant.entity';
import { Message } from '../../src/modules/messages/domain/message.entity';
import { ReferralSource, ReferralType, ReferralStatus } from '../../src/modules/referrals/domain/referral-source.enum';
import { ChatVisibility, ChatParticipantRole } from '../../src/modules/chats/domain/chat-visibility.enum';
import { MatchStatus } from '../../src/modules/matches/domain/match-status.enum';
import {
  MatchNotFoundError,
  MatchExpiredError,
  UserNotMatchParticipantError,
  UserNotChatParticipantError,
  ValidationError,
} from '../../src/shared/domain/domain.error';

describe('Application Use Cases Unit Tests', () => {
  // In-memory repositories for test isolation
  let mockUsers: User[] = [];
  let mockReferrals: Referral[] = [];
  let mockMatches: Match[] = [];
  let mockChats: Chat[] = [];
  let mockParticipants: ChatParticipant[] = [];
  let mockMessages: Message[] = [];

  const mockUserRepository = {
    findById: jest.fn(async (id: string) => mockUsers.find((u) => u.id === id) || null),
    findByTelegramUserId: jest.fn(async (tId: string) => mockUsers.find((u) => u.telegramUserId === tId) || null),
    create: jest.fn(async (data: any) => {
      const user = User.create({
        id: `u-${mockUsers.length + 1}`,
        telegramUserId: data.telegramUserId,
        username: data.username,
        firstName: data.firstName,
        lastName: data.lastName,
      });
      mockUsers.push(user);
      return user;
    }),
    update: jest.fn(async (id: string, data: any) => {
      const idx = mockUsers.findIndex((u) => u.id === id);
      const existing = mockUsers[idx];
      const updated = User.create({
        id: existing.id,
        telegramUserId: existing.telegramUserId,
        username: data.username ?? existing.username,
        firstName: data.firstName ?? existing.firstName,
        lastName: data.lastName ?? existing.lastName,
      });
      mockUsers[idx] = updated;
      return updated;
    }),
  };

  const mockReferralRepository = {
    create: jest.fn(async (data: any) => {
      const referral = Referral.create({
        id: `ref-${mockReferrals.length + 1}`,
        userId: data.userId,
        type: data.type,
        referenceId: data.referenceId,
        source: data.source,
        rawPayload: data.rawPayload,
        status: data.status,
      });
      mockReferrals.push(referral);
      return referral;
    }),
    findById: jest.fn(async (id: string) => mockReferrals.find((r) => r.id === id) || null),
    findLatestByUserId: jest.fn(async (userId: string) =>
      mockReferrals.filter((r) => r.userId === userId).pop() || null,
    ),
    findByUserAndPayload: jest.fn(async (userId: string, rawPayload: string) =>
      mockReferrals.find((r) => r.userId === userId && r.rawPayload === rawPayload) || null,
    ),
    updateStatus: jest.fn(async (id: string, status: ReferralStatus) => {
      const ref = mockReferrals.find((r) => r.id === id);
      if (!ref) throw new Error('Not found');
      const updated = new Referral(
        ref.id,
        ref.userId,
        ref.type,
        ref.referenceId,
        ref.source,
        ref.rawPayload,
        status,
        ref.createdAt,
      );
      const idx = mockReferrals.findIndex((r) => r.id === id);
      mockReferrals[idx] = updated;
      return updated;
    }),
    findAll: jest.fn(async () => ({ referrals: mockReferrals, total: mockReferrals.length })),
  };

  const mockMatchRepository = {
    findById: jest.fn(async (id: string) => mockMatches.find((m) => m.id === id) || null),
    findByExternalMatchId: jest.fn(async (extId: string) =>
      mockMatches.find((m) => m.externalMatchId === extId) || null,
    ),
    create: jest.fn(async (data: any) => {
      const match = Match.create({
        id: `match-${mockMatches.length + 1}`,
        externalMatchId: data.externalMatchId,
        user1Id: data.user1Id,
        user2Id: data.user2Id,
        status: data.status,
        expiresAt: data.expiresAt,
      });
      mockMatches.push(match);
      return match;
    }),
    updateStatus: jest.fn(async (id: string, status: MatchStatus) => {
      const m = mockMatches.find((x) => x.id === id);
      if (!m) throw new Error('Not found');
      return m;
    }),
  };

  const mockChatRepository = {
    findById: jest.fn(async (id: string) => mockChats.find((c) => c.id === id) || null),
    findByMatchId: jest.fn(async (matchId: string) => {
      const chat = mockChats.find((c) => c.matchId === matchId);
      if (!chat) return null;
      const participants = mockParticipants.filter((p) => p.chatId === chat.id);
      return { chat, participants };
    }),
    findWithParticipants: jest.fn(async (id: string) => {
      const chat = mockChats.find((c) => c.id === id);
      if (!chat) return null;
      const participants = mockParticipants.filter((p) => p.chatId === chat.id);
      return { chat, participants };
    }),
    createWithParticipants: jest.fn(async (data: any) => {
      const chat = Chat.create({
        id: `chat-${mockChats.length + 1}`,
        matchId: data.matchId,
        visibility: data.visibility ?? ChatVisibility.HIDDEN,
        title: data.title,
      });
      mockChats.push(chat);
      const createdParticipants: ChatParticipant[] = [];
      for (const userId of data.participantUserIds) {
        const p = ChatParticipant.create({
          id: `p-${mockParticipants.length + 1}`,
          chatId: chat.id,
          userId,
          role: ChatParticipantRole.MEMBER,
        });
        mockParticipants.push(p);
        createdParticipants.push(p);
      }
      return { chat, participants: createdParticipants };
    }),
    isParticipant: jest.fn(async (chatId: string, userId: string) =>
      mockParticipants.some((p) => p.chatId === chatId && p.userId === userId),
    ),
    findUserChats: jest.fn(async (userId: string, includeHidden: boolean) => {
      const userChatIds = mockParticipants.filter((p) => p.userId === userId).map((p) => p.chatId);
      return mockChats.filter((c) => {
        if (!userChatIds.includes(c.id)) return false;
        if (!includeHidden && c.visibility === ChatVisibility.HIDDEN) return false;
        return true;
      });
    }),
    findAllHiddenChats: jest.fn(async () => ({
      chats: mockChats
        .filter((c) => c.visibility === ChatVisibility.HIDDEN)
        .map((chat) => ({
          chat,
          participants: mockParticipants.filter((p) => p.chatId === chat.id),
        })),
      total: mockChats.filter((c) => c.visibility === ChatVisibility.HIDDEN).length,
    })),
  };

  const mockMessageRepository = {
    create: jest.fn(async (data: any) => {
      const msg = Message.create({
        id: `msg-${mockMessages.length + 1}`,
        chatId: data.chatId,
        senderId: data.senderId,
        content: data.content,
      });
      mockMessages.push(msg);
      return msg;
    }),
    findById: jest.fn(async (id: string) => mockMessages.find((m) => m.id === id) || null),
    findByChatId: jest.fn(async (chatId: string) => {
      const filtered = mockMessages.filter((m) => m.chatId === chatId);
      return { messages: filtered, total: filtered.length };
    }),
  };

  beforeEach(() => {
    mockUsers = [];
    mockReferrals = [];
    mockMatches = [];
    mockChats = [];
    mockParticipants = [];
    mockMessages = [];
    jest.clearAllMocks();
  });

  describe('FindOrCreateTelegramUserUseCase', () => {
    it('should create a new user when telegram user does not exist', async () => {
      const useCase = new FindOrCreateTelegramUserUseCase(mockUserRepository as any);
      const user = await useCase.execute({
        telegramUserId: '10001',
        username: 'alice',
        firstName: 'Alice',
      });

      expect(user.id).toBeDefined();
      expect(user.telegramUserId).toBe('10001');
      expect(user.username).toBe('alice');
      expect(mockUsers.length).toBe(1);
    });

    it('should return existing user without duplicating on repeat call', async () => {
      const useCase = new FindOrCreateTelegramUserUseCase(mockUserRepository as any);
      const user1 = await useCase.execute({ telegramUserId: '10001', username: 'alice' });
      const user2 = await useCase.execute({ telegramUserId: '10001', username: 'alice' });

      expect(user1.id).toBe(user2.id);
      expect(mockUsers.length).toBe(1);
    });

    it('should update profile if username or name changed in Telegram', async () => {
      const useCase = new FindOrCreateTelegramUserUseCase(mockUserRepository as any);
      await useCase.execute({ telegramUserId: '10001', username: 'alice', firstName: 'Old' });
      const updated = await useCase.execute({
        telegramUserId: '10001',
        username: 'alice_new',
        firstName: 'NewName',
      });

      expect(updated.username).toBe('alice_new');
      expect(updated.firstName).toBe('NewName');
      expect(mockUsers.length).toBe(1);
    });
  });

  describe('ProcessReferralUseCase', () => {
    it('should process organic start without referral payload', async () => {
      const useCase = new ProcessReferralUseCase(mockReferralRepository as any);
      const result = await useCase.execute({ userId: 'u1', rawPayload: null });

      expect(result.parseResult.isOrganic).toBe(true);
      expect(result.referral.source).toBe(ReferralSource.ORGANIC);
      expect(result.referral.status).toBe(ReferralStatus.RESOLVED);
      expect(result.isDuplicate).toBe(false);
    });

    it('should process valid referral payload and record pending referral', async () => {
      const useCase = new ProcessReferralUseCase(mockReferralRepository as any);
      const result = await useCase.execute({ userId: 'u1', rawPayload: 'ref_match999' });

      expect(result.parseResult.isValid).toBe(true);
      expect(result.referral.source).toBe(ReferralSource.REFERRAL);
      expect(result.referral.referenceId).toBe('match999');
      expect(result.referral.status).toBe(ReferralStatus.PENDING);
      expect(result.isDuplicate).toBe(false);
    });

    it('should detect duplicate referral payload and return isDuplicate: true', async () => {
      const useCase = new ProcessReferralUseCase(mockReferralRepository as any);
      await useCase.execute({ userId: 'u1', rawPayload: 'ref_match999' });
      const secondCall = await useCase.execute({ userId: 'u1', rawPayload: 'ref_match999' });

      expect(secondCall.isDuplicate).toBe(true);
      expect(mockReferrals.length).toBe(1);
    });

    it('should record failed status for malformed payload', async () => {
      const useCase = new ProcessReferralUseCase(mockReferralRepository as any);
      const result = await useCase.execute({ userId: 'u1', rawPayload: 'invalid_payload!' });

      expect(result.parseResult.isValid).toBe(false);
      expect(result.referral.status).toBe(ReferralStatus.FAILED);
    });
  });

  describe('ResolveMatchContextUseCase', () => {
    it('should resolve match when requesting user is user1', async () => {
      const match = Match.create({
        id: 'm1',
        externalMatchId: 'ext_1',
        user1Id: 'user_a',
        user2Id: 'user_b',
      });
      mockMatches.push(match);

      const useCase = new ResolveMatchContextUseCase(mockMatchRepository as any);
      const result = await useCase.execute({
        referenceId: 'ext_1',
        requestingUserId: 'user_a',
      });

      expect(result.match.id).toBe('m1');
      expect(result.matchedWithUserId).toBe('user_b');
    });

    it('should throw MatchNotFoundError when match does not exist', async () => {
      const useCase = new ResolveMatchContextUseCase(mockMatchRepository as any);
      await expect(
        useCase.execute({ referenceId: 'non_existent', requestingUserId: 'user_a' }),
      ).rejects.toThrow(MatchNotFoundError);
    });

    it('should throw MatchExpiredError when match has expired', async () => {
      const match = Match.create({
        id: 'm1',
        externalMatchId: 'ext_exp',
        user1Id: 'user_a',
        user2Id: 'user_b',
        expiresAt: new Date(Date.now() - 10000), // Expired
      });
      mockMatches.push(match);

      const useCase = new ResolveMatchContextUseCase(mockMatchRepository as any);
      await expect(
        useCase.execute({ referenceId: 'ext_exp', requestingUserId: 'user_a' }),
      ).rejects.toThrow(MatchExpiredError);
    });

    it('should throw UserNotMatchParticipantError when user is not in match', async () => {
      const match = Match.create({
        id: 'm1',
        externalMatchId: 'ext_secret',
        user1Id: 'user_a',
        user2Id: 'user_b',
      });
      mockMatches.push(match);

      const useCase = new ResolveMatchContextUseCase(mockMatchRepository as any);
      await expect(
        useCase.execute({ referenceId: 'ext_secret', requestingUserId: 'intruder_user' }),
      ).rejects.toThrow(UserNotMatchParticipantError);
    });
  });

  describe('GetOrCreateMatchChatUseCase', () => {
    it('should create new hidden chat with exactly two participants', async () => {
      const useCase = new GetOrCreateMatchChatUseCase(mockChatRepository as any);
      const result = await useCase.execute({
        matchId: 'm1',
        participantUserIds: ['user_a', 'user_b'],
      });

      expect(result.chat.id).toBeDefined();
      expect(result.chat.visibility).toBe(ChatVisibility.HIDDEN);
      expect(result.participants.length).toBe(2);
      expect(result.participants.map((p) => p.userId)).toEqual(['user_a', 'user_b']);
    });

    it('should be idempotent and return existing chat on repeated call', async () => {
      const useCase = new GetOrCreateMatchChatUseCase(mockChatRepository as any);
      const first = await useCase.execute({
        matchId: 'm1',
        participantUserIds: ['user_a', 'user_b'],
      });
      const second = await useCase.execute({
        matchId: 'm1',
        participantUserIds: ['user_a', 'user_b'],
      });

      expect(first.chat.id).toBe(second.chat.id);
      expect(mockChats.length).toBe(1);
    });
  });

  describe('SendMessageUseCase & GetChatMessagesUseCase Authorization', () => {
    beforeEach(async () => {
      // Setup a test chat with user_a and user_b
      const chat = Chat.create({ id: 'chat_test', matchId: 'm_test' });
      mockChats.push(chat);
      mockParticipants.push(
        ChatParticipant.create({ id: 'p1', chatId: 'chat_test', userId: 'user_a' }),
        ChatParticipant.create({ id: 'p2', chatId: 'chat_test', userId: 'user_b' }),
      );
    });

    it('should allow participant user_a to send a valid message', async () => {
      const sendUseCase = new SendMessageUseCase(
        mockMessageRepository as any,
        mockChatRepository as any,
      );
      const msg = await sendUseCase.execute({
        chatId: 'chat_test',
        senderId: 'user_a',
        content: 'Hello, match!',
      });

      expect(msg.content).toBe('Hello, match!');
      expect(msg.senderId).toBe('user_a');
      expect(mockMessages.length).toBe(1);
    });

    it('should forbid non-participant intruder from sending a message', async () => {
      const sendUseCase = new SendMessageUseCase(
        mockMessageRepository as any,
        mockChatRepository as any,
      );
      await expect(
        sendUseCase.execute({
          chatId: 'chat_test',
          senderId: 'intruder',
          content: 'I want to talk',
        }),
      ).rejects.toThrow(UserNotChatParticipantError);
    });

    it('should reject empty message content', async () => {
      const sendUseCase = new SendMessageUseCase(
        mockMessageRepository as any,
        mockChatRepository as any,
      );
      await expect(
        sendUseCase.execute({
          chatId: 'chat_test',
          senderId: 'user_a',
          content: '   ',
        }),
      ).rejects.toThrow(ValidationError);
    });

    it('should allow participant to retrieve messages', async () => {
      mockMessages.push(
        Message.create({
          id: 'msg1',
          chatId: 'chat_test',
          senderId: 'user_a',
          content: 'Test message',
        }),
      );

      const getUseCase = new GetChatMessagesUseCase(
        mockMessageRepository as any,
        mockChatRepository as any,
      );
      const result = await getUseCase.execute({
        chatId: 'chat_test',
        requestingUserId: 'user_b',
      });

      expect(result.messages.length).toBe(1);
      expect(result.messages[0].content).toBe('Test message');
    });

    it('should forbid non-participant from retrieving messages', async () => {
      const getUseCase = new GetChatMessagesUseCase(
        mockMessageRepository as any,
        mockChatRepository as any,
      );
      await expect(
        getUseCase.execute({
          chatId: 'chat_test',
          requestingUserId: 'intruder',
        }),
      ).rejects.toThrow(UserNotChatParticipantError);
    });
  });

  describe('GetUserChatsUseCase - Hidden Isolation', () => {
    it('should exclude hidden chats from standard chat list queries', async () => {
      // Create one hidden chat and one public chat for user_a
      const hiddenChat = Chat.create({ id: 'c_hidden', visibility: ChatVisibility.HIDDEN });
      const publicChat = Chat.create({ id: 'c_public', visibility: ChatVisibility.PUBLIC });
      mockChats.push(hiddenChat, publicChat);

      mockParticipants.push(
        ChatParticipant.create({ id: 'p1', chatId: 'c_hidden', userId: 'user_a' }),
        ChatParticipant.create({ id: 'p2', chatId: 'c_public', userId: 'user_a' }),
      );

      const useCase = new GetUserChatsUseCase(mockChatRepository as any);

      // Normal call: includeHidden = false
      const normalList = await useCase.execute({ userId: 'user_a', includeHidden: false });
      expect(normalList.length).toBe(1);
      expect(normalList[0].id).toBe('c_public');

      // Admin or explicit internal call: includeHidden = true
      const fullList = await useCase.execute({ userId: 'user_a', includeHidden: true });
      expect(fullList.length).toBe(2);
    });
  });

  describe('HandleTelegramStartUseCase - Complete Orchestration', () => {
    let handleStartUseCase: HandleTelegramStartUseCase;

    beforeEach(() => {
      const findOrCreateUser = new FindOrCreateTelegramUserUseCase(mockUserRepository as any);
      const processReferral = new ProcessReferralUseCase(mockReferralRepository as any);
      const resolveMatch = new ResolveMatchContextUseCase(mockMatchRepository as any);
      const getOrCreateChat = new GetOrCreateMatchChatUseCase(mockChatRepository as any);

      handleStartUseCase = new HandleTelegramStartUseCase(
        findOrCreateUser,
        processReferral,
        resolveMatch,
        getOrCreateChat,
        mockReferralRepository as any,
      );
    });

    it('should handle organic /start without referral', async () => {
      const result = await handleStartUseCase.execute({
        telegramUserId: 'tg_100',
        username: 'bob',
        startPayload: null,
      });

      expect(result.status).toBe('ORGANIC');
      expect(result.message).toContain('Welcome');
      expect(result.user.telegramUserId).toBe('tg_100');
    });

    it('should handle valid match referral /start ref_match101', async () => {
      // 1. Create user A
      const userA = await mockUserRepository.create({ telegramUserId: 'tg_100' });
      // 2. Create user B
      const userB = await mockUserRepository.create({ telegramUserId: 'tg_200' });
      // 3. Create match between them
      await mockMatchRepository.create({
        externalMatchId: 'match101',
        user1Id: userA.id,
        user2Id: userB.id,
      });

      // User A clicks the link: /start ref_match101
      const result = await handleStartUseCase.execute({
        telegramUserId: 'tg_100',
        startPayload: 'ref_match101',
      });

      expect(result.status).toBe('CONNECTED');
      expect(result.chatId).toBeDefined();
      expect(result.matchedWithUserId).toBe(userB.id);

      // Verify hidden chat was created
      const chat = await mockChatRepository.findById(result.chatId!);
      expect(chat?.visibility).toBe(ChatVisibility.HIDDEN);

      // Verify referral status is RESOLVED
      const referrals = await mockReferralRepository.findAll();
      expect(referrals.referrals[0].status).toBe(ReferralStatus.RESOLVED);
    });

    it('should return ALREADY_CONNECTED on repeat /start ref_match101', async () => {
      const userA = await mockUserRepository.create({ telegramUserId: 'tg_100' });
      const userB = await mockUserRepository.create({ telegramUserId: 'tg_200' });
      await mockMatchRepository.create({
        externalMatchId: 'match101',
        user1Id: userA.id,
        user2Id: userB.id,
      });

      await handleStartUseCase.execute({
        telegramUserId: 'tg_100',
        startPayload: 'ref_match101',
      });

      const repeatResult = await handleStartUseCase.execute({
        telegramUserId: 'tg_100',
        startPayload: 'ref_match101',
      });

      expect(repeatResult.status).toBe('ALREADY_CONNECTED');
      expect(mockChats.length).toBe(1);
    });

    it('should handle invalid referral link gracefully without crashing', async () => {
      const result = await handleStartUseCase.execute({
        telegramUserId: 'tg_100',
        startPayload: 'bad_payload!',
      });

      expect(result.status).toBe('INVALID_REFERRAL');
      expect(result.message).toContain('invalid or malformed');
    });

    it('should handle non-existent match referral gracefully', async () => {
      const result = await handleStartUseCase.execute({
        telegramUserId: 'tg_100',
        startPayload: 'ref_ghost_match',
      });

      expect(result.status).toBe('MATCH_NOT_FOUND');
      expect(result.message).toContain('No active match was found');
    });

    it('should deny access when user is not a participant in the match', async () => {
      const userA = await mockUserRepository.create({ telegramUserId: 'tg_100' });
      const userB = await mockUserRepository.create({ telegramUserId: 'tg_200' });
      await mockMatchRepository.create({
        externalMatchId: 'match_secret',
        user1Id: userA.id,
        user2Id: userB.id,
      });

      // User C (intruder) clicks the link: /start ref_match_secret
      const result = await handleStartUseCase.execute({
        telegramUserId: 'tg_300', // user C
        startPayload: 'ref_match_secret',
      });

      expect(result.status).toBe('UNAUTHORIZED');
      expect(result.message).toContain('not authorized');
    });
  });
});
