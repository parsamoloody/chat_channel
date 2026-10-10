import { UserActiveChatService } from '../../src/modules/chats/application/user-active-chat.service';
import { GetUserActiveChatPartnerUseCase } from '../../src/modules/chats/application/get-user-active-chat-partner.use-case';
import { GetUserChatListUseCase } from '../../src/modules/chats/application/get-user-chat-list.use-case';
import { SwitchUserActiveChatUseCase } from '../../src/modules/chats/application/switch-user-active-chat.use-case';
import { TerminateChatUseCase } from '../../src/modules/chats/application/terminate-chat.use-case';
import { HandleTelegramMessageUseCase } from '../../src/modules/telegram/application/handle-telegram-message.use-case';
import { SendMessageUseCase } from '../../src/modules/messages/application/send-message.use-case';
import {
  TelegramBotService,
  MAIN_MENU_KEYBOARD,
  ACTIVE_CHAT_KEYBOARD,
  NO_ACTIVE_CHAT_KEYBOARD,
  getMenuKeyboard,
} from '../../src/modules/telegram/infrastructure/telegram-bot.service';
import { HandleTelegramStartUseCase } from '../../src/modules/telegram/application/handle-telegram-start.use-case';
import { User } from '../../src/modules/users/domain/user.entity';
import { Chat } from '../../src/modules/chats/domain/chat.entity';
import { ChatParticipant } from '../../src/modules/chats/domain/chat-participant.entity';
import { Message } from '../../src/modules/messages/domain/message.entity';
import { ChatVisibility, ChatParticipantRole } from '../../src/modules/chats/domain/chat-visibility.enum';
import { MatchStatus } from '../../src/modules/matches/domain/match-status.enum';
import * as fs from 'fs';
import * as path from 'path';

describe('Chat Switching and User Profile View Tests (TASK 1 & TASK 2)', () => {
  let mockUsers: User[] = [];
  let mockChats: Chat[] = [];
  let mockParticipants: ChatParticipant[] = [];
  let mockMessages: Message[] = [];
  let mockMatches: any[] = [];

  let userActiveChatService: UserActiveChatService;
  let getUserActiveChatPartnerUseCase: GetUserActiveChatPartnerUseCase;
  let getUserChatListUseCase: GetUserChatListUseCase;
  let switchUserActiveChatUseCase: SwitchUserActiveChatUseCase;
  let terminateChatUseCase: TerminateChatUseCase;
  let sendMessageUseCase: SendMessageUseCase;
  let handleTelegramMessageUseCase: HandleTelegramMessageUseCase;

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
    findByChatId: jest.fn(async (chatId: string, limit: number, offset: number) => {
      const filtered = mockMessages.filter((m) => m.chatId === chatId);
      return { messages: filtered.slice(offset, offset + limit), total: filtered.length };
    }),
  };

  const mockMatchRepo = {
    findById: jest.fn(async (id: string) => mockMatches.find((m) => m.id === id) || null),
    updateStatus: jest.fn(async (id: string, status: any) => {
      const match = mockMatches.find((m) => m.id === id);
      if (match) match.status = status;
      return match;
    }),
  };

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

  beforeEach(() => {
    mockUsers = [];
    mockChats = [];
    mockParticipants = [];
    mockMessages = [];
    mockMatches = [];

    // Clean up .active_chats.json if exists
    const storageFile = path.resolve(process.cwd(), '.active_chats.json');
    if (fs.existsSync(storageFile)) {
      try {
        fs.unlinkSync(storageFile);
      } catch {}
    }

    userActiveChatService = new UserActiveChatService();
    getUserActiveChatPartnerUseCase = new GetUserActiveChatPartnerUseCase(
      mockUserRepo as any,
      mockChatRepo as any,
      userActiveChatService,
      mockMatchRepo as any,
    );
    getUserChatListUseCase = new GetUserChatListUseCase(
      mockUserRepo as any,
      mockChatRepo as any,
      userActiveChatService,
      mockMatchRepo as any,
    );
    switchUserActiveChatUseCase = new SwitchUserActiveChatUseCase(
      mockUserRepo as any,
      mockChatRepo as any,
      userActiveChatService,
    );
    terminateChatUseCase = new TerminateChatUseCase(
      mockUserRepo as any,
      mockChatRepo as any,
      mockMatchRepo as any,
      userActiveChatService,
    );
    sendMessageUseCase = new SendMessageUseCase(
      mockMessageRepo as any,
      mockChatRepo as any,
    );
    handleTelegramMessageUseCase = new HandleTelegramMessageUseCase(
      mockUserRepo as any,
      mockChatRepo as any,
      sendMessageUseCase,
      userActiveChatService,
    );
  });

  describe('TASK 1: View User Profile (نمایش پروفایل کاربر)', () => {
    it('should return error when user has no active chat or no chats', async () => {
      const userA = await mockUserRepo.create({ telegramUserId: '1001', firstName: 'Alice' });

      const result = await getUserActiveChatPartnerUseCase.execute({ telegramUserId: '1001' });
      expect(result.success).toBe(false);
      expect(result.error).toBe('NO_CHATS');
    });

    it('should return partner user details and full name when user has an active chat', async () => {
      const userA = await mockUserRepo.create({ telegramUserId: '1001', firstName: 'Alice', lastName: 'Ahmadi' });
      const userB = await mockUserRepo.create({ telegramUserId: '1002', firstName: 'Bob', lastName: 'Bahrani' });

      const chat1 = Chat.create({ id: 'chat-1', visibility: ChatVisibility.HIDDEN });
      mockChats.push(chat1);
      mockParticipants.push(
        ChatParticipant.create({ id: 'p1', chatId: chat1.id, userId: userA.id, role: ChatParticipantRole.MEMBER }),
        ChatParticipant.create({ id: 'p2', chatId: chat1.id, userId: userB.id, role: ChatParticipantRole.MEMBER }),
      );

      const result = await getUserActiveChatPartnerUseCase.execute({ telegramUserId: '1001' });
      expect(result.success).toBe(true);
      expect(result.partnerUser?.telegramUserId).toBe('1002');
      expect(result.partnerName).toBe('Bob Bahrani');
      expect(result.chatId).toBe('chat-1');
    });
  });

  describe('TASK 2: Multiple Matches & Chat Switching (چت ها)', () => {
    it('should list all chats with names of matched users', async () => {
      const userA = await mockUserRepo.create({ telegramUserId: '1001', firstName: 'Alice' });
      const userB = await mockUserRepo.create({ telegramUserId: '1002', firstName: 'Bob' });
      const userC = await mockUserRepo.create({ telegramUserId: '1003', firstName: 'Charlie' });

      // Chat 1: Alice & Bob
      const chat1 = Chat.create({ id: 'chat-1', visibility: ChatVisibility.HIDDEN });
      mockChats.push(chat1);
      mockParticipants.push(
        ChatParticipant.create({ id: 'p1', chatId: chat1.id, userId: userA.id, role: ChatParticipantRole.MEMBER }),
        ChatParticipant.create({ id: 'p2', chatId: chat1.id, userId: userB.id, role: ChatParticipantRole.MEMBER }),
      );

      // Chat 2: Alice & Charlie
      const chat2 = Chat.create({ id: 'chat-2', visibility: ChatVisibility.HIDDEN });
      mockChats.push(chat2);
      mockParticipants.push(
        ChatParticipant.create({ id: 'p3', chatId: chat2.id, userId: userA.id, role: ChatParticipantRole.MEMBER }),
        ChatParticipant.create({ id: 'p4', chatId: chat2.id, userId: userC.id, role: ChatParticipantRole.MEMBER }),
      );

      const listResult = await getUserChatListUseCase.execute({ telegramUserId: '1001' });
      expect(listResult.success).toBe(true);
      expect(listResult.chats.length).toBe(2);
      expect(listResult.chats.map((c) => c.partnerName)).toEqual(['Bob', 'Charlie']);
    });

    it('should switch active chat to selected user', async () => {
      const userA = await mockUserRepo.create({ telegramUserId: '1001', firstName: 'Alice' });
      const userB = await mockUserRepo.create({ telegramUserId: '1002', firstName: 'Bob' });
      const userC = await mockUserRepo.create({ telegramUserId: '1003', firstName: 'Charlie' });

      const chat1 = Chat.create({ id: 'chat-1', visibility: ChatVisibility.HIDDEN });
      const chat2 = Chat.create({ id: 'chat-2', visibility: ChatVisibility.HIDDEN });
      mockChats.push(chat1, chat2);
      mockParticipants.push(
        ChatParticipant.create({ id: 'p1', chatId: chat1.id, userId: userA.id, role: ChatParticipantRole.MEMBER }),
        ChatParticipant.create({ id: 'p2', chatId: chat1.id, userId: userB.id, role: ChatParticipantRole.MEMBER }),
        ChatParticipant.create({ id: 'p3', chatId: chat2.id, userId: userA.id, role: ChatParticipantRole.MEMBER }),
        ChatParticipant.create({ id: 'p4', chatId: chat2.id, userId: userC.id, role: ChatParticipantRole.MEMBER }),
      );

      // Alice starts active in chat 1
      userActiveChatService.setActiveChat(userA.id, chat1.id);
      expect(userActiveChatService.getActiveChat(userA.id)).toBe('chat-1');

      // Alice switches to chat 2 (Charlie)
      const switchResult = await switchUserActiveChatUseCase.execute({
        telegramUserId: '1001',
        targetChatId: 'chat-2',
      });
      expect(switchResult.success).toBe(true);
      expect(switchResult.partnerName).toBe('Charlie');
      expect(userActiveChatService.getActiveChat(userA.id)).toBe('chat-2');

      // Profile should now show Charlie instead of Bob
      const profileResult = await getUserActiveChatPartnerUseCase.execute({ telegramUserId: '1001' });
      expect(profileResult.partnerName).toBe('Charlie');
    });

    it('should reject switching to a chat that user is not participant in', async () => {
      const userA = await mockUserRepo.create({ telegramUserId: '1001', firstName: 'Alice' });
      const userB = await mockUserRepo.create({ telegramUserId: '1002', firstName: 'Bob' });
      const userC = await mockUserRepo.create({ telegramUserId: '1003', firstName: 'Charlie' });

      // Chat between Bob and Charlie only
      const chatSecret = Chat.create({ id: 'chat-secret', visibility: ChatVisibility.HIDDEN });
      mockChats.push(chatSecret);
      mockParticipants.push(
        ChatParticipant.create({ id: 'p1', chatId: chatSecret.id, userId: userB.id, role: ChatParticipantRole.MEMBER }),
        ChatParticipant.create({ id: 'p2', chatId: chatSecret.id, userId: userC.id, role: ChatParticipantRole.MEMBER }),
      );

      const switchResult = await switchUserActiveChatUseCase.execute({
        telegramUserId: '1001', // Alice
        targetChatId: 'chat-secret',
      });
      expect(switchResult.success).toBe(false);
      expect(switchResult.error).toBe('UNAUTHORIZED');
    });
  });

  describe('TASK 2: Messaging, Active Chat Routing & Notifications', () => {
    it('should deliver message directly when recipient is active in the same chat', async () => {
      const userA = await mockUserRepo.create({ telegramUserId: '1001', firstName: 'Alice' });
      const userB = await mockUserRepo.create({ telegramUserId: '1002', firstName: 'Bob' });

      const chat1 = Chat.create({ id: 'chat-1', visibility: ChatVisibility.HIDDEN });
      mockChats.push(chat1);
      mockParticipants.push(
        ChatParticipant.create({ id: 'p1', chatId: chat1.id, userId: userA.id, role: ChatParticipantRole.MEMBER }),
        ChatParticipant.create({ id: 'p2', chatId: chat1.id, userId: userB.id, role: ChatParticipantRole.MEMBER }),
      );

      userActiveChatService.setActiveChat(userA.id, chat1.id);
      userActiveChatService.setActiveChat(userB.id, chat1.id);

      const sendResult = await handleTelegramMessageUseCase.execute({
        telegramUserId: '1001',
        content: 'Salam Bob!',
      });

      expect(sendResult.success).toBe(true);
      expect(sendResult.recipientTelegramUserId).toBe('1002');
      expect(sendResult.isRecipientActiveInSameChat).toBe(true);
    });

    it('should indicate recipient is NOT active in same chat when recipient is chatting with another user', async () => {
      const userA = await mockUserRepo.create({ telegramUserId: '1001', firstName: 'Alice' });
      const userB = await mockUserRepo.create({ telegramUserId: '1002', firstName: 'Bob' });
      const userC = await mockUserRepo.create({ telegramUserId: '1003', firstName: 'Charlie' });

      // Chat 1: Alice & Bob
      const chat1 = Chat.create({ id: 'chat-1', visibility: ChatVisibility.HIDDEN });
      // Chat 2: Bob & Charlie
      const chat2 = Chat.create({ id: 'chat-2', visibility: ChatVisibility.HIDDEN });
      mockChats.push(chat1, chat2);

      mockParticipants.push(
        ChatParticipant.create({ id: 'p1', chatId: chat1.id, userId: userA.id, role: ChatParticipantRole.MEMBER }),
        ChatParticipant.create({ id: 'p2', chatId: chat1.id, userId: userB.id, role: ChatParticipantRole.MEMBER }),
        ChatParticipant.create({ id: 'p3', chatId: chat2.id, userId: userB.id, role: ChatParticipantRole.MEMBER }),
        ChatParticipant.create({ id: 'p4', chatId: chat2.id, userId: userC.id, role: ChatParticipantRole.MEMBER }),
      );

      // Alice is in Chat 1 (with Bob)
      userActiveChatService.setActiveChat(userA.id, chat1.id);
      // Bob is currently chatting in Chat 2 with Charlie!
      userActiveChatService.setActiveChat(userB.id, chat2.id);

      // Alice sends a message to Bob
      const sendResult = await handleTelegramMessageUseCase.execute({
        telegramUserId: '1001',
        content: 'Hello Bob, where are you?',
      });

      expect(sendResult.success).toBe(true);
      expect(sendResult.recipientTelegramUserId).toBe('1002');
      expect(sendResult.senderName).toBe('Alice');
      // Recipient Bob is in chat 2, so NOT active in chat 1
      expect(sendResult.isRecipientActiveInSameChat).toBe(false);
      expect(sendResult.chatId).toBe('chat-1');
    });
  });

  describe('TelegramBotService End-to-End Handlers', () => {
    let botService: TelegramBotService;
    let mockHandleStart: any;

    beforeEach(() => {
      mockHandleStart = {
        execute: jest.fn(async () => ({
          status: 'CONNECTED',
          message: 'Connected to chat!',
        })),
      };

      botService = new TelegramBotService(
        mockHandleStart,
        handleTelegramMessageUseCase,
        getUserActiveChatPartnerUseCase,
        getUserChatListUseCase,
        switchUserActiveChatUseCase,
        mockMessageRepo as any,
        mockUserRepo as any,
        terminateChatUseCase,
        userActiveChatService,
      );
    });

    it('should have main menu keyboard with "نمایش پروفایل کاربر" and "چت ها"', () => {
      expect(MAIN_MENU_KEYBOARD).toBeDefined();
      const keyboardObj = JSON.parse(JSON.stringify(MAIN_MENU_KEYBOARD));
      expect(keyboardObj.keyboard[0][0].text).toBe('نمایش پروفایل کاربر');
      expect(keyboardObj.keyboard[0][1].text).toBe('چت ها');
    });

    it('should handle button click "نمایش پروفایل کاربر" via update', async () => {
      const userA = await mockUserRepo.create({ telegramUserId: '777001', firstName: 'Alice' });
      const userB = await mockUserRepo.create({ telegramUserId: '777002', firstName: 'Bob', lastName: 'Marley' });

      const chat = Chat.create({ id: 'chat-test', visibility: ChatVisibility.HIDDEN });
      mockChats.push(chat);
      mockParticipants.push(
        ChatParticipant.create({ id: 'p1', chatId: chat.id, userId: userA.id, role: ChatParticipantRole.MEMBER }),
        ChatParticipant.create({ id: 'p2', chatId: chat.id, userId: userB.id, role: ChatParticipantRole.MEMBER }),
      );
      userActiveChatService.setActiveChat(userA.id, chat.id);

      const update = {
        update_id: 9901,
        message: {
          message_id: 1,
          from: { id: 777001, is_bot: false, first_name: 'Alice' },
          chat: { id: 777001, type: 'private' },
          date: Math.floor(Date.now() / 1000),
          text: 'نمایش پروفایل کاربر',
        },
      };

      // Should execute without errors and not relay as a chat message
      await expect(botService.handleUpdate(update)).resolves.not.toThrow();
      expect(mockMessages.length).toBe(0); // Not saved as a chat message!
    });

    it('should handle button click "چت ها" via update and not forward as a text message', async () => {
      const userA = await mockUserRepo.create({ telegramUserId: '777001', firstName: 'Alice' });
      const userB = await mockUserRepo.create({ telegramUserId: '777002', firstName: 'Bob' });

      const chat = Chat.create({ id: 'chat-test', visibility: ChatVisibility.HIDDEN });
      mockChats.push(chat);
      mockParticipants.push(
        ChatParticipant.create({ id: 'p1', chatId: chat.id, userId: userA.id, role: ChatParticipantRole.MEMBER }),
        ChatParticipant.create({ id: 'p2', chatId: chat.id, userId: userB.id, role: ChatParticipantRole.MEMBER }),
      );
      userActiveChatService.setActiveChat(userA.id, chat.id);

      const update = {
        update_id: 9902,
        message: {
          message_id: 2,
          from: { id: 777001, is_bot: false, first_name: 'Alice' },
          chat: { id: 777001, type: 'private' },
          date: Math.floor(Date.now() / 1000),
          text: 'چت ها',
        },
      };

      await expect(botService.handleUpdate(update)).resolves.not.toThrow();
      expect(mockMessages.length).toBe(0); // Not saved as a chat message!
    });

    it('should handle switch_chat callback query to switch active conversation', async () => {
      const userA = await mockUserRepo.create({ telegramUserId: '777001', firstName: 'Alice' });
      const userB = await mockUserRepo.create({ telegramUserId: '777002', firstName: 'Bob' });
      const userC = await mockUserRepo.create({ telegramUserId: '777003', firstName: 'Charlie' });

      const chat1 = Chat.create({ id: 'c-1', visibility: ChatVisibility.HIDDEN });
      const chat2 = Chat.create({ id: 'c-2', visibility: ChatVisibility.HIDDEN });
      mockChats.push(chat1, chat2);
      mockParticipants.push(
        ChatParticipant.create({ id: 'p1', chatId: chat1.id, userId: userA.id, role: ChatParticipantRole.MEMBER }),
        ChatParticipant.create({ id: 'p2', chatId: chat1.id, userId: userB.id, role: ChatParticipantRole.MEMBER }),
        ChatParticipant.create({ id: 'p3', chatId: chat2.id, userId: userA.id, role: ChatParticipantRole.MEMBER }),
        ChatParticipant.create({ id: 'p4', chatId: chat2.id, userId: userC.id, role: ChatParticipantRole.MEMBER }),
      );
      userActiveChatService.setActiveChat(userA.id, chat1.id);

      const callbackUpdate = {
        update_id: 9903,
        callback_query: {
          id: 'cb-1',
          from: { id: 777001, is_bot: false, first_name: 'Alice' },
          message: {
            message_id: 3,
            chat: { id: 777001, type: 'private' },
            date: Math.floor(Date.now() / 1000),
            text: 'یک پیام از کاربر Charlie دارید',
          },
          data: 'switch_chat:c-2',
        },
      };

      await expect(botService.handleUpdate(callbackUpdate)).resolves.not.toThrow();
      expect(userActiveChatService.getActiveChat(userA.id)).toBe('c-2');
    });
  });

  describe('TASK 1 & TASK 2: Terminate Chat & Dynamic Keyboards', () => {
    let botService: TelegramBotService;
    let mockHandleStart: any;

    beforeEach(() => {
      mockHandleStart = {
        execute: jest.fn(async () => ({
          status: 'CONNECTED',
          message: 'Connected to chat!',
          chatId: 'c-1',
        })),
      };

      botService = new TelegramBotService(
        mockHandleStart,
        handleTelegramMessageUseCase,
        getUserActiveChatPartnerUseCase,
        getUserChatListUseCase,
        switchUserActiveChatUseCase,
        mockMessageRepo as any,
        mockUserRepo as any,
        terminateChatUseCase,
        userActiveChatService,
      );
    });

    describe('Keyboard layouts and display rules', () => {
      it('ACTIVE_CHAT_KEYBOARD should have row 1: [نمایش پروفایل کاربر, چت ها] and row 2 full-width: [پایان چت]', () => {
        const keyboardObj = JSON.parse(JSON.stringify(ACTIVE_CHAT_KEYBOARD));
        expect(keyboardObj.keyboard.length).toBe(2);
        // Row 1: display user profile and list chats
        expect(keyboardObj.keyboard[0].length).toBe(2);
        expect(keyboardObj.keyboard[0][0].text).toBe('نمایش پروفایل کاربر');
        expect(keyboardObj.keyboard[0][1].text).toBe('چت ها');
        // Row 2: full-width terminate chat button
        expect(keyboardObj.keyboard[1].length).toBe(1);
        expect(keyboardObj.keyboard[1][0].text).toBe('پایان چت');
      });

      it('NO_ACTIVE_CHAT_KEYBOARD should only have [چت ها] and omit profile and terminate buttons', () => {
        const keyboardObj = JSON.parse(JSON.stringify(NO_ACTIVE_CHAT_KEYBOARD));
        expect(keyboardObj.keyboard.length).toBe(1);
        expect(keyboardObj.keyboard[0].length).toBe(1);
        expect(keyboardObj.keyboard[0][0].text).toBe('چت ها');

        // Verify neither "نمایش پروفایل کاربر" nor "پایان چت" is present
        const allButtons = keyboardObj.keyboard.flat().map((b: any) => b.text);
        expect(allButtons).not.toContain('نمایش پروفایل کاربر');
        expect(allButtons).not.toContain('پایان چت');
      });

      it('getMenuKeyboard helper returns correct keyboard based on active chat state', () => {
        expect(getMenuKeyboard(true)).toBe(ACTIVE_CHAT_KEYBOARD);
        expect(getMenuKeyboard(false)).toBe(NO_ACTIVE_CHAT_KEYBOARD);
      });
    });

    describe('TerminateChatUseCase Domain Logic', () => {
      it('should successfully terminate chat, cancel match, and mark chat as terminated', async () => {
        const userA = await mockUserRepo.create({ telegramUserId: '888001', firstName: 'Alice' });
        const userB = await mockUserRepo.create({ telegramUserId: '888002', firstName: 'Bob' });

        const match = { id: 'm-1', externalMatchId: 'cupid_1', status: MatchStatus.ACTIVE };
        mockMatches.push(match);

        const chat = Chat.create({ id: 'c-1', matchId: 'm-1', visibility: ChatVisibility.HIDDEN });
        mockChats.push(chat);
        mockParticipants.push(
          ChatParticipant.create({ id: 'p1', chatId: chat.id, userId: userA.id, role: ChatParticipantRole.MEMBER }),
          ChatParticipant.create({ id: 'p2', chatId: chat.id, userId: userB.id, role: ChatParticipantRole.MEMBER }),
        );

        userActiveChatService.setActiveChat(userA.id, chat.id);
        userActiveChatService.setActiveChat(userB.id, chat.id);

        const result = await terminateChatUseCase.execute({
          telegramUserId: '888001',
          chatId: 'c-1',
        });

        expect(result.success).toBe(true);
        expect(result.partnerName).toBe('Bob');
        expect(result.partnerTelegramUserId).toBe('888002');
        expect(result.terminatorName).toBe('Alice');
        expect(result.terminatorTelegramUserId).toBe('888001');

        // Match should be cancelled
        expect(match.status).toBe(MatchStatus.CANCELLED);

        // Active chats cleared for both users
        expect(userActiveChatService.getActiveChat(userA.id)).toBeUndefined();
        expect(userActiveChatService.getActiveChat(userB.id)).toBeUndefined();

        // Chat is marked terminated
        expect(userActiveChatService.isChatTerminated('c-1')).toBe(true);

        // Terminated chat must not appear in user chat list
        const chatList = await getUserChatListUseCase.execute({ telegramUserId: '888001' });
        expect(chatList.chats.length).toBe(0);
      });

      it('should fail if user is not a participant in the chat', async () => {
        const userA = await mockUserRepo.create({ telegramUserId: '888001', firstName: 'Alice' });
        const userB = await mockUserRepo.create({ telegramUserId: '888002', firstName: 'Bob' });
        const userC = await mockUserRepo.create({ telegramUserId: '888003', firstName: 'Charlie' });

        const chat = Chat.create({ id: 'c-secret', visibility: ChatVisibility.HIDDEN });
        mockChats.push(chat);
        mockParticipants.push(
          ChatParticipant.create({ id: 'p1', chatId: chat.id, userId: userA.id, role: ChatParticipantRole.MEMBER }),
          ChatParticipant.create({ id: 'p2', chatId: chat.id, userId: userB.id, role: ChatParticipantRole.MEMBER }),
        );

        const result = await terminateChatUseCase.execute({
          telegramUserId: '888003', // Charlie
          chatId: 'c-secret',
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe('NOT_PARTICIPANT');
      });
    });

    describe('Telegram Bot Flow for Ending Chat (پایان چت)', () => {
      it('should inform user if they click "پایان چت" while having no active chat', async () => {
        await mockUserRepo.create({ telegramUserId: '999001', firstName: 'Alice' });

        const update = {
          update_id: 10001,
          message: {
            message_id: 101,
            from: { id: 999001, is_bot: false, first_name: 'Alice' },
            chat: { id: 999001, type: 'private' },
            date: Math.floor(Date.now() / 1000),
            text: 'پایان چت',
          },
        };

        await expect(botService.handleUpdate(update)).resolves.not.toThrow();
      });

      it('should prompt confirmation with [name] and two buttons (بله، مطمئنم / خیر) when active chat exists', async () => {
        const userA = await mockUserRepo.create({ telegramUserId: '999001', firstName: 'Alice' });
        const userB = await mockUserRepo.create({ telegramUserId: '999002', firstName: 'Bob' });

        const chat = Chat.create({ id: 'c-active', visibility: ChatVisibility.HIDDEN });
        mockChats.push(chat);
        mockParticipants.push(
          ChatParticipant.create({ id: 'p1', chatId: chat.id, userId: userA.id, role: ChatParticipantRole.MEMBER }),
          ChatParticipant.create({ id: 'p2', chatId: chat.id, userId: userB.id, role: ChatParticipantRole.MEMBER }),
        );
        userActiveChatService.setActiveChat(userA.id, chat.id);

        const update = {
          update_id: 10002,
          message: {
            message_id: 102,
            from: { id: 999001, is_bot: false, first_name: 'Alice' },
            chat: { id: 999001, type: 'private' },
            date: Math.floor(Date.now() / 1000),
            text: 'پایان چت',
          },
        };

        await expect(botService.handleUpdate(update)).resolves.not.toThrow();
      });

      it('should handle cancel_terminate callback query without ending the chat', async () => {
        const userA = await mockUserRepo.create({ telegramUserId: '999001', firstName: 'Alice' });
        const userB = await mockUserRepo.create({ telegramUserId: '999002', firstName: 'Bob' });

        const chat = Chat.create({ id: 'c-active', visibility: ChatVisibility.HIDDEN });
        mockChats.push(chat);
        mockParticipants.push(
          ChatParticipant.create({ id: 'p1', chatId: chat.id, userId: userA.id, role: ChatParticipantRole.MEMBER }),
          ChatParticipant.create({ id: 'p2', chatId: chat.id, userId: userB.id, role: ChatParticipantRole.MEMBER }),
        );
        userActiveChatService.setActiveChat(userA.id, chat.id);

        const cancelUpdate = {
          update_id: 10003,
          callback_query: {
            id: 'cb-cancel',
            from: { id: 999001, is_bot: false, first_name: 'Alice' },
            message: {
              message_id: 103,
              chat: { id: 999001, type: 'private' },
              date: Math.floor(Date.now() / 1000),
              text: 'آیا مطمئن هستید که می‌خواهید چت با Bob را پایان دهید؟',
            },
            data: 'cancel_terminate',
          },
        };

        await expect(botService.handleUpdate(cancelUpdate)).resolves.not.toThrow();
        // Chat is still active
        expect(userActiveChatService.getActiveChat(userA.id)).toBe('c-active');
      });

      it('should terminate chat, notify both users, and auto-switch if user has exactly 1 other chat', async () => {
        const userA = await mockUserRepo.create({ telegramUserId: '999001', firstName: 'Alice' });
        const userB = await mockUserRepo.create({ telegramUserId: '999002', firstName: 'Bob' });
        const userC = await mockUserRepo.create({ telegramUserId: '999003', firstName: 'Charlie' });

        // Chat 1: Alice & Bob (active)
        const chat1 = Chat.create({ id: 'c-1', visibility: ChatVisibility.HIDDEN });
        // Chat 2: Alice & Charlie (other chat)
        const chat2 = Chat.create({ id: 'c-2', visibility: ChatVisibility.HIDDEN });
        mockChats.push(chat1, chat2);
        mockParticipants.push(
          ChatParticipant.create({ id: 'p1', chatId: chat1.id, userId: userA.id, role: ChatParticipantRole.MEMBER }),
          ChatParticipant.create({ id: 'p2', chatId: chat1.id, userId: userB.id, role: ChatParticipantRole.MEMBER }),
          ChatParticipant.create({ id: 'p3', chatId: chat2.id, userId: userA.id, role: ChatParticipantRole.MEMBER }),
          ChatParticipant.create({ id: 'p4', chatId: chat2.id, userId: userC.id, role: ChatParticipantRole.MEMBER }),
        );
        userActiveChatService.setActiveChat(userA.id, chat1.id);
        userActiveChatService.setActiveChat(userB.id, chat1.id);

        const confirmUpdate = {
          update_id: 10004,
          callback_query: {
            id: 'cb-confirm',
            from: { id: 999001, is_bot: false, first_name: 'Alice' },
            message: {
              message_id: 104,
              chat: { id: 999001, type: 'private' },
              date: Math.floor(Date.now() / 1000),
              text: 'آیا مطمئن هستید که می‌خواهید چت با Bob را پایان دهید؟',
            },
            data: 'confirm_terminate:c-1',
          },
        };

        await expect(botService.handleUpdate(confirmUpdate)).resolves.not.toThrow();

        // Alice had 1 remaining chat (with Charlie, c-2), so Alice was auto-switched to c-2!
        expect(userActiveChatService.getActiveChat(userA.id)).toBe('c-2');

        // Bob had 0 remaining chats, so Bob's active chat is cleared!
        expect(userActiveChatService.getActiveChat(userB.id)).toBeUndefined();
      });

      it('should terminate chat and display chat list when user has more than 1 other chat', async () => {
        const userA = await mockUserRepo.create({ telegramUserId: '999001', firstName: 'Alice' });
        const userB = await mockUserRepo.create({ telegramUserId: '999002', firstName: 'Bob' });
        const userC = await mockUserRepo.create({ telegramUserId: '999003', firstName: 'Charlie' });
        const userD = await mockUserRepo.create({ telegramUserId: '999004', firstName: 'David' });

        // Chat 1: Alice & Bob (active)
        const chat1 = Chat.create({ id: 'c-1', visibility: ChatVisibility.HIDDEN });
        // Chat 2: Alice & Charlie
        const chat2 = Chat.create({ id: 'c-2', visibility: ChatVisibility.HIDDEN });
        // Chat 3: Alice & David
        const chat3 = Chat.create({ id: 'c-3', visibility: ChatVisibility.HIDDEN });
        mockChats.push(chat1, chat2, chat3);
        mockParticipants.push(
          ChatParticipant.create({ id: 'p1', chatId: chat1.id, userId: userA.id, role: ChatParticipantRole.MEMBER }),
          ChatParticipant.create({ id: 'p2', chatId: chat1.id, userId: userB.id, role: ChatParticipantRole.MEMBER }),
          ChatParticipant.create({ id: 'p3', chatId: chat2.id, userId: userA.id, role: ChatParticipantRole.MEMBER }),
          ChatParticipant.create({ id: 'p4', chatId: chat2.id, userId: userC.id, role: ChatParticipantRole.MEMBER }),
          ChatParticipant.create({ id: 'p5', chatId: chat3.id, userId: userA.id, role: ChatParticipantRole.MEMBER }),
          ChatParticipant.create({ id: 'p6', chatId: chat3.id, userId: userD.id, role: ChatParticipantRole.MEMBER }),
        );
        userActiveChatService.setActiveChat(userA.id, chat1.id);

        const confirmUpdate = {
          update_id: 10005,
          callback_query: {
            id: 'cb-confirm-multi',
            from: { id: 999001, is_bot: false, first_name: 'Alice' },
            message: {
              message_id: 105,
              chat: { id: 999001, type: 'private' },
              date: Math.floor(Date.now() / 1000),
              text: 'آیا مطمئن هستید که می‌خواهید چت با Bob را پایان دهید؟',
            },
            data: 'confirm_terminate:c-1',
          },
        };

        await expect(botService.handleUpdate(confirmUpdate)).resolves.not.toThrow();

        // Alice had 2 remaining chats (> 1), so Alice is NOT auto-switched; active chat is cleared waiting for selection
        expect(userActiveChatService.getActiveChat(userA.id)).toBeUndefined();

        // Alice can then click on one of the chats in the list
        const selectUpdate = {
          update_id: 10006,
          callback_query: {
            id: 'cb-select-chat',
            from: { id: 999001, is_bot: false, first_name: 'Alice' },
            message: {
              message_id: 106,
              chat: { id: 999001, type: 'private' },
              date: Math.floor(Date.now() / 1000),
              text: '📋 چت‌های شما:',
            },
            data: 'switch_chat:c-3',
          },
        };
        await expect(botService.handleUpdate(selectUpdate)).resolves.not.toThrow();
        expect(userActiveChatService.getActiveChat(userA.id)).toBe('c-3');
      });
    });
  });
});

