import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Inject, Optional } from '@nestjs/common';
import { Bot, Context, Keyboard, InlineKeyboard } from 'grammy';
import { HandleTelegramStartUseCase } from '../application/handle-telegram-start.use-case';
import { HandleTelegramMessageUseCase } from '../application/handle-telegram-message.use-case';
import { GetUserActiveChatPartnerUseCase } from '../../chats/application/get-user-active-chat-partner.use-case';
import { GetUserChatListUseCase } from '../../chats/application/get-user-chat-list.use-case';
import { SwitchUserActiveChatUseCase } from '../../chats/application/switch-user-active-chat.use-case';
import { IMessageRepository, MESSAGE_REPOSITORY } from '../../messages/domain/message.repository.interface';
import { IUserRepository, USER_REPOSITORY } from '../../users/domain/user.repository.interface';
import { getEnvConfig, setBotUsername } from '../../../shared/infrastructure/config/env.config';

export const MAIN_MENU_KEYBOARD = new Keyboard()
  .text('نمایش پروفایل کاربر')
  .text('چت ها')
  .resized();

@Injectable()
export class TelegramBotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramBotService.name);
  private bot: Bot<Context>;

  constructor(
    private readonly handleStartUseCase: HandleTelegramStartUseCase,
    private readonly handleMessageUseCase: HandleTelegramMessageUseCase,
    private readonly getUserActiveChatPartnerUseCase: GetUserActiveChatPartnerUseCase,
    private readonly getUserChatListUseCase: GetUserChatListUseCase,
    private readonly switchUserActiveChatUseCase: SwitchUserActiveChatUseCase,
    @Optional()
    @Inject(MESSAGE_REPOSITORY)
    private readonly messageRepository?: IMessageRepository,
    @Optional()
    @Inject(USER_REPOSITORY)
    private readonly userRepository?: IUserRepository,
  ) {
    const token = getEnvConfig().TELEGRAM_BOT_TOKEN;
    this.bot = new Bot<Context>(token, {
      botInfo: {
        id: 100000000,
        is_bot: true,
        first_name: 'HiddenChatBot',
        username: 'hidden_chat_bot',
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

    // 3. Command helpers for profile and chats
    this.bot.command('profile', async (ctx) => {
      await this.handleShowProfile(ctx);
    });

    this.bot.command('chats', async (ctx) => {
      await this.handleListChats(ctx);
    });

    this.bot.command('menu', async (ctx) => {
      await ctx.reply('منوی چت:', { reply_markup: MAIN_MENU_KEYBOARD });
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

    // 5. Message handler: checks for Persian menu buttons first, then relays chat messages
    this.bot.on('message:text', async (ctx) => {
      if (ctx.message.text.startsWith('/')) return; // Ignore slash commands

      const text = ctx.message.text.trim();

      // TASK 1 Button: نمایش پروفایل کاربر
      if (text === 'نمایش پروفایل کاربر') {
        await this.handleShowProfile(ctx);
        return;
      }

      // TASK 2 Button: چت ها
      if (text === 'چت ها') {
        await this.handleListChats(ctx);
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
              // Recipient is active in the same chat -> direct message relay
              await this.bot.api.sendMessage(
                result.recipientTelegramUserId,
                `💬 ${ctx.message.text}`,
              );
            } else {
              // TASK 2: If recipient was chatting with another user, send notification with switch button
              // Message format: یک پیام از کاربر [name] دارید
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
          await ctx.reply(result.responseToSender, { reply_markup: MAIN_MENU_KEYBOARD });
        }
      } catch (err: any) {
        this.logger.error(`Error handling message: ${err.message}`, err.stack);
      }
    });
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

      await ctx.reply(result.message, { reply_markup: MAIN_MENU_KEYBOARD });

      if (result.notifyPartnerUserId && this.userRepository) {
        try {
          const partner = await this.userRepository.findById(result.notifyPartnerUserId);
          if (partner?.telegramUserId) {
            await this.bot.api.sendMessage(
              partner.telegramUserId,
              '🎉 هم‌صحبت شما به چت پیوست! اکنون می‌توانید با ارسال پیام، گفتگو را آغاز کنید.',
              { reply_markup: MAIN_MENU_KEYBOARD },
            );
          }
        } catch (notifyErr: any) {
          this.logger.warn(`Could not notify partner ${result.notifyPartnerUserId}: ${notifyErr.message}`);
        }
      }
    } catch (err: any) {
      this.logger.error(`Error in /start command: ${err.message}`, err.stack);
      await ctx.reply('An unexpected error occurred. Please try again later.', {
        reply_markup: MAIN_MENU_KEYBOARD,
      });
    }
  }

  /**
   * TASK 1: Display real profile picture and name of the active chat partner
   */
  private async handleShowProfile(ctx: Context) {
    const from = ctx.from;
    if (!from) return;

    const telegramUserId = String(from.id);
    try {
      const result = await this.getUserActiveChatPartnerUseCase.execute({ telegramUserId });

      if (!result.success || !result.partnerUser) {
        await ctx.reply(
          'شما در حال حاضر در هیچ چت فعالی نیستید. لطفاً ابتدا از دکمه «چت ها» یک گفتگو را انتخاب کنید.',
          { reply_markup: MAIN_MENU_KEYBOARD },
        );
        return;
      }

      const partnerName = result.partnerName!;
      const partnerTgId = Number(result.partnerUser.telegramUserId);

      // Attempt to retrieve user's real profile photo from Telegram
      try {
        const photos = await this.bot.api.getUserProfilePhotos(partnerTgId, { limit: 1 });
        if (photos && photos.total_count > 0 && photos.photos.length > 0 && photos.photos[0].length > 0) {
          const highestResPhoto = photos.photos[0][photos.photos[0].length - 1];
          await this.bot.api.sendPhoto(ctx.chat!.id, highestResPhoto.file_id, {
            caption: `👤 نام کاربر: ${partnerName}`,
            reply_markup: MAIN_MENU_KEYBOARD,
          });
          return;
        }
      } catch (photoErr: any) {
        this.logger.warn(`Could not get profile photo for ${partnerTgId}: ${photoErr.message}`);
      }

      // Fallback when photo is missing or privacy restricted
      await ctx.reply(
        `👤 نام کاربر: ${partnerName}\n(این کاربر تصویر پروفایل ندارد یا نمایش آن را در تنظیمات تلگرام محدود کرده است)`,
        { reply_markup: MAIN_MENU_KEYBOARD },
      );
    } catch (err: any) {
      this.logger.error(`Error in handleShowProfile: ${err.message}`, err.stack);
      await ctx.reply('خطایی در دریافت اطلاعات پروفایل رخ داد.', { reply_markup: MAIN_MENU_KEYBOARD });
    }
  }

  /**
   * TASK 2: Display list of chats with users names on buttons
   */
  private async handleListChats(ctx: Context) {
    const from = ctx.from;
    if (!from) return;

    const telegramUserId = String(from.id);
    try {
      const result = await this.getUserChatListUseCase.execute({ telegramUserId });

      if (!result.success || result.chats.length === 0) {
        await ctx.reply(
          'شما در حال حاضر هیچ چت فعالی ندارید. برای شروع گفتگو باید از طریق لینک همسان‌سازی وارد شوید.',
          { reply_markup: MAIN_MENU_KEYBOARD },
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
      await ctx.reply('خطایی در دریافت لیست چت‌ها رخ داد.', { reply_markup: MAIN_MENU_KEYBOARD });
    }
  }

  /**
   * TASK 2: Switch active chat when a user clicks on a chat button
   */
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
          reply_markup: MAIN_MENU_KEYBOARD,
          parse_mode: 'Markdown',
        },
      );

      // Optionally show the latest received message from this partner so the user has context
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
          // Non-critical, ignore
        }
      }
    } catch (err: any) {
      this.logger.error(`Error in handleSwitchChatCallback: ${err.message}`, err.stack);
      await ctx.answerCallbackQuery({ text: 'خطایی در تغییر چت رخ داد.', show_alert: true });
    }
  }

  /**
   * Process a Telegram update object (used for Webhooks and Integration Tests)
   */
  async handleUpdate(update: any): Promise<void> {
    await this.bot.handleUpdate(update);
  }

  getBotInstance(): Bot<Context> {
    return this.bot;
  }

  async onModuleInit() {
    // Only run polling if explicitly configured and not running in test mode
    if (process.env.NODE_ENV !== 'test' && process.env.TELEGRAM_POLLING === 'true') {
      this.logger.log('Starting Telegram bot polling...');
      try {
        await this.bot.api.deleteWebhook({ drop_pending_updates: false });
      } catch {
        // Webhook might not exist, proceed
      }

      this.bot.start({
        onStart: (botInfo) => {
          this.logger.log(`Telegram Bot @${botInfo.username} started`);
          if (botInfo.username) {
            setBotUsername(botInfo.username);
          }
        },
      }).catch((err) => {
        this.logger.error(`Failed to start Telegram bot polling: ${err.message}`);
      });
    }
  }

  async onModuleDestroy() {
    if (this.bot.isInited()) {
      await this.bot.stop();
      this.logger.log('Telegram bot stopped');
    }
  }
}
