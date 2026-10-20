import { HandleTelegramStartUseCase } from '../../src/modules/telegram/application/handle-telegram-start.use-case';
import { FindOrCreateTelegramUserUseCase } from '../../src/modules/users/application/find-or-create-telegram-user.use-case';
import { MatchWaitingManager } from '../../src/modules/matches/application/match-waiting-manager';
import { UserActiveChatService } from '../../src/modules/chats/application/user-active-chat.service';
import { User } from '../../src/modules/users/domain/user.entity';
import { Match } from '../../src/modules/matches/domain/match.entity';
import { Chat } from '../../src/modules/chats/domain/chat.entity';
import { ChatParticipant } from '../../src/modules/chats/domain/chat-participant.entity';
import { MatchStatus } from '../../src/modules/matches/domain/match-status.enum';

describe('Exact Match Key Flow Tests', () => {
  let mockUsers: User[] = [];
  let mockMatches: Match[] = [];
  let mockChats: Chat[] = [];
  let mockParticipants: ChatParticipant[] = [];

  let waitingManager: MatchWaitingManager;
  let activeChatService: UserActiveChatService;
  let startUseCase: HandleTelegramStartUseCase;

  const mockUserRepo = {
    findById: jest.fn(async (id: string) => mockUsers.find((u) => u.id === id) || null),
    findByTelegramUserId: jest.fn(async (tid: string) => mockUsers.find((u) => u.telegramUserId === tid) || null),
    create: jest.fn(async (data: any) => {
      const u = User.create({
        id: `u-${mockUsers.length + 1}`,
        telegramUserId: data.telegramUserId,
        username: data.username,
        firstName: data.firstName,
        lastName: data.lastName,
      });
      mockUsers.push(u);
      return u;
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

  const mockMatchRepo = {
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
    create: jest.fn(async (data: any) => {
      const cleanKey = (data.matchKey ?? data.externalMatchId).trim().replace(/^(ref_|match_)/, '');
      const match = Match.create({
        id: `match-${mockMatches.length + 1}`,
        matchKey: cleanKey,
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

  const mockChatRepo = {
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

  beforeEach(() => {
    mockUsers = [];
    mockMatches = [];
    mockChats = [];
    mockParticipants = [];

    waitingManager = new MatchWaitingManager();
    activeChatService = new UserActiveChatService();

    startUseCase = new HandleTelegramStartUseCase(
      new FindOrCreateTelegramUserUseCase(mockUserRepo as any),
      mockMatchRepo as any,
      mockChatRepo as any,
      waitingManager,
      activeChatService,
    );
  });

  it('1. Organic start without match key should welcome user', async () => {
    const output = await startUseCase.execute({
      telegramUserId: '1001',
      username: 'user_1',
      startPayload: null,
    });

    expect(output.status).toBe('ORGANIC');
    expect(output.chatId).toBeUndefined();
    expect(output.message).toContain('خوش آمدید');
  });

  it('2. User 1 starts with key K -> waits in memory (not checked as existing in DB)', async () => {
    const output = await startUseCase.execute({
      telegramUserId: '1001',
      firstName: 'User1',
      startPayload: 'custom_secret_key_88',
    });

    expect(output.status).toBe('WAITING');
    expect(output.message).toContain('در انتظار پیوستن');
    expect(waitingManager.getWaitingUser('custom_secret_key_88')?.telegramUserId).toBe('1001');

    // DB should NOT have any match yet
    expect(mockMatches).toHaveLength(0);
  });

  it('3. User 1 sends same key K again -> notifies already waiting', async () => {
    await startUseCase.execute({
      telegramUserId: '1001',
      startPayload: 'custom_secret_key_88',
    });

    const output = await startUseCase.execute({
      telegramUserId: '1001',
      startPayload: 'custom_secret_key_88',
    });

    expect(output.status).toBe('ALREADY_WAITING');
    expect(output.message).toContain('در انتظار');
  });

  it('4. User 2 starts with same key K -> creates chat, saves match key in DB, notifies partner', async () => {
    // User 1 starts
    await startUseCase.execute({
      telegramUserId: '1001',
      startPayload: 'custom_secret_key_88',
    });

    // User 2 starts
    const output2 = await startUseCase.execute({
      telegramUserId: '1002',
      startPayload: 'custom_secret_key_88',
    });

    expect(output2.status).toBe('CONNECTED');
    expect(output2.chatId).toBeDefined();
    expect(output2.notifyPartnerTelegramUserId).toBe('1001');

    // Verify chat was created in DB
    expect(mockChats).toHaveLength(1);
    expect(mockParticipants).toHaveLength(2);

    // Verify match was saved in DB
    expect(mockMatches).toHaveLength(1);
    expect(mockMatches[0].matchKey).toBe('custom_secret_key_88');
    expect(mockMatches[0].user1Id).toBe('u-1');
    expect(mockMatches[0].user2Id).toBe('u-2');

    // Verify active chats are set for both users
    expect(activeChatService.getActiveChat('u-1')).toBe(output2.chatId);
    expect(activeChatService.getActiveChat('u-2')).toBe(output2.chatId);

    // Verify removed from in-memory queue
    expect(waitingManager.getWaitingUser('custom_secret_key_88')).toBeUndefined();
  });

  it('5. User 3 starts with same key K -> finds key in DB and returns INVALID_KEY', async () => {
    // Pair User 1 and User 2
    await startUseCase.execute({
      telegramUserId: '1001',
      startPayload: 'custom_secret_key_88',
    });
    await startUseCase.execute({
      telegramUserId: '1002',
      startPayload: 'custom_secret_key_88',
    });

    // Third body starts with the same match key!
    const output3 = await startUseCase.execute({
      telegramUserId: '1003',
      startPayload: 'custom_secret_key_88',
    });

    expect(output3.status).toBe('INVALID_KEY');
    expect(output3.message).toContain('این کلید نامعتبر است یا قبلاً استفاده شده است');
    expect(output3.chatId).toBeUndefined();
  });

  it('6. Key variations (e.g. match_xxx or ref_xxx) should normalize and be invalid after use', async () => {
    // User 1 starts with key_abc
    await startUseCase.execute({
      telegramUserId: '1001',
      startPayload: 'match_key_abc',
    });

    // User 2 starts with key_abc
    await startUseCase.execute({
      telegramUserId: '1002',
      startPayload: 'ref_key_abc',
    });

    // Chat is created and match saved under key_abc
    expect(mockMatches).toHaveLength(1);
    expect(mockMatches[0].matchKey).toBe('key_abc');

    // Any future attempts with key_abc or match_key_abc are invalid!
    const third = await startUseCase.execute({
      telegramUserId: '1003',
      startPayload: 'key_abc',
    });
    expect(third.status).toBe('INVALID_KEY');
  });
});
