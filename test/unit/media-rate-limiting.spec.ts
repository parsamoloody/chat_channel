import {
  MediaRateLimiterService,
  parseTimeUnit,
} from '../../src/modules/telegram/application/media-rate-limiter.service';
import { HandleTelegramMessageUseCase } from '../../src/modules/telegram/application/handle-telegram-message.use-case';
import { SendMessageUseCase } from '../../src/modules/messages/application/send-message.use-case';
import { TelegramBotService } from '../../src/modules/telegram/infrastructure/telegram-bot.service';
import { UserActiveChatService } from '../../src/modules/chats/application/user-active-chat.service';
import { GetUserActiveChatPartnerUseCase } from '../../src/modules/chats/application/get-user-active-chat-partner.use-case';
import { GetUserChatListUseCase } from '../../src/modules/chats/application/get-user-chat-list.use-case';
import { SwitchUserActiveChatUseCase } from '../../src/modules/chats/application/switch-user-active-chat.use-case';
import { User } from '../../src/modules/users/domain/user.entity';
import { Chat } from '../../src/modules/chats/domain/chat.entity';
import { ChatParticipant } from '../../src/modules/chats/domain/chat-participant.entity';
import { Message } from '../../src/modules/messages/domain/message.entity';
import { ChatVisibility, ChatParticipantRole } from '../../src/modules/chats/domain/chat-visibility.enum';
import { REPLY_TEXTS } from '../../src/modules/telegram/constants/reply-texts';
import * as fs from 'fs';
import * as path from 'path';

describe('Media Support & Rate Limiting (Stickers, GIFs, Emojis)', () => {
  let originalStorageContent: string | null = null;

  beforeAll(() => {
    const storageFile = path.resolve(process.cwd(), '.active_chats.json');
    if (fs.existsSync(storageFile)) {
      originalStorageContent = fs.readFileSync(storageFile, 'utf-8');
    }
  });

  afterAll(() => {
    const storageFile = path.resolve(process.cwd(), '.active_chats.json');
    if (originalStorageContent !== null) {
      fs.writeFileSync(storageFile, originalStorageContent, 'utf-8');
    } else if (fs.existsSync(storageFile)) {
      try {
        fs.unlinkSync(storageFile);
      } catch {}
    }
  });
  describe('parseTimeUnit', () => {
    it('should parse minute units correctly', () => {
      const parsed1 = parseTimeUnit('min', 1);
      expect(parsed1.windowMs).toBe(60 * 1000);
      expect(parsed1.unitLabel).toBe('۱ دقیقه');

      const parsed5 = parseTimeUnit('minute', 5);
      expect(parsed5.windowMs).toBe(5 * 60 * 1000);
      expect(parsed5.unitLabel).toBe('5 دقیقه');
    });

    it('should parse hour units correctly', () => {
      const parsed1 = parseTimeUnit('hour', 1);
      expect(parsed1.windowMs).toBe(60 * 60 * 1000);
      expect(parsed1.unitLabel).toBe('۱ ساعت');

      const parsed2 = parseTimeUnit('hours', 2);
      expect(parsed2.windowMs).toBe(2 * 60 * 60 * 1000);
      expect(parsed2.unitLabel).toBe('2 ساعت');
    });

    it('should parse day units correctly', () => {
      const parsed1 = parseTimeUnit('day', 1);
      expect(parsed1.windowMs).toBe(24 * 60 * 60 * 1000);
      expect(parsed1.unitLabel).toBe('۱ روز');

      const parsed3 = parseTimeUnit('days', 3);
      expect(parsed3.windowMs).toBe(3 * 24 * 60 * 60 * 1000);
      expect(parsed3.unitLabel).toBe('3 روز');
    });

    it('should parse second units correctly', () => {
      const parsed10 = parseTimeUnit('sec', 10);
      expect(parsed10.windowMs).toBe(10 * 1000);
      expect(parsed10.unitLabel).toBe('10 ثانیه');
    });
  });

  describe('MediaRateLimiterService', () => {
    let service: MediaRateLimiterService;

    beforeEach(() => {
      service = new MediaRateLimiterService();
    });

    it('should have rate limit and file size limit disabled by default', () => {
      const config = service.getConfig();
      expect(config.rateLimitEnabled).toBe(false);
      expect(config.fileSizeLimitEnabled).toBe(false);

      // Even a huge file is allowed by default
      const hugeFile = 100 * 1024 * 1024;
      expect(service.checkFileSize(hugeFile).allowed).toBe(true);

      // Unlimited uploads allowed by default
      for (let i = 0; i < 20; i++) {
        expect(service.checkRateLimit('u-default').allowed).toBe(true);
        service.recordUpload('u-default');
      }
    });

    it('should enforce 5MB file size limit when fileSizeLimitEnabled is true', () => {
      service.setCustomConfig({
        fileSizeLimitEnabled: true,
        maxFileSizeMB: 5,
        maxFileSizeBytes: 5 * 1024 * 1024,
      });

      const fiveMB = 5 * 1024 * 1024;
      expect(service.checkFileSize(fiveMB).allowed).toBe(true);
      expect(service.checkFileSize(fiveMB - 100).allowed).toBe(true);

      const overLimit = fiveMB + 1;
      const result = service.checkFileSize(overLimit);
      expect(result.allowed).toBe(false);
      expect(result.message).toContain('5 مگابایت');
    });

    it('should enforce rate limits within sliding window', () => {
      service.setCustomConfig({
        rateLimitEnabled: true,
        maxCount: 3,
        windowMs: 60 * 1000,
        unitLabel: '۱ دقیقه',
      });

      const userId = 'user-1';
      const now = 1000000;

      // Upload 1
      expect(service.checkRateLimit(userId, now).allowed).toBe(true);
      service.recordUpload(userId, now);

      // Upload 2
      expect(service.checkRateLimit(userId, now + 5000).allowed).toBe(true);
      service.recordUpload(userId, now + 5000);

      // Upload 3
      expect(service.checkRateLimit(userId, now + 10000).allowed).toBe(true);
      service.recordUpload(userId, now + 10000);

      // Upload 4 (exceeded limit!)
      const fourthCheck = service.checkRateLimit(userId, now + 15000);
      expect(fourthCheck.allowed).toBe(false);
      expect(fourthCheck.message).toContain('3 رسانه در هر ۱ دقیقه');

      // After 61 seconds (first upload expired), upload should be allowed again
      const laterCheck = service.checkRateLimit(userId, now + 61000);
      expect(laterCheck.allowed).toBe(true);
    });

    it('should allow unlimited uploads when rateLimitEnabled is false', () => {
      service.setCustomConfig({
        rateLimitEnabled: false,
        maxCount: 2,
        windowMs: 60 * 1000,
        unitLabel: '۱ دقیقه',
      });

      const userId = 'user-unlimited';
      for (let i = 0; i < 10; i++) {
        expect(service.checkRateLimit(userId).allowed).toBe(true);
        service.recordUpload(userId);
      }
    });

    it('should isolate rate limits per user', () => {
      service.setCustomConfig({
        rateLimitEnabled: true,
        maxCount: 1,
        windowMs: 60 * 1000,
        unitLabel: '۱ دقیقه',
      });

      service.recordUpload('user-A');
      expect(service.checkRateLimit('user-A').allowed).toBe(false);
      expect(service.checkRateLimit('user-B').allowed).toBe(true);
    });
  });

  describe('HandleTelegramMessageUseCase with Media and Rate Limiting', () => {
    let mockUsers: User[] = [];
    let mockChats: Chat[] = [];
    let mockParticipants: ChatParticipant[] = [];
    let mockMessages: Message[] = [];

    let userActiveChatService: UserActiveChatService;
    let rateLimiterService: MediaRateLimiterService;
    let sendMessageUseCase: SendMessageUseCase;
    let handleTelegramMessageUseCase: HandleTelegramMessageUseCase;

    const mockUserRepo = {
      findById: jest.fn(async (id: string) => mockUsers.find((u) => u.id === id) || null),
      findByTelegramUserId: jest.fn(async (tid: string) => mockUsers.find((u) => u.telegramUserId === tid) || null),
    };

    const mockChatRepo = {
      findById: jest.fn(async (id: string) => mockChats.find((c) => c.id === id) || null),
      isParticipant: jest.fn(async (chatId: string, userId: string) => {
        return mockParticipants.some((p) => p.chatId === chatId && p.userId === userId);
      }),
      findUserChats: jest.fn(async (userId: string, _includeHidden: boolean) => {
        const chatIds = mockParticipants.filter((p) => p.userId === userId).map((p) => p.chatId);
        return mockChats.filter((c) => chatIds.includes(c.id));
      }),
      findWithParticipants: jest.fn(async (chatId: string) => {
        const chat = mockChats.find((c) => c.id === chatId);
        if (!chat) return null;
        const participants = mockParticipants.filter((p) => p.chatId === chatId);
        return { chat, participants };
      }),
    };

    const mockMessageRepo = {
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
    };

    beforeEach(() => {
      mockUsers = [];
      mockChats = [];
      mockParticipants = [];
      mockMessages = [];

      const storageFile = path.resolve(process.cwd(), '.active_chats.json');
      if (fs.existsSync(storageFile)) {
        try {
          fs.unlinkSync(storageFile);
        } catch {}
      }

      userActiveChatService = new UserActiveChatService();
      rateLimiterService = new MediaRateLimiterService();
      sendMessageUseCase = new SendMessageUseCase(mockMessageRepo as any, mockChatRepo as any);
      handleTelegramMessageUseCase = new HandleTelegramMessageUseCase(
        mockUserRepo as any,
        mockChatRepo as any,
        sendMessageUseCase,
        userActiveChatService,
        rateLimiterService,
      );
    });

    it('should successfully deliver a sticker and format content correctly', async () => {
      const userA = User.create({ id: 'u-1', telegramUserId: '101', firstName: 'Alice' });
      const userB = User.create({ id: 'u-2', telegramUserId: '102', firstName: 'Bob' });
      mockUsers.push(userA, userB);

      const chat = Chat.create({ id: 'c-1', visibility: ChatVisibility.HIDDEN });
      mockChats.push(chat);
      mockParticipants.push(
        ChatParticipant.create({ id: 'p1', chatId: 'c-1', userId: 'u-1', role: ChatParticipantRole.MEMBER }),
        ChatParticipant.create({ id: 'p2', chatId: 'c-1', userId: 'u-2', role: ChatParticipantRole.MEMBER }),
      );
      userActiveChatService.setActiveChat('u-1', 'c-1');
      userActiveChatService.setActiveChat('u-2', 'c-1');

      const result = await handleTelegramMessageUseCase.execute({
        telegramUserId: '101',
        content: '[استیکر 🐱]',
        mediaType: 'sticker',
        fileId: 'sticker_file_123',
        fileSize: 50000,
        emoji: '🐱',
      });

      expect(result.success).toBe(true);
      expect(result.mediaType).toBe('sticker');
      expect(result.fileId).toBe('sticker_file_123');
      expect(result.recipientTelegramUserId).toBe('102');
      expect(mockMessages.length).toBe(1);
      expect(mockMessages[0].content).toBe('[استیکر 🐱]');
    });

    it('should reject media when file size exceeds 5MB', async () => {
      const userA = User.create({ id: 'u-1', telegramUserId: '101', firstName: 'Alice' });
      const userB = User.create({ id: 'u-2', telegramUserId: '102', firstName: 'Bob' });
      mockUsers.push(userA, userB);

      const chat = Chat.create({ id: 'c-1', visibility: ChatVisibility.HIDDEN });
      mockChats.push(chat);
      mockParticipants.push(
        ChatParticipant.create({ id: 'p1', chatId: 'c-1', userId: 'u-1', role: ChatParticipantRole.MEMBER }),
        ChatParticipant.create({ id: 'p2', chatId: 'c-1', userId: 'u-2', role: ChatParticipantRole.MEMBER }),
      );
      userActiveChatService.setActiveChat('u-1', 'c-1');
      rateLimiterService.setCustomConfig({
        fileSizeLimitEnabled: true,
        maxFileSizeMB: 5,
        maxFileSizeBytes: 5 * 1024 * 1024,
      });

      const sixMB = 6 * 1024 * 1024;
      const result = await handleTelegramMessageUseCase.execute({
        telegramUserId: '101',
        content: '[گیف]',
        mediaType: 'animation',
        fileId: 'gif_file_large',
        fileSize: sixMB,
      });

      expect(result.success).toBe(false);
      expect(result.responseToSender).toContain('5 مگابایت');
      expect(mockMessages.length).toBe(0);
    });

    it('should reject media when rate limit is exceeded', async () => {
      rateLimiterService.setCustomConfig({
        rateLimitEnabled: true,
        maxCount: 2,
        windowMs: 60 * 1000,
        unitLabel: '۱ دقیقه',
      });

      const userA = User.create({ id: 'u-1', telegramUserId: '101', firstName: 'Alice' });
      const userB = User.create({ id: 'u-2', telegramUserId: '102', firstName: 'Bob' });
      mockUsers.push(userA, userB);

      const chat = Chat.create({ id: 'c-1', visibility: ChatVisibility.HIDDEN });
      mockChats.push(chat);
      mockParticipants.push(
        ChatParticipant.create({ id: 'p1', chatId: 'c-1', userId: 'u-1', role: ChatParticipantRole.MEMBER }),
        ChatParticipant.create({ id: 'p2', chatId: 'c-1', userId: 'u-2', role: ChatParticipantRole.MEMBER }),
      );
      userActiveChatService.setActiveChat('u-1', 'c-1');

      // 1st media
      const res1 = await handleTelegramMessageUseCase.execute({
        telegramUserId: '101',
        content: '[استیکر]',
        mediaType: 'sticker',
        fileId: 'st-1',
        fileSize: 1000,
      });
      expect(res1.success).toBe(true);

      // 2nd media
      const res2 = await handleTelegramMessageUseCase.execute({
        telegramUserId: '101',
        content: '[گیف]',
        mediaType: 'animation',
        fileId: 'gif-1',
        fileSize: 2000,
      });
      expect(res2.success).toBe(true);

      // 3rd media (rate limit exceeded!)
      const res3 = await handleTelegramMessageUseCase.execute({
        telegramUserId: '101',
        content: '[ایموجی 🎲]',
        mediaType: 'dice',
        emoji: '🎲',
      });
      expect(res3.success).toBe(false);
      expect(res3.responseToSender).toContain('سقف مجاز ارسال رسانه');
    });

    it('should not consume rate limit if user has no active chat', async () => {
      rateLimiterService.setCustomConfig({
        rateLimitEnabled: true,
        maxCount: 1,
        windowMs: 60 * 1000,
      });

      const userA = User.create({ id: 'u-1', telegramUserId: '101', firstName: 'Alice' });
      mockUsers.push(userA);

      // Alice has no chats
      const res = await handleTelegramMessageUseCase.execute({
        telegramUserId: '101',
        content: '[استیکر]',
        mediaType: 'sticker',
        fileId: 'st-1',
        fileSize: 1000,
      });

      expect(res.success).toBe(false);
      expect(res.responseToSender).toBe(REPLY_TEXTS.NO_ACTIVE_CHAT_RELAY_ERROR);

      // Quota must NOT be consumed
      expect(rateLimiterService.checkRateLimit('u-1').currentCount).toBe(0);
    });
  });

  describe('TelegramBotService Media Event Handling', () => {
    let mockUsers: User[] = [];
    let mockChats: Chat[] = [];
    let mockParticipants: ChatParticipant[] = [];
    let mockMessages: Message[] = [];

    let userActiveChatService: UserActiveChatService;
    let rateLimiterService: MediaRateLimiterService;
    let sendMessageUseCase: SendMessageUseCase;
    let handleTelegramMessageUseCase: HandleTelegramMessageUseCase;
    let getUserActiveChatPartnerUseCase: GetUserActiveChatPartnerUseCase;
    let getUserChatListUseCase: GetUserChatListUseCase;
    let switchUserActiveChatUseCase: SwitchUserActiveChatUseCase;
    let botService: TelegramBotService;

    const mockUserRepo = {
      findById: jest.fn(async (id: string) => mockUsers.find((u) => u.id === id) || null),
      findByTelegramUserId: jest.fn(async (tid: string) => mockUsers.find((u) => u.telegramUserId === tid) || null),
    };

    const mockChatRepo = {
      findById: jest.fn(async (id: string) => mockChats.find((c) => c.id === id) || null),
      isParticipant: jest.fn(async (chatId: string, userId: string) => {
        return mockParticipants.some((p) => p.chatId === chatId && p.userId === userId);
      }),
      findUserChats: jest.fn(async (userId: string, _includeHidden: boolean) => {
        const chatIds = mockParticipants.filter((p) => p.userId === userId).map((p) => p.chatId);
        return mockChats.filter((c) => chatIds.includes(c.id));
      }),
      findWithParticipants: jest.fn(async (chatId: string) => {
        const chat = mockChats.find((c) => c.id === chatId);
        if (!chat) return null;
        const participants = mockParticipants.filter((p) => p.chatId === chatId);
        return { chat, participants };
      }),
    };

    const mockMessageRepo = {
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
    };

    beforeEach(() => {
      mockUsers = [];
      mockChats = [];
      mockParticipants = [];
      mockMessages = [];

      const storageFile = path.resolve(process.cwd(), '.active_chats.json');
      if (fs.existsSync(storageFile)) {
        try {
          fs.unlinkSync(storageFile);
        } catch {}
      }

      userActiveChatService = new UserActiveChatService();
      rateLimiterService = new MediaRateLimiterService();
      sendMessageUseCase = new SendMessageUseCase(mockMessageRepo as any, mockChatRepo as any);
      handleTelegramMessageUseCase = new HandleTelegramMessageUseCase(
        mockUserRepo as any,
        mockChatRepo as any,
        sendMessageUseCase,
        userActiveChatService,
        rateLimiterService,
      );
      getUserActiveChatPartnerUseCase = new GetUserActiveChatPartnerUseCase(
        mockUserRepo as any,
        mockChatRepo as any,
        userActiveChatService,
      );
      getUserChatListUseCase = new GetUserChatListUseCase(
        mockUserRepo as any,
        mockChatRepo as any,
        userActiveChatService,
      );
      switchUserActiveChatUseCase = new SwitchUserActiveChatUseCase(
        mockUserRepo as any,
        mockChatRepo as any,
        userActiveChatService,
      );

      const mockHandleStart = { execute: jest.fn() };

      botService = new TelegramBotService({
        handleStartUseCase: mockHandleStart as any,
        handleMessageUseCase: handleTelegramMessageUseCase,
        getUserActiveChatPartnerUseCase,
        getUserChatListUseCase,
        switchUserActiveChatUseCase,
        messageRepository: mockMessageRepo as any,
        userRepository: mockUserRepo as any,
        userActiveChatService,
        mediaRateLimiterService: rateLimiterService,
        botToken: 'mock_test_token_media',
      });
    });

    it('should handle sticker update from user in active chat', async () => {
      const userA = User.create({ id: 'u-1', telegramUserId: '5001', firstName: 'Alice' });
      const userB = User.create({ id: 'u-2', telegramUserId: '5002', firstName: 'Bob' });
      mockUsers.push(userA, userB);

      const chat = Chat.create({ id: 'c-test', visibility: ChatVisibility.HIDDEN });
      mockChats.push(chat);
      mockParticipants.push(
        ChatParticipant.create({ id: 'p1', chatId: 'c-test', userId: 'u-1', role: ChatParticipantRole.MEMBER }),
        ChatParticipant.create({ id: 'p2', chatId: 'c-test', userId: 'u-2', role: ChatParticipantRole.MEMBER }),
      );
      userActiveChatService.setActiveChat('u-1', 'c-test');
      userActiveChatService.setActiveChat('u-2', 'c-test');

      const stickerUpdate = {
        update_id: 8881,
        message: {
          message_id: 10,
          from: { id: 5001, is_bot: false, first_name: 'Alice' },
          chat: { id: 5001, type: 'private' },
          date: Math.floor(Date.now() / 1000),
          sticker: {
            file_id: 'sticker_cat_999',
            file_unique_id: 'cat_uniq',
            width: 512,
            height: 512,
            is_animated: false,
            is_video: false,
            emoji: '🐱',
            file_size: 25000,
          },
        },
      };

      await expect(botService.handleUpdate(stickerUpdate)).resolves.not.toThrow();
      expect(mockMessages.length).toBe(1);
      expect(mockMessages[0].content).toBe('[استیکر 🐱]');
    });

    it('should handle animation / GIF update from user in active chat', async () => {
      const userA = User.create({ id: 'u-1', telegramUserId: '5001', firstName: 'Alice' });
      const userB = User.create({ id: 'u-2', telegramUserId: '5002', firstName: 'Bob' });
      mockUsers.push(userA, userB);

      const chat = Chat.create({ id: 'c-test', visibility: ChatVisibility.HIDDEN });
      mockChats.push(chat);
      mockParticipants.push(
        ChatParticipant.create({ id: 'p1', chatId: 'c-test', userId: 'u-1', role: ChatParticipantRole.MEMBER }),
        ChatParticipant.create({ id: 'p2', chatId: 'c-test', userId: 'u-2', role: ChatParticipantRole.MEMBER }),
      );
      userActiveChatService.setActiveChat('u-1', 'c-test');
      userActiveChatService.setActiveChat('u-2', 'c-test');

      const gifUpdate = {
        update_id: 8882,
        message: {
          message_id: 11,
          from: { id: 5001, is_bot: false, first_name: 'Alice' },
          chat: { id: 5001, type: 'private' },
          date: Math.floor(Date.now() / 1000),
          animation: {
            file_id: 'gif_funny_123',
            file_unique_id: 'gif_uniq',
            width: 320,
            height: 240,
            duration: 3,
            file_size: 150000,
          },
          caption: 'Dancing cat',
        },
      };

      await expect(botService.handleUpdate(gifUpdate)).resolves.not.toThrow();
      expect(mockMessages.length).toBe(1);
      expect(mockMessages[0].content).toBe('[گیف] Dancing cat');
    });

    it('should handle dice / animated emoji update (🎲)', async () => {
      const userA = User.create({ id: 'u-1', telegramUserId: '5001', firstName: 'Alice' });
      const userB = User.create({ id: 'u-2', telegramUserId: '5002', firstName: 'Bob' });
      mockUsers.push(userA, userB);

      const chat = Chat.create({ id: 'c-test', visibility: ChatVisibility.HIDDEN });
      mockChats.push(chat);
      mockParticipants.push(
        ChatParticipant.create({ id: 'p1', chatId: 'c-test', userId: 'u-1', role: ChatParticipantRole.MEMBER }),
        ChatParticipant.create({ id: 'p2', chatId: 'c-test', userId: 'u-2', role: ChatParticipantRole.MEMBER }),
      );
      userActiveChatService.setActiveChat('u-1', 'c-test');
      userActiveChatService.setActiveChat('u-2', 'c-test');

      const diceUpdate = {
        update_id: 8883,
        message: {
          message_id: 12,
          from: { id: 5001, is_bot: false, first_name: 'Alice' },
          chat: { id: 5001, type: 'private' },
          date: Math.floor(Date.now() / 1000),
          dice: {
            emoji: '🎲',
            value: 6,
          },
        },
      };

      await expect(botService.handleUpdate(diceUpdate)).resolves.not.toThrow();
      expect(mockMessages.length).toBe(1);
      expect(mockMessages[0].content).toBe('[ایموجی 🎲]');
    });
  });
});
