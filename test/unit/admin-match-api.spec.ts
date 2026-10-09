import { AdminCreateMatchUseCase } from '../../src/modules/admin/application/admin-create-match.use-case';
import { AdminGetMatchUseCase } from '../../src/modules/admin/application/admin-get-match.use-case';
import { AdminListMatchesUseCase } from '../../src/modules/admin/application/admin-list-matches.use-case';

describe('Admin Match HTTP API Use Cases', () => {
  let mockMatches: any[] = [];
  let mockUsers: any[] = [];

  const mockPrisma: any = {
    user: {
      upsert: jest.fn(async (args: any) => {
        let existing = mockUsers.find((u) => u.telegramUserId === args.where.telegramUserId);
        if (existing) {
          existing.firstName = args.update.firstName ?? existing.firstName;
          return existing;
        }
        const created = {
          id: `u-${mockUsers.length + 1}`,
          telegramUserId: args.create.telegramUserId,
          firstName: args.create.firstName,
          username: args.create.username,
        };
        mockUsers.push(created);
        return created;
      }),
      findUnique: jest.fn(async (args: any) => {
        return mockUsers.find((u) => u.id === args.where.id) || null;
      }),
    },
    match: {
      findUnique: jest.fn(async (args: any) => {
        if (args.where.externalMatchId) {
          return mockMatches.find((m) => m.externalMatchId === args.where.externalMatchId) || null;
        }
        if (args.where.id) {
          return mockMatches.find((m) => m.id === args.where.id) || null;
        }
        return null;
      }),
      findFirst: jest.fn(async (args: any) => {
        const identifiers = args.where.OR.map((cond: any) => cond.id || cond.externalMatchId).filter(Boolean);
        const match = mockMatches.find(
          (m) => identifiers.includes(m.id) || identifiers.includes(m.externalMatchId),
        );
        if (!match) return null;
        const u1 = mockUsers.find((u) => u.id === match.user1Id);
        const u2 = mockUsers.find((u) => u.id === match.user2Id);
        return {
          ...match,
          user1: u1,
          user2: u2,
          chat: null,
        };
      }),
      create: jest.fn(async (args: any) => {
        const m = {
          id: `match-${mockMatches.length + 1}`,
          externalMatchId: args.data.externalMatchId,
          user1Id: args.data.user1Id,
          user2Id: args.data.user2Id,
          status: args.data.status ?? 'ACTIVE',
          expiresAt: args.data.expiresAt ?? null,
          createdAt: new Date(),
        };
        mockMatches.push(m);
        return m;
      }),
      findMany: jest.fn(async () => {
        return mockMatches.map((m) => ({
          ...m,
          user1: mockUsers.find((u) => u.id === m.user1Id),
          user2: mockUsers.find((u) => u.id === m.user2Id),
          chat: null,
        }));
      }),
      count: jest.fn(async () => mockMatches.length),
    },
  };

  beforeEach(() => {
    mockMatches = [];
    mockUsers = [];
    jest.clearAllMocks();
  });

  it('should create match by telegram IDs and return deep link payload', async () => {
    const createUseCase = new AdminCreateMatchUseCase(mockPrisma);
    const result = await createUseCase.execute({
      user1TelegramId: '1001',
      user2TelegramId: '1002',
      user1FirstName: 'Alice',
      user2FirstName: 'Bob',
      externalMatchId: 'cupid_999',
    });

    expect(result.externalMatchId).toBe('cupid_999');
    expect(result.startPayload).toBe('ref_cupid_999');
    expect(result.user1.telegramUserId).toBe('1001');
    expect(result.user2.telegramUserId).toBe('1002');
  });

  it('should get match by externalMatchId or internal ID', async () => {
    const createUseCase = new AdminCreateMatchUseCase(mockPrisma);
    await createUseCase.execute({
      user1TelegramId: '1001',
      user2TelegramId: '1002',
      externalMatchId: 'cupid_999',
    });

    const getUseCase = new AdminGetMatchUseCase(mockPrisma);
    const result = await getUseCase.execute('ref_cupid_999');
    expect(result.externalMatchId).toBe('cupid_999');
    expect(result.user1.telegramUserId).toBe('1001');
  });

  it('should list all matches paginated', async () => {
    const createUseCase = new AdminCreateMatchUseCase(mockPrisma);
    await createUseCase.execute({
      user1TelegramId: '1001',
      user2TelegramId: '1002',
      externalMatchId: 'cupid_1',
    });
    await createUseCase.execute({
      user1TelegramId: '1001',
      user2TelegramId: '1003',
      externalMatchId: 'cupid_2',
    });

    const listUseCase = new AdminListMatchesUseCase(mockPrisma);
    const result = await listUseCase.execute({ limit: 10, offset: 0 });
    expect(result.total).toBe(2);
    expect(result.matches.length).toBe(2);
  });
});
