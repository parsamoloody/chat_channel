import { ExternalMatchPoolService } from '../../src/modules/matches/application/external-match-pool.service';

describe('ExternalMatchPoolService Tests', () => {
  let poolItems: any[] = [];

  const mockPrisma: any = {
    externalMatchPool: {
      count: jest.fn(async (args?: any) => {
        if (!args || !args.where) return poolItems.length;
        if (args.where.status) {
          return poolItems.filter((i) => i.status === args.where.status).length;
        }
        return poolItems.length;
      }),
      create: jest.fn(async (args: any) => {
        const item = {
          id: `pool-${poolItems.length + 1}`,
          externalMatchId: args.data.externalMatchId,
          status: args.data.status ?? 'AVAILABLE',
          usedAt: args.data.usedAt ?? null,
          createdAt: new Date(),
        };
        poolItems.push(item);
        return item;
      }),
      findMany: jest.fn(async (args?: any) => {
        let res = [...poolItems];
        if (args?.where?.status) {
          res = res.filter((i) => i.status === args.where.status);
        }
        const offset = args?.skip ?? 0;
        const limit = args?.take ?? res.length;
        return res.slice(offset, offset + limit);
      }),
      findFirst: jest.fn(async (args?: any) => {
        if (args?.where?.status) {
          return poolItems.find((i) => i.status === args.where.status) || null;
        }
        if (args?.where?.OR) {
          const ids = args.where.OR.map((o: any) => o.externalMatchId);
          return poolItems.find((i) => ids.includes(i.externalMatchId)) || null;
        }
        return poolItems[0] || null;
      }),
      findUnique: jest.fn(async (args: any) => {
        return poolItems.find((i) => i.externalMatchId === args.where.externalMatchId) || null;
      }),
      update: jest.fn(async (args: any) => {
        const item = poolItems.find((i) => i.id === args.where.id);
        if (item) {
          Object.assign(item, args.data);
          return item;
        }
        return null;
      }),
    },
  };

  let service: ExternalMatchPoolService;

  beforeEach(() => {
    poolItems = [];
    jest.clearAllMocks();
    service = new ExternalMatchPoolService(mockPrisma);
  });

  it('should auto-create 10 match IDs on initial app startup when count is 0 (< 5)', async () => {
    expect(poolItems.length).toBe(0);

    await service.onModuleInit();

    expect(poolItems.length).toBe(10);
    const available = poolItems.filter((i) => i.status === 'AVAILABLE');
    expect(available.length).toBe(10);
    expect(available[0].externalMatchId).toMatch(/^match_[a-f0-9]{8}$/);
  });

  it('should replenish up to 10 if existing count is less than 5 (e.g., 3)', async () => {
    // Seed 3 available items
    for (let i = 1; i <= 3; i++) {
      poolItems.push({
        id: `p-${i}`,
        externalMatchId: `seed_${i}`,
        status: 'AVAILABLE',
        createdAt: new Date(),
      });
    }

    const result = await service.ensureReplenished();

    expect(result.replenished).toBe(7); // 10 - 3 = 7 created
    expect(poolItems.filter((i) => i.status === 'AVAILABLE').length).toBe(10);
  });

  it('should NOT replenish if existing count is 5 or more (e.g. 6)', async () => {
    for (let i = 1; i <= 6; i++) {
      poolItems.push({
        id: `p-${i}`,
        externalMatchId: `seed_${i}`,
        status: 'AVAILABLE',
        createdAt: new Date(),
      });
    }

    const result = await service.ensureReplenished();

    expect(result.replenished).toBe(0);
    expect(poolItems.length).toBe(6);
  });

  it('should allow manually creating custom externalMatchId', async () => {
    const result = await service.createMatchId({ externalMatchId: 'cupid_vip_123' });

    expect(result.created.length).toBe(1);
    expect(result.created[0].externalMatchId).toBe('cupid_vip_123');
    expect(result.created[0].status).toBe('AVAILABLE');
  });

  it('should list externalMatchIds with status and stats', async () => {
    poolItems.push(
      { id: '1', externalMatchId: 'm1', status: 'AVAILABLE', createdAt: new Date() },
      { id: '2', externalMatchId: 'm2', status: 'USED', usedAt: new Date(), createdAt: new Date() },
      { id: '3', externalMatchId: 'm3', status: 'AVAILABLE', createdAt: new Date() },
    );

    const list = await service.listMatchIds({ status: 'ALL' });
    expect(list.total).toBe(3);
    expect(list.stats.available).toBe(2);
    expect(list.stats.used).toBe(1);
    expect(list.data[0].startPayload).toBeDefined();
  });

  it('should trigger auto-replenishment after match ID usage when available count drops below 5', async () => {
    // Start with exactly 5 available items
    for (let i = 1; i <= 5; i++) {
      poolItems.push({
        id: `p-${i}`,
        externalMatchId: `match_${i}`,
        status: 'AVAILABLE',
        createdAt: new Date(),
      });
    }

    // Available count is 5 (no replenishment needed)
    expect(poolItems.filter((i) => i.status === 'AVAILABLE').length).toBe(5);

    // Now consume 1 match ID -> drops available count to 4 (< 5)!
    await service.markMatchIdUsed('match_1');

    // It should have immediately triggered replenishment to reach 10 available!
    const available = poolItems.filter((i) => i.status === 'AVAILABLE');
    expect(available.length).toBe(10);
  });
});
