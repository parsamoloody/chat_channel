import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app/app.module';
import { PrismaService } from '../../src/shared/infrastructure/database/prisma.service';
import { GlobalHttpExceptionFilter } from '../../src/shared/presentation/http-exception.filter';
import { getEnvConfig } from '../../src/shared/infrastructure/config/env.config';

describe('End-to-End & API Scenarios', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const adminKey = getEnvConfig().ADMIN_API_KEY;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new GlobalHttpExceptionFilter());
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    await prisma.message.deleteMany();
    await prisma.chatParticipant.deleteMany();
    await prisma.chat.deleteMany();
    await prisma.match.deleteMany();
    await prisma.referral.deleteMany();
    await prisma.user.deleteMany();
  });

  describe('Scenario 1 — Organic User', () => {
    it('should create user, record organic referral, and return welcome response without chat creation', async () => {
      const telegramUpdate = {
        update_id: 1001,
        message: {
          message_id: 1,
          from: {
            id: 999111,
            is_bot: false,
            first_name: 'OrganicAlice',
            username: 'alice_org',
          },
          chat: { id: 999111, type: 'private' },
          date: Math.floor(Date.now() / 1000),
          text: '/start',
          entities: [{ offset: 0, length: 6, type: 'bot_command' }],
        },
      };

      const res = await request(app.getHttpServer())
        .post('/api/v1/telegram/webhook')
        .send(telegramUpdate)
        .expect(200);

      expect(res.body.ok).toBe(true);

      // Verify user created in DB
      const user = await prisma.user.findUnique({
        where: { telegramUserId: '999111' },
      });
      expect(user).not.toBeNull();
      expect(user?.username).toBe('alice_org');

      // Verify organic referral record
      const referral = await prisma.referral.findFirst({
        where: { userId: user!.id },
      });
      expect(referral).not.toBeNull();
      expect(referral?.source).toBe('ORGANIC');

      // Verify no chats were created
      const chatsCount = await prisma.chat.count();
      expect(chatsCount).toBe(0);
    });
  });

  describe('Scenario 2 — Valid Referral Flow', () => {
    it('should handle /start ref_12345, create user, resolve match, and create hidden chat', async () => {
      // 1. Seed two users and a match in dating system
      const userAlice = await prisma.user.create({
        data: { telegramUserId: '888001', username: 'alice' },
      });
      const userBob = await prisma.user.create({
        data: { telegramUserId: '888002', username: 'bob' },
      });

      const match = await prisma.match.create({
        data: {
          externalMatchId: '12345',
          user1Id: userAlice.id,
          user2Id: userBob.id,
          status: 'ACTIVE',
        },
      });

      // 2. Alice sends /start ref_12345 to Chat Bot via Telegram Webhook
      const telegramUpdate = {
        update_id: 2001,
        message: {
          message_id: 2,
          from: {
            id: 888001,
            is_bot: false,
            first_name: 'Alice',
            username: 'alice',
          },
          chat: { id: 888001, type: 'private' },
          date: Math.floor(Date.now() / 1000),
          text: '/start ref_12345',
        },
      };

      await request(app.getHttpServer())
        .post('/api/v1/telegram/webhook')
        .send(telegramUpdate)
        .expect(200);

      // 3. Verify hidden chat was created
      const chat = await prisma.chat.findUnique({
        where: { matchId: match.id },
        include: { participants: true },
      });

      expect(chat).not.toBeNull();
      expect(chat?.visibility).toBe('HIDDEN');
      expect(chat?.participants.length).toBe(2);
      const participantUserIds = chat?.participants.map((p) => p.userId);
      expect(participantUserIds).toContain(userAlice.id);
      expect(participantUserIds).toContain(userBob.id);

      // 4. Verify referral record marked RESOLVED
      const referral = await prisma.referral.findFirst({
        where: { userId: userAlice.id, referenceId: '12345' },
      });
      expect(referral?.status).toBe('RESOLVED');
    });
  });

  describe('Scenario 3 — Repeat Referral Idempotency', () => {
    it('should be completely idempotent when /start ref_12345 is sent multiple times', async () => {
      const userAlice = await prisma.user.create({
        data: { telegramUserId: '888101', username: 'alice' },
      });
      const userBob = await prisma.user.create({
        data: { telegramUserId: '888102', username: 'bob' },
      });

      await prisma.match.create({
        data: {
          externalMatchId: 'match_repeat',
          user1Id: userAlice.id,
          user2Id: userBob.id,
        },
      });

      const update = {
        update_id: 3001,
        message: {
          message_id: 3,
          from: { id: 888101, is_bot: false, first_name: 'Alice' },
          chat: { id: 888101, type: 'private' },
          date: Math.floor(Date.now() / 1000),
          text: '/start ref_match_repeat',
        },
      };

      // Call 1
      await request(app.getHttpServer()).post('/api/v1/telegram/webhook').send(update).expect(200);
      // Call 2 (repeat)
      await request(app.getHttpServer()).post('/api/v1/telegram/webhook').send(update).expect(200);
      // Call 3 (repeat)
      await request(app.getHttpServer()).post('/api/v1/telegram/webhook').send(update).expect(200);

      // Verify exactly one user
      const users = await prisma.user.findMany({ where: { telegramUserId: '888101' } });
      expect(users.length).toBe(1);

      // Verify exactly one chat
      const chats = await prisma.chat.findMany();
      expect(chats.length).toBe(1);

      // Verify exactly 2 distinct participants
      const participants = await prisma.chatParticipant.findMany({
        where: { chatId: chats[0].id },
      });
      expect(participants.length).toBe(2);

      // Verify referral entries: 1 referral record
      const referrals = await prisma.referral.findMany({
        where: { userId: userAlice.id, rawPayload: 'ref_match_repeat' },
      });
      expect(referrals.length).toBe(1);
    });
  });

  describe('Scenario 4 & 5 — Hidden Chat Listing & Unauthorized Access', () => {
    let userA: any;
    let userB: any;
    let intruder: any;
    let hiddenChat: any;

    beforeEach(async () => {
      userA = await prisma.user.create({ data: { telegramUserId: 'user_a' } });
      userB = await prisma.user.create({ data: { telegramUserId: 'user_b' } });
      intruder = await prisma.user.create({ data: { telegramUserId: 'user_intruder' } });

      hiddenChat = await prisma.chat.create({
        data: {
          visibility: 'HIDDEN',
          participants: {
            create: [{ userId: userA.id }, { userId: userB.id }],
          },
        },
      });
    });

    it('Scenario 5: Normal chat list endpoint must NOT return hidden chats', async () => {
      // User A queries their chat list
      const res = await request(app.getHttpServer())
        .get('/api/v1/chats')
        .set('x-user-id', userA.id)
        .expect(200);

      // Hidden chat must not be in list!
      expect(res.body.data).toEqual([]);
    });

    it('Scenario 4: Unauthorized access attempt to hidden chat returns 403 Forbidden', async () => {
      // Intruder attempts to access User A & B's chat
      const res = await request(app.getHttpServer())
        .get(`/api/v1/chats/${hiddenChat.id}`)
        .set('x-user-id', intruder.id)
        .expect(403);

      expect(res.body.statusCode).toBe(403);
      expect(res.body.message).toContain('not authorized');
    });

    it('Scenario 6: Authorized participant CAN view the hidden chat', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/chats/${hiddenChat.id}`)
        .set('x-user-id', userA.id)
        .expect(200);

      expect(res.body.data.chat.id).toBe(hiddenChat.id);
      expect(res.body.data.participants.length).toBe(2);
    });
  });

  describe('Scenario 6 & 7 — Message Authorization', () => {
    let userA: any;
    let userB: any;
    let intruder: any;
    let hiddenChat: any;

    beforeEach(async () => {
      userA = await prisma.user.create({ data: { telegramUserId: 'msg_u_a' } });
      userB = await prisma.user.create({ data: { telegramUserId: 'msg_u_b' } });
      intruder = await prisma.user.create({ data: { telegramUserId: 'msg_intruder' } });

      hiddenChat = await prisma.chat.create({
        data: {
          visibility: 'HIDDEN',
          participants: {
            create: [{ userId: userA.id }, { userId: userB.id }],
          },
        },
      });
    });

    it('Scenario 6: Authorized participant can send and view messages', async () => {
      // User A sends message
      const postRes = await request(app.getHttpServer())
        .post(`/api/v1/chats/${hiddenChat.id}/messages`)
        .set('x-user-id', userA.id)
        .send({ content: 'Hi Bob, nice to meet you!' })
        .expect(201);

      expect(postRes.body.data.content).toBe('Hi Bob, nice to meet you!');
      expect(postRes.body.data.senderId).toBe(userA.id);

      // User B reads messages
      const getRes = await request(app.getHttpServer())
        .get(`/api/v1/chats/${hiddenChat.id}/messages`)
        .set('x-user-id', userB.id)
        .expect(200);

      expect(getRes.body.total).toBe(1);
      expect(getRes.body.data[0].content).toBe('Hi Bob, nice to meet you!');
    });

    it('Scenario 7: Non-participant CANNOT send messages (403 Forbidden)', async () => {
      const postRes = await request(app.getHttpServer())
        .post(`/api/v1/chats/${hiddenChat.id}/messages`)
        .set('x-user-id', intruder.id)
        .send({ content: 'Intruding!' })
        .expect(403);

      expect(postRes.body.statusCode).toBe(403);
      expect(postRes.body.message).toContain('not authorized');
    });

    it('Scenario 7: Non-participant CANNOT view messages (403 Forbidden)', async () => {
      const getRes = await request(app.getHttpServer())
        .get(`/api/v1/chats/${hiddenChat.id}/messages`)
        .set('x-user-id', intruder.id)
        .expect(403);

      expect(getRes.body.statusCode).toBe(403);
    });
  });

  describe('Scenario 8 — Invalid Referral Handling', () => {
    it('should fail gracefully on invalid referral without throwing 500 error or creating invalid chats', async () => {
      const update = {
        update_id: 8001,
        message: {
          message_id: 8,
          from: { id: 777001, is_bot: false, first_name: 'Attacker' },
          chat: { id: 777001, type: 'private' },
          date: Math.floor(Date.now() / 1000),
          text: '/start bad_prefix_random',
        },
      };

      const res = await request(app.getHttpServer())
        .post('/api/v1/telegram/webhook')
        .send(update)
        .expect(200);

      expect(res.body.ok).toBe(true);

      // Verify no chats were created
      const chats = await prisma.chat.count();
      expect(chats).toBe(0);

      // Verify referral is marked FAILED
      const user = await prisma.user.findUnique({ where: { telegramUserId: '777001' } });
      const referral = await prisma.referral.findFirst({ where: { userId: user!.id } });
      expect(referral?.status).toBe('FAILED');
    });
  });

  describe('Scenario 9 — Admin Programmatic Inspection', () => {
    let hiddenChat: any;
    let userA: any;
    let userB: any;

    beforeEach(async () => {
      userA = await prisma.user.create({ data: { telegramUserId: 'admin_test_a' } });
      userB = await prisma.user.create({ data: { telegramUserId: 'admin_test_b' } });
      hiddenChat = await prisma.chat.create({
        data: {
          visibility: 'HIDDEN',
          participants: {
            create: [{ userId: userA.id }, { userId: userB.id }],
          },
        },
      });
    });

    it('should reject unauthenticated admin requests with 401 Unauthorized', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/admin/chats')
        .expect(401);

      await request(app.getHttpServer())
        .get('/api/v1/admin/chats')
        .set('x-admin-key', 'wrong_key')
        .expect(401);
    });

    it('should allow authorized admin to list hidden chats with pagination', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/chats')
        .set('x-admin-key', adminKey)
        .expect(200);

      expect(res.body.total).toBe(1);
      expect(res.body.data[0].chat.id).toBe(hiddenChat.id);
      expect(res.body.data[0].chat.visibility).toBe('HIDDEN');
      expect(res.body.data[0].participants.length).toBe(2);
    });

    it('should allow authorized admin to inspect specific hidden chat and its participants', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/chats/${hiddenChat.id}`)
        .set('x-admin-key', adminKey)
        .expect(200);

      expect(res.body.data.chat.chat.id).toBe(hiddenChat.id);
      expect(res.body.data.users.length).toBe(2);
    });
  });
});
