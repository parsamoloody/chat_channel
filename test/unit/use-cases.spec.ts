import { FindOrCreateTelegramUserUseCase } from '../../src/modules/users/application/find-or-create-telegram-user.use-case';
import { GetOrCreateMatchChatUseCase } from '../../src/modules/chats/application/get-or-create-match-chat.use-case';
import { SendMessageUseCase } from '../../src/modules/messages/application/send-message.use-case';
import { GetChatMessagesUseCase } from '../../src/modules/messages/application/get-chat-messages.use-case';
import { GetUserChatsUseCase } from '../../src/modules/chats/application/get-user-chats.use-case';
import { HandleTelegramStartUseCase } from '../../src/modules/telegram/application/handle-telegram-start.use-case';
import { MatchWaitingManager } from '../../src/modules/matches/application/match-waiting-manager';
import { UserActiveChatService } from '../../src/modules/chats/application/user-active-chat.service';
import { User } from '../../src/modules/users/domain/user.entity';
import { Match } from '../../src/modules/matches/domain/match.entity';
import { Chat } from '../../src/modules/chats/domain/chat.entity';
import { ChatParticipant } from '../../src/modules/chats/domain/chat-participant.entity';
import { Message } from '../../src/modules/messages/domain/message.entity';
import { MatchStatus } from '../../src/modules/matches/domain/match-status.enum';
import {
  UserNotChatParticipantError,
  ValidationError,
  ChatNotFoundError,
} from '../../src/shared/domain/domain.error';

describe('Application Use Cases Unit Tests', () => {
  let mockUsers: User[] = [];
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

  const mockMatchRepository = {
    findById: jest.fn(async (id: string) => mockMatches.find((m) => m.id === id) || null),
    findByMatchKey: jest.fn(async (key: string) => {
      const clean = key.trim().replace(/^(ref_|match_)/, '');
      return (
        mockMatches.find(
          (m) =>
            m.matchKey === key ||
            m.matchKey === `match_${clean}` ||
            m.matchKey === clean,
        ) || null
      );
    }),
    findByExternalMatchId: jest.fn(async (key: string) => {
      const clean = key.trim().replace(/^(ref_|match_)/, '');
      return (
        mockMatches.find(
          (m) =>
            m.matchKey === key ||
            m.matchKey === `match_${clean}` ||
            m.matchKey === clean,
        ) || null
      );
    }),
    create: jest.fn(async (data: any) => {
      const match = Match.create({
        id: `match-${mockMatches.length + 1}`,
        matchKey: data.matchKey ?? data.externalMatchId,
        user1Id: data.user1Id,
        user2Id: data.user2Id,
        status: data.status ?? MatchStatus.ACTIVE,
      });
      mockMatches.push(match);
      return match;
    }),
    updateStatus: jest.fn(async (id: string, status: MatchStatus) => {
      const idx = mockMatches.findIndex((m) => m.id === id);
      const updated = Match.create({
        id: mockMatches[idx].id,
        matchKey: mockMatches[idx].matchKey,
        user1Id: mockMatches[idx].user1Id,
        user2Id: mockMatches[idx].user2Id,
        status,
      });
      mockMatches[idx] = updated;
      return updated;
    }),
  };

  const mockChatRepository = {
    findById: jest.fn(async (id: string) => mockChats.find((c) => c.id === id) || null),
    findByMatchId: jest.fn(async (mId: string) => {
      const chat = mockChats.find((c) => c.matchId === mId);
      if (!chat) return null;
      return {
        chat,
        participants: mockParticipants.filter((p) => p.chatId === chat.id),
      };
    }),
    findWithParticipants: jest.fn(async (id: string) => {
      const chat = mockChats.find((c) => c.id === id);
      if (!chat) return null;
      return {
        chat,
        participants: mockParticipants.filter((p) => p.chatId === id),
      };
    }),
    createWithParticipants: jest.fn(async (data: any) => {
      const chat = Chat.create({
        id: `chat-${mockChats.length + 1}`,
        matchId: data.matchId,
      });
      mockChats.push(chat);

      const parts: ChatParticipant[] = [];
      for (const uId of data.participantUserIds) {
        const participant = ChatParticipant.create({
          id: `p-${mockParticipants.length + 1}`,
          chatId: chat.id,
          userId: uId,
        });
        mockParticipants.push(participant);
        parts.push(participant);
      }

      return { chat, participants: parts };
    }),
    isParticipant: jest.fn(async (cId: string, uId: string) => {
      return mockParticipants.some((p) => p.chatId === cId && p.userId === uId);
    }),
    findUserChats: jest.fn(async (uId: string) => {
      const userChatIds = mockParticipants
        .filter((p) => p.userId === uId)
        .map((p) => p.chatId);
      return mockChats.filter((c) => userChatIds.includes(c.id));
    }),
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
    findByChatId: jest.fn(async (chatId: string, limit: number, offset: number) => {
      const filtered = mockMessages
        .filter((m) => m.chatId === chatId)
        .reverse()
        .slice(offset, offset + limit);
      return {
        messages: filtered,
        total: mockMessages.filter((m) => m.chatId === chatId).length,
      };
    }),
  };

  beforeEach(() => {
    mockUsers = [];
    mockMatches = [];
    mockChats = [];
    mockParticipants = [];
    mockMessages = [];
    jest.clearAllMocks();
  });

  describe('FindOrCreateTelegramUserUseCase', () => {
    it('should create new user if user does not exist', async () => {
      const useCase = new FindOrCreateTelegramUserUseCase(mockUserRepository as any);
      const user = await useCase.execute({
        telegramUserId: '10001',
        username: 'alice',
        firstName: 'Alice',
      });

      expect(user).toBeDefined();
      expect(user.telegramUserId).toBe('10001');
      expect(user.username).toBe('alice');
      expect(mockUserRepository.create).toHaveBeenCalled();
    });

    it('should return existing user and update details if changed', async () => {
      const useCase = new FindOrCreateTelegramUserUseCase(mockUserRepository as any);
      await useCase.execute({
        telegramUserId: '10001',
        username: 'alice',
        firstName: 'Alice',
      });

      const updated = await useCase.execute({
        telegramUserId: '10001',
        username: 'alice_new',
        firstName: 'Alice Updated',
      });

      expect(updated.username).toBe('alice_new');
      expect(updated.firstName).toBe('Alice Updated');
      expect(mockUserRepository.update).toHaveBeenCalled();
    });
  });

  describe('GetOrCreateMatchChatUseCase', () => {
    it('should atomically create chat with both participants if none exists', async () => {
      const useCase = new GetOrCreateMatchChatUseCase(mockChatRepository as any);
      const result = await useCase.execute({
        matchId: 'm1',
        participantUserIds: ['user_a', 'user_b'],
      });

      expect(result.chat).toBeDefined();
      expect(result.chat.matchId).toBe('m1');
      expect(result.participants).toHaveLength(2);
      expect(mockChatRepository.createWithParticipants).toHaveBeenCalled();
    });

    it('should return existing chat if matchId is already bound', async () => {
      const useCase = new GetOrCreateMatchChatUseCase(mockChatRepository as any);
      await useCase.execute({
        matchId: 'm1',
        participantUserIds: ['user_a', 'user_b'],
      });

      const existing = await useCase.execute({
        matchId: 'm1',
        participantUserIds: ['user_a', 'user_b'],
      });

      expect(existing.chat.id).toBe('chat-1');
      expect(mockChatRepository.createWithParticipants).toHaveBeenCalledTimes(1);
    });
  });

  describe('SendMessageUseCase', () => {
    it('should send and persist message if sender is a valid participant', async () => {
      const chat = Chat.create({ id: 'chat_test' });
      mockChats.push(chat);
      mockParticipants.push(
        ChatParticipant.create({ id: 'p1', chatId: 'chat_test', userId: 'user_a' }),
      );

      const useCase = new SendMessageUseCase(
        mockMessageRepository as any,
        mockChatRepository as any,
      );

      const message = await useCase.execute({
        chatId: 'chat_test',
        senderId: 'user_a',
        content: 'Hello World',
      });

      expect(message).toBeDefined();
      expect(message.content).toBe('Hello World');
      expect(mockMessageRepository.create).toHaveBeenCalled();
    });

    it('should reject message if sender is not participant in chat', async () => {
      const chat = Chat.create({ id: 'chat_test' });
      mockChats.push(chat);

      const useCase = new SendMessageUseCase(
        mockMessageRepository as any,
        mockChatRepository as any,
      );

      await expect(
        useCase.execute({
          chatId: 'chat_test',
          senderId: 'intruder',
          content: 'Sneaky',
        }),
      ).rejects.toThrow(UserNotChatParticipantError);
    });

    it('should reject empty message', async () => {
      const useCase = new SendMessageUseCase(
        mockMessageRepository as any,
        mockChatRepository as any,
      );

      await expect(
        useCase.execute({
          chatId: 'chat_test',
          senderId: 'user_a',
          content: '   ',
        }),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('GetChatMessagesUseCase', () => {
    it('should retrieve messages in descending chronological order for authorized participant', async () => {
      const chat = Chat.create({ id: 'chat_test' });
      mockChats.push(chat);
      mockParticipants.push(
        ChatParticipant.create({ id: 'p1', chatId: 'chat_test', userId: 'user_a' }),
      );

      mockMessages.push(
        Message.create({ id: 'm1', chatId: 'chat_test', senderId: 'user_a', content: 'First' }),
        Message.create({ id: 'm2', chatId: 'chat_test', senderId: 'user_a', content: 'Second' }),
      );

      const useCase = new GetChatMessagesUseCase(
        mockMessageRepository as any,
        mockChatRepository as any,
      );

      const result = await useCase.execute({
        chatId: 'chat_test',
        requestingUserId: 'user_a',
        limit: 10,
        offset: 0,
      });

      expect(result.total).toBe(2);
      expect(result.messages[0].content).toBe('Second');
      expect(result.messages[1].content).toBe('First');
    });

    it('should throw UserNotChatParticipantError for unauthorized reader', async () => {
      const chat = Chat.create({ id: 'chat_test' });
      mockChats.push(chat);

      const useCase = new GetChatMessagesUseCase(
        mockMessageRepository as any,
        mockChatRepository as any,
      );

      await expect(
        useCase.execute({
          chatId: 'chat_test',
          requestingUserId: 'intruder',
        }),
      ).rejects.toThrow(UserNotChatParticipantError);
    });
  });

  describe('GetUserChatsUseCase', () => {
    it('should retrieve user chats', async () => {
      const chat1 = Chat.create({ id: 'c1' });
      const chat2 = Chat.create({ id: 'c2' });
      mockChats.push(chat1, chat2);

      mockParticipants.push(
        ChatParticipant.create({ id: 'p1', chatId: 'c1', userId: 'u1' }),
        ChatParticipant.create({ id: 'p2', chatId: 'c2', userId: 'u1' }),
      );

      const useCase = new GetUserChatsUseCase(mockChatRepository as any);
      const chats = await useCase.execute({ userId: 'u1' });

      expect(chats).toHaveLength(2);
    });
  });

  describe('HandleTelegramStartUseCase - Matching Flow', () => {
    let waitingManager: MatchWaitingManager;
    let activeChatService: UserActiveChatService;
    let startUseCase: HandleTelegramStartUseCase;

    beforeEach(() => {
      waitingManager = new MatchWaitingManager();
      activeChatService = new UserActiveChatService();
      startUseCase = new HandleTelegramStartUseCase(
        new FindOrCreateTelegramUserUseCase(mockUserRepository as any),
        mockMatchRepository as any,
        mockChatRepository as any,
        waitingManager,
        activeChatService,
      );
    });

    it('should handle organic start without match key', async () => {
      const res = await startUseCase.execute({
        telegramUserId: 'tg_100',
        startPayload: null,
      });

      expect(res.status).toBe('ORGANIC');
      expect(res.chatId).toBeUndefined();
    });

    it('should place User 1 in waiting state when User 1 starts with a key', async () => {
      const res = await startUseCase.execute({
        telegramUserId: 'tg_100',
        startPayload: 'secret_code_1',
      });

      expect(res.status).toBe('WAITING');
      expect(res.chatId).toBeUndefined();
      expect(waitingManager.getWaitingUser('secret_code_1')?.telegramUserId).toBe('tg_100');
    });

    it('should respond with ALREADY_WAITING if User 1 starts again with same key', async () => {
      await startUseCase.execute({
        telegramUserId: 'tg_100',
        startPayload: 'secret_code_1',
      });

      const res = await startUseCase.execute({
        telegramUserId: 'tg_100',
        startPayload: 'secret_code_1',
      });

      expect(res.status).toBe('ALREADY_WAITING');
    });

    it('should create chat and save match in DB when User 2 starts with same key', async () => {
      // User 1 starts
      await startUseCase.execute({
        telegramUserId: 'tg_100',
        startPayload: 'secret_code_1',
      });

      // User 2 starts with same key
      const res2 = await startUseCase.execute({
        telegramUserId: 'tg_200',
        startPayload: 'secret_code_1',
      });

      expect(res2.status).toBe('CONNECTED');
      expect(res2.chatId).toBeDefined();
      expect(res2.notifyPartnerTelegramUserId).toBe('tg_100');

      // Verify match saved in DB
      const savedInDb = await mockMatchRepository.findByMatchKey('secret_code_1');
      expect(savedInDb).not.toBeNull();
      expect(savedInDb?.user1Id).toBe('u-1');
      expect(savedInDb?.user2Id).toBe('u-2');

      // Verify in-memory queue cleared for this key
      expect(waitingManager.getWaitingUser('secret_code_1')).toBeUndefined();
    });

    it('should return INVALID_KEY when User 3 starts with the already-matched key', async () => {
      // User 1 starts
      await startUseCase.execute({
        telegramUserId: 'tg_100',
        startPayload: 'secret_code_1',
      });

      // User 2 connects
      await startUseCase.execute({
        telegramUserId: 'tg_200',
        startPayload: 'secret_code_1',
      });

      // User 3 tries with the same key
      const res3 = await startUseCase.execute({
        telegramUserId: 'tg_300',
        startPayload: 'secret_code_1',
      });

      expect(res3.status).toBe('INVALID_KEY');
      expect(res3.message).toContain('نامعتبر');
    });
  });
});
