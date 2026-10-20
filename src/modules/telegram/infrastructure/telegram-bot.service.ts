import { Bot, Context, Keyboard, InlineKeyboard } from 'grammy';
import { Logger } from '../../../shared/infrastructure/logger';
import { HandleTelegramStartUseCase } from '../application/handle-telegram-start.use-case';
import { HandleTelegramMessageUseCase } from '../application/handle-telegram-message.use-case';
import { GetUserActiveChatPartnerUseCase } from '../../chats/application/get-user-active-chat-partner.use-case';
import { GetUserChatListUseCase } from '../../chats/application/get-user-chat-list.use-case';
import { SwitchUserActiveChatUseCase } from '../../chats/application/switch-user-active-chat.use-case';
import { TerminateChatUseCase } from '../../chats/application/terminate-chat.use-case';
import { UserActiveChatService } from '../../chats/application/user-active-chat.service';
import { IMessageRepository } from '../../messages/domain/message.repository.interface';
import { IUserRepository } from '../../users/domain/user.repository.interface';
import { getEnvConfig, setBotUsername } from '../../../shared/infrastructure/config/env.config';

export const ACTIVE_CHAT_KEYBOARD = new Keyboard()
  .text('نمایش پروفایل کاربر')
  .text('چت ها')
  .row()
  .text('پایان چت')
  .resized();

export const NO_ACTIVE_CHAT_KEYBOARD = new Keyboard()
  .text('چت ها')
  .resized();

export const MAIN_MENU_KEYBOARD = ACTIVE_CHAT_KEYBOARD;

export function getMenuKeyboard(hasActiveChat: boolean): Keyboard {
  return hasActiveChat ? ACTIVE_CHAT_KEYBOARD : NO_ACTIVE_CHAT_KEYBOARD;
}

export interface TelegramBotServiceDeps {
  handleStartUseCase: HandleTelegramStartUseCase;
  handleMessageUseCase: HandleTelegramMessageUseCase;
  getUserActiveChatPartnerUseCase: GetUserActiveChatPartnerUseCase;
  getUserChatListUseCase: GetUserChatListUseCase;
  switchUserActiveChatUseCase: SwitchUserActiveChatUseCase;
  terminateChatUseCase?: TerminateChatUseCase;
  userRepository?: IUserRepository;
  messageRepository?: IMessageRepository;
  userActiveChatService?: UserActiveChatService;
  botToken?: string;
}

export class TelegramBotService {
  private readonly logger = new Logger(TelegramBotService.name);
  private bot: Bot<Context>;

  private readonly handleStartUseCase: HandleTelegramStartUseCase;
  private readonly handleMessageUseCase: HandleTelegramMessageUseCase;
  private readonly getUserActiveChatPartnerUseCase: GetUserActiveChatPartnerUseCase;
  private readonly getUserChatListUseCase: GetUserChatListUseCase;
  private readonly switchUserActiveChatUseCase: SwitchUserActiveChatUseCase;
  private readonly terminateChatUseCase?: TerminateChatUseCase;
  private readonly userRepository?: IUserRepository;
  private readonly messageRepository?: IMessageRepository;
  private readonly userActiveChatService?: UserActiveChatService;

  constructor(
    depsOrHandleStart: TelegramBotServiceDeps | HandleTelegramStartUseCase,
    handleMessageUseCase?: HandleTelegramMessageUseCase,
    getUserActiveChatPartnerUseCase?: GetUserActiveChatPartnerUseCase,
    getUserChatListUseCase?: GetUserChatListUseCase,
    switchUserActiveChatUseCase?: SwitchUserActiveChatUseCase,
    messageRepository?: IMessageRepository,
    userRepository?: IUserRepository,
    terminateChatUseCase?: TerminateChatUseCase,
    userActiveChatService?: UserActiveChatService,
    botToken?: string,
  ) {
    let token: string;

    if ('handleStartUseCase' in depsOrHandleStart) {
      const deps = depsOrHandleStart as TelegramBotServiceDeps;
      this.handleStartUseCase = deps.handleStartUseCase;
      this.handleMessageUseCase = deps.handleMessageUseCase;
      this.getUserActiveChatPartnerUseCase = deps.getUserActiveChatPartnerUseCase;
      this.getUserChatListUseCase = deps.getUserChatListUseCase;
      this.switchUserActiveChatUseCase = deps.switchUserActiveChatUseCase;
      this.terminateChatUseCase = deps.terminateChatUseCase;
      this.userRepository = deps.userRepository;
      this.messageRepository = deps.messageRepository;
      this.userActiveChatService = deps.userActiveChatService;
      token = deps.botToken ?? getEnvConfig().TELEGRAM_BOT_TOKEN;
    } else {
      this.handleStartUseCase = depsOrHandleStart;
      this.handleMessageUseCase = handleMessageUseCase!;
      this.getUserActiveChatPartnerUseCase = getUserActiveChatPartnerUseCase!;
      this.getUserChatListUseCase = getUserChatListUseCase!;
      this.switchUserActiveChatUseCase = switchUserActiveChatUseCase!;
      this.messageRepository = messageRepository;
      this.userRepository = userRepository;
      this.terminateChatUseCase = terminateChatUseCase;
      this.userActiveChatService = userActiveChatService;
      token = botToken ?? getEnvConfig().TELEGRAM_BOT_TOKEN;
    }

    this.bot = new Bot<Context>(token, {
      botInfo: {
        id: 100000000,
        is_bot: true,
        first_name: 'ChatBot',
        username: 'chat_bot',
        can_join_groups: false,
        can_read_all_group_messages: false,
        supports_inline_queries: false,
      } as any,
    });

    // In test environment or with mock token, mock outgoing Telegram API calls
    this.bot.api.config.use(async (prev, method, payload, signal) => {
      if (process.env.NODE_ENV === 'test' || token.startsWith('mock_')) {
        if (method === 'getUserProfilePhotos') {
          return {
            ok: true,
            result: {
              total_count: 1,
              photos: [[{ file_id: 'mock_profile_photo_123', width: 320, height: 320, file_size: 1000 }]],
            } as any,
          } as any;
        }
        if (method === 'sendPhoto') {
          return {
            ok: true,
            result: {
              message_id: Math.floor(Math.random() * 100000),
              date: Math.floor(Date.now() / 1000),
              chat: { id: (payload as any)?.chat_id ?? 1, type: 'private' },
              photo: [{ file_id: (payload as any)?.photo ?? 'mock_photo', width: 320, height: 320 }],
              caption: (payload as any)?.caption ?? '',
            } as any,
          } as any;
        }
        return {
          ok: true,
          result: {
            message_id: Math.floor(Math.random() * 100000),
            date: Math.floor(Date.now() / 1000),
            chat: { id: (payload as any)?.chat_id ?? 1, type: 'private' },
            text: (payload as any)?.text ?? '',
          } as any,
        } as any;
      }
      return prev(method, payload, signal);
    });

    this.setupHandlers();
  }

  private setupHandlers() {
    // 1. /start command with deep-link payload
    this.bot.command('start', async (ctx) => {
      await this.processStartCommand(ctx);
    });

    // 2. Fallback text handler for /start without entities (e.g. simulated webhooks)
    this.bot.hears(/^\/start(\s+.*)?$/, async (ctx) => {
      await this.processStartCommand(ctx);
    });

    // 3. Command helpers for profile, chats, terminate, menu
    this.bot.command('profile', async (ctx) => {
      await this.handleShowProfile(ctx);
    });

    this.bot.command('chats', async (ctx) => {
      await this.handleListChats(ctx);
    });

    this.bot.command('terminate', async (ctx) => {
      await this.handleTerminateChatPrompt(ctx);
    });

    this.bot.command('menu', async (ctx) => {
      const from = ctx.from;
      let hasActiveChat = false;
      if (from) {
        hasActiveChat = await this.isUserInActiveChat(String(from.id));
      }
      await ctx.reply('منوی چت:', { reply_markup: getMenuKeyboard(hasActiveChat) });
    });

    // 4. Callback query for switching chats: switch_chat:<chatId>
    this.bot.callbackQuery(/^switch_chat:(.+)$/, async (ctx) => {
      await this.handleSwitchChatCallback(ctx);
    });

    // Callback query for closing the chat list
    this.bot.callbackQuery('close_chat_list', async (ctx) => {
      await ctx.deleteMessage().catch(() => {});
      await ctx.answerCallbackQuery().catch(() => {});
    });

    // Callback queries for chat termination
    this.bot.callbackQuery(/^confirm_terminate:(.+)$/, async (ctx) => {
      await this.handleConfirmTerminateCallback(ctx);
    });

    this.bot.callbackQuery('cancel_terminate', async (ctx) => {
      await ctx.answerCallbackQuery({ text: 'عملیات پایان چت لغو شد.' }).catch(() => {});
      await ctx.deleteMessage().catch(() => {});
    });

    // 5. Message handler: checks for Persian menu buttons first, then relays chat messages
    this.bot.on('message:text', async (ctx) => {
      if (ctx.message.text.startsWith('/')) return; // Ignore slash commands

      const text = ctx.message.text.trim();

      if (text === 'نمایش پروفایل کاربر') {
        await this.handleShowProfile(ctx);
        return;
      }

      if (text === 'چت ها') {
        await this.handleListChats(ctx);
        return;
      }

      if (text === 'پایان چت') {
        await this.handleTerminateChatPrompt(ctx);
        return;
      }

      const from = ctx.from;
      if (!from) return;

      const telegramUserId = String(from.id);
      try {
        const result = await this.handleMessageUseCase.execute({
          telegramUserId,
          content: ctx.message.text,
        });

        if (result.success && result.recipientTelegramUserId) {
          try {
            if (result.isRecipientActiveInSameChat) {
              await this.bot.api.sendMessage(
                result.recipientTelegramUserId,
                `💬 ${ctx.message.text}`,
              );
            } else {
              const switchKeyboard = new InlineKeyboard().text(
                `💬 رفتن به چت با ${result.senderName}`,
                `switch_chat:${result.chatId}`,
              );

              await this.bot.api.sendMessage(
                result.recipientTelegramUserId,
                `یک پیام از کاربر ${result.senderName} دارید`,
                {
                  reply_markup: switchKeyboard,
                },
              );
            }
          } catch (relayErr: any) {
            this.logger.warn(`Could not relay message to ${result.recipientTelegramUserId}: ${relayErr.message}`);
          }
        } else if (!result.success && result.responseToSender) {
          await ctx.reply(result.responseToSender, { reply_markup: NO_ACTIVE_CHAT_KEYBOARD });
        }
      } catch (err: any) {
        this.logger.error(`Error handling message: ${err.message}`, err.stack);
      }
    });
  }

  private async isUserInActiveChat(telegramUserId: string): Promise<boolean> {
    try {
      const partnerRes = await this.getUserActiveChatPartnerUseCase.execute({ telegramUserId });
      return partnerRes.success && !!partnerRes.partnerUser;
    } catch {
      return false;
    }
  }

  private async processStartCommand(ctx: Context) {
    const from = ctx.from;
    if (!from) return;

    const telegramUserId = String(from.id);
    const text = ctx.message?.text ?? '';
    const textAfterStart = text.replace(/^\/start(@\w+)?/, '').trim();
    const startPayload =
      (ctx as any).match && typeof (ctx as any).match === 'string' && (ctx as any).match.trim() !== ''
        ? (ctx as any).match.trim()
        : textAfterStart !== ''
        ? textAfterStart
        : null;

    try {
      const result = await this.handleStartUseCase.execute({
        telegramUserId,
        username: from.username ?? null,
        firstName: from.first_name ?? null,
        lastName: from.last_name ?? null,
        startPayload,
      });

      const hasActiveChat = result.status === 'CONNECTED' && !!result.chatId;

      await ctx.reply(result.message, { reply_markup: getMenuKeyboard(hasActiveChat) });

      if (result.notifyPartnerTelegramUserId) {
        try {
          await this.bot.api.sendMessage(
            result.notifyPartnerTelegramUserId,
            '🎉 هم‌صحبت شما با کلید مشترک به چت پیوست! گفتگو آغاز شد.',
            { reply_markup: ACTIVE_CHAT_KEYBOARD },
          );
        } catch (notifyErr: any) {
          this.logger.warn(`Could not notify partner ${result.notifyPartnerTelegramUserId}: ${notifyErr.message}`);
        }
      }
    } catch (err: any) {
      this.logger.error(`Error in /start command: ${err.message}`, err.stack);
      await ctx.reply('خطایی رخ داد. لطفاً دوباره تلاش کنید.', {
        reply_markup: NO_ACTIVE_CHAT_KEYBOARD,
      });
    }
  }

  private async handleShowProfile(ctx: Context) {
    const from = ctx.from;
    if (!from) return;

    const telegramUserId = String(from.id);
    try {
      const result = await this.getUserActiveChatPartnerUseCase.execute({ telegramUserId });

      if (!result.success || !result.partnerUser) {
        await ctx.reply(
          'شما در حال حاضر در هیچ چت فعالی نیستید. لطفاً ابتدا از دکمه «چت ها» یک گفتگو را انتخاب کنید.',
          { reply_markup: NO_ACTIVE_CHAT_KEYBOARD },
        );
        return;
      }

      const partnerName = result.partnerName!;
      const partnerTgId = Number(result.partnerUser.telegramUserId);

      try {
        const photos = await this.bot.api.getUserProfilePhotos(partnerTgId, { limit: 1 });
        if (photos && photos.total_count > 0 && photos.photos.length > 0 && photos.photos[0].length > 0) {
          const highestResPhoto = photos.photos[0][photos.photos[0].length - 1];
          await this.bot.api.sendPhoto(ctx.chat!.id, highestResPhoto.file_id, {
            caption: `👤 نام کاربر: ${partnerName}`,
            reply_markup: ACTIVE_CHAT_KEYBOARD,
          });
          return;
        }
      } catch (photoErr: any) {
        this.logger.warn(`Could not get profile photo for ${partnerTgId}: ${photoErr.message}`);
      }

      await ctx.reply(
        `👤 نام کاربر: ${partnerName}\n(این کاربر تصویر پروفایل ندارد یا نمایش آن را در تنظیمات تلگرام محدود کرده است)`,
        { reply_markup: ACTIVE_CHAT_KEYBOARD },
      );
    } catch (err: any) {
      this.logger.error(`Error in handleShowProfile: ${err.message}`, err.stack);
      await ctx.reply('خطایی در دریافت اطلاعات پروفایل رخ داد.', { reply_markup: NO_ACTIVE_CHAT_KEYBOARD });
    }
  }

  private async handleListChats(ctx: Context) {
    const from = ctx.from;
    if (!from) return;

    const telegramUserId = String(from.id);
    try {
      const result = await this.getUserChatListUseCase.execute({ telegramUserId });

      if (!result.success || result.chats.length === 0) {
        await ctx.reply(
          'شما در حال حاضر هیچ چت فعالی ندارید. برای شروع گفتگو باید از طریق کلید همسان‌سازی وارد شوید.',
          { reply_markup: NO_ACTIVE_CHAT_KEYBOARD },
        );
        return;
      }

      const keyboard = new InlineKeyboard();
      for (const item of result.chats) {
        const activeLabel = item.isCurrentActive ? ' (فعال)' : '';
        keyboard.text(`💬 ${item.partnerName}${activeLabel}`, `switch_chat:${item.chatId}`).row();
      }
      keyboard.text('❌ بستن لیست', 'close_chat_list');

      await ctx.reply('📋 چت‌های شما:\nبرای گفتگو، کاربر مورد نظر را انتخاب کنید:', {
        reply_markup: keyboard,
      });
    } catch (err: any) {
      this.logger.error(`Error in handleListChats: ${err.message}`, err.stack);
      await ctx.reply('خطایی در دریافت لیست چت‌ها رخ داد.', { reply_markup: NO_ACTIVE_CHAT_KEYBOARD });
    }
  }

  private async handleSwitchChatCallback(ctx: Context) {
    const from = ctx.from;
    if (!from) return;

    const telegramUserId = String(from.id);
    const targetChatId = (ctx as any).match?.[1];

    if (!targetChatId) {
      await ctx.answerCallbackQuery({ text: 'شناسه چت نامعتبر است.' });
      return;
    }

    try {
      const result = await this.switchUserActiveChatUseCase.execute({
        telegramUserId,
        targetChatId,
      });

      if (!result.success) {
        await ctx.answerCallbackQuery({
          text: 'دسترسی به این چت امکان‌پذیر نیست یا چت یافت نشد.',
          show_alert: true,
        });
        return;
      }

      await ctx.answerCallbackQuery({ text: `ورود به چت با ${result.partnerName}` });

      await ctx.reply(
        `✅ شما وارد چت با **${result.partnerName}** شدید.\nاز این پس پیام‌های ارسالی شما به این کاربر تحویل داده می‌شود.`,
        {
          reply_markup: ACTIVE_CHAT_KEYBOARD,
          parse_mode: 'Markdown',
        },
      );

      if (this.messageRepository) {
        try {
          const history = await this.messageRepository.findByChatId(targetChatId, 1, 0);
          if (history.messages.length > 0) {
            const lastMsg = history.messages[0];
            const currentUser = await this.userRepository?.findByTelegramUserId(telegramUserId);
            if (currentUser && lastMsg.senderId !== currentUser.id) {
              await ctx.reply(`📩 آخرین پیام دریافتی از ${result.partnerName}:\n💬 ${lastMsg.content}`);
            }
          }
        } catch {
          // Non-critical
        }
      }
    } catch (err: any) {
      this.logger.error(`Error in handleSwitchChatCallback: ${err.message}`, err.stack);
      await ctx.answerCallbackQuery({ text: 'خطایی در تغییر چت رخ داد.', show_alert: true });
    }
  }

  private async handleTerminateChatPrompt(ctx: Context) {
    const from = ctx.from;
    if (!from) return;

    const telegramUserId = String(from.id);
    try {
      const activePartnerResult = await this.getUserActiveChatPartnerUseCase.execute({ telegramUserId });

      if (!activePartnerResult.success || !activePartnerResult.partnerUser || !activePartnerResult.chatId) {
        await ctx.reply('شما در حال حاضر در هیچ چت فعالی نیستید.', {
          reply_markup: NO_ACTIVE_CHAT_KEYBOARD,
        });
        return;
      }

      const partnerName = activePartnerResult.partnerName ?? 'کاربر';
      const chatId = activePartnerResult.chatId;

      const confirmKeyboard = new InlineKeyboard()
        .text('بله، مطمئنم', `confirm_terminate:${chatId}`)
        .text('خیر', 'cancel_terminate');

      await ctx.reply(`آیا مطمئن هستید که می‌خواهید چت با ${partnerName} را پایان دهید؟`, {
        reply_markup: confirmKeyboard,
      });
    } catch (err: any) {
      this.logger.error(`Error in handleTerminateChatPrompt: ${err.message}`, err.stack);
      await ctx.reply('خطایی در درخواست پایان چت رخ داد.', {
        reply_markup: NO_ACTIVE_CHAT_KEYBOARD,
      });
    }
  }

  private async handleConfirmTerminateCallback(ctx: Context) {
    const from = ctx.from;
    if (!from) return;

    const telegramUserId = String(from.id);
    const targetChatId = (ctx as any).match?.[1];

    if (!targetChatId) {
      await ctx.answerCallbackQuery({ text: 'شناسه چت نامعتبر است.' });
      return;
    }

    await ctx.answerCallbackQuery().catch(() => {});
    await ctx.deleteMessage().catch(() => {});

    if (!this.terminateChatUseCase) {
      await ctx.reply('سیستم پایان چت در دسترس نیست.', {
        reply_markup: NO_ACTIVE_CHAT_KEYBOARD,
      });
      return;
    }

    try {
      const termResult = await this.terminateChatUseCase.execute({
        telegramUserId,
        chatId: targetChatId,
      });

      if (!termResult.success) {
        await ctx.reply('خطا در پایان چت یا شما عضو این چت نیستید.', {
          reply_markup: NO_ACTIVE_CHAT_KEYBOARD,
        });
        return;
      }

      const partnerName = termResult.partnerName ?? 'کاربر';
      const terminatorName = termResult.terminatorName ?? 'کاربر';
      const partnerTgId = termResult.partnerTelegramUserId;

      await this.processUserPostTermination({
        telegramUserId,
        notificationMessage: `کاربر ${partnerName} چت را بست`,
        ctx,
      });

      if (partnerTgId) {
        await this.processUserPostTermination({
          telegramUserId: partnerTgId,
          notificationMessage: `کاربر ${terminatorName} چت را بست`,
        });
      }
    } catch (err: any) {
      this.logger.error(`Error in handleConfirmTerminateCallback: ${err.message}`, err.stack);
      await ctx.reply('خطایی در پایان چت رخ داد.', { reply_markup: NO_ACTIVE_CHAT_KEYBOARD });
    }
  }

  private async processUserPostTermination(params: {
    telegramUserId: string;
    notificationMessage: string;
    ctx?: Context;
  }) {
    const { telegramUserId, notificationMessage, ctx } = params;

    const sendMessage = async (text: string, markup?: any) => {
      try {
        if (ctx && String(ctx.from?.id) === telegramUserId) {
          await ctx.reply(text, markup ? { reply_markup: markup } : undefined);
        } else {
          await this.bot.api.sendMessage(
            telegramUserId,
            text,
            markup ? { reply_markup: markup } : undefined,
          );
        }
      } catch (sendErr: any) {
        this.logger.warn(`Could not send message to ${telegramUserId}: ${sendErr.message}`);
      }
    };

    const listResult = await this.getUserChatListUseCase.execute({
      telegramUserId,
      autoSelectIfNone: false,
    });

    const availableChats = listResult.success ? listResult.chats : [];

    if (availableChats.length === 1) {
      const nextChat = availableChats[0];
      await this.switchUserActiveChatUseCase.execute({
        telegramUserId,
        targetChatId: nextChat.chatId,
      });

      await sendMessage(notificationMessage);
      await sendMessage(
        `✅ شما به چت با ${nextChat.partnerName} منتقل شدید.`,
        ACTIVE_CHAT_KEYBOARD,
      );
    } else if (availableChats.length > 1) {
      await sendMessage(notificationMessage, NO_ACTIVE_CHAT_KEYBOARD);

      const keyboard = new InlineKeyboard();
      for (const item of availableChats) {
        keyboard.text(`💬 ${item.partnerName}`, `switch_chat:${item.chatId}`).row();
      }
      keyboard.text('❌ بستن لیست', 'close_chat_list');

      await sendMessage('📋 چت‌های شما:\nبرای گفتگو، کاربر مورد نظر را انتخاب کنید:', keyboard);
    } else {
      await sendMessage(notificationMessage, NO_ACTIVE_CHAT_KEYBOARD);
    }
  }

  async handleUpdate(update: any): Promise<void> {
    await this.bot.handleUpdate(update);
  }

  getBotInstance(): Bot<Context> {
    return this.bot;
  }

  async start(): Promise<void> {
    const isPolling = process.env.NODE_ENV !== 'test' && getEnvConfig().TELEGRAM_POLLING === 'true';
    if (isPolling) {
      this.logger.log('Starting Telegram bot polling...');
      try {
        await this.bot.api.deleteWebhook({ drop_pending_updates: false });
      } catch {
        // Webhook might not exist
      }

      this.bot.start({
        onStart: (botInfo) => {
          this.logger.log(`Telegram Bot @${botInfo.username} started successfully`);
          if (botInfo.username) {
            setBotUsername(botInfo.username);
          }
        },
      }).catch((err) => {
        this.logger.error(`Failed to start Telegram bot polling: ${err.message}`);
      });
    }
  }

  async stop(): Promise<void> {
    if (this.bot.isInited()) {
      await this.bot.stop();
      this.logger.log('Telegram bot stopped');
    }
  }
}
