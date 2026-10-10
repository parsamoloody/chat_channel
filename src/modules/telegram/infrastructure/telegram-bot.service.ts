import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Inject, Optional } from '@nestjs/common';
import { Bot, Context, Keyboard, InlineKeyboard } from 'grammy';
import { HandleTelegramStartUseCase } from '../application/handle-telegram-start.use-case';
import { HandleTelegramMessageUseCase } from '../application/handle-telegram-message.use-case';
import { GetUserActiveChatPartnerUseCase } from '../../chats/application/get-user-active-chat-partner.use-case';
import { GetUserChatListUseCase } from '../../chats/application/get-user-chat-list.use-case';
import { SwitchUserActiveChatUseCase } from '../../chats/application/switch-user-active-chat.use-case';
import { TerminateChatUseCase } from '../../chats/application/terminate-chat.use-case';
import { UserActiveChatService } from '../../chats/application/user-active-chat.service';
import { IMessageRepository, MESSAGE_REPOSITORY } from '../../messages/domain/message.repository.interface';
import { IUserRepository, USER_REPOSITORY } from '../../users/domain/user.repository.interface';
import { getEnvConfig, setBotUsername } from '../../../shared/infrastructure/config/env.config';
import { BUTTON_TEXTS, RAW_BUTTON_TEXTS } from '../constants/button-texts';
import { REPLY_TEXTS } from '../constants/reply-texts';

export { BUTTON_TEXTS, RAW_BUTTON_TEXTS } from '../constants/button-texts';
export { REPLY_TEXTS } from '../constants/reply-texts';

export const ACTIVE_CHAT_KEYBOARD = new Keyboard()
  .text(BUTTON_TEXTS.SHOW_PROFILE)
  .text(BUTTON_TEXTS.CHATS)
  .row()
  .text(BUTTON_TEXTS.TERMINATE_CHAT)
  .resized();

export const NO_ACTIVE_CHAT_KEYBOARD = new Keyboard()
  .text(BUTTON_TEXTS.CHATS)
  .resized();

export const MAIN_MENU_KEYBOARD = ACTIVE_CHAT_KEYBOARD;

export function getMenuKeyboard(hasActiveChat: boolean): Keyboard {
  return hasActiveChat ? ACTIVE_CHAT_KEYBOARD : NO_ACTIVE_CHAT_KEYBOARD;
}

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
    @Optional()
    private readonly terminateChatUseCase?: TerminateChatUseCase,
    @Optional()
    private readonly userActiveChatService?: UserActiveChatService,
  ) {
    const token = getEnvConfig().TELEGRAM_BOT_TOKEN;
    this.bot = new Bot<Context>(token, {
      botInfo: {
        id: 100000000,
        is_bot: true,
        first_name: 'HiddenChatBot',
        username: getEnvConfig().TELEGRAM_BOT_USERNAME,
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
      await ctx.reply(REPLY_TEXTS.CHAT_MENU_TITLE, { reply_markup: getMenuKeyboard(hasActiveChat) });
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
      await ctx.answerCallbackQuery({ text: REPLY_TEXTS.TERMINATE_CANCELLED }).catch(() => {});
      await ctx.deleteMessage().catch(() => {});
    });

    // 5. Message handler: checks for Persian menu buttons first, then relays chat messages
    this.bot.on('message:text', async (ctx) => {
      if (ctx.message.text.startsWith('/')) return; // Ignore slash commands

      const text = ctx.message.text.trim();

      // TASK 1 Button: نمایش پروفایل کاربر
      if (text === BUTTON_TEXTS.SHOW_PROFILE || text === RAW_BUTTON_TEXTS.SHOW_PROFILE) {
        await this.handleShowProfile(ctx);
        return;
      }

      // TASK 2 Button: چت ها
      if (text === BUTTON_TEXTS.CHATS || text === RAW_BUTTON_TEXTS.CHATS) {
        await this.handleListChats(ctx);
        return;
      }

      // TASK 1 Button: پایان چت
      if (text === BUTTON_TEXTS.TERMINATE_CHAT || text === RAW_BUTTON_TEXTS.TERMINATE_CHAT) {
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
              // Recipient is active in the same chat -> direct message relay
              await this.bot.api.sendMessage(
                result.recipientTelegramUserId,
                REPLY_TEXTS.RELAY_MESSAGE(ctx.message.text),
              );
            } else {
              // TASK 2: If recipient was chatting with another user, send notification with switch button
              // Message format: یک پیام از کاربر [name] دارید
              const switchKeyboard = new InlineKeyboard().text(
                BUTTON_TEXTS.SWITCH_TO_CHAT(result.senderName),
                `switch_chat:${result.chatId}`,
              );

              await this.bot.api.sendMessage(
                result.recipientTelegramUserId,
                REPLY_TEXTS.MESSAGE_NOTIFICATION(result.senderName ?? REPLY_TEXTS.DEFAULT_USER_NAME),
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

      const hasActiveChat =
        (result.status === 'CONNECTED' && !!result.chatId) ||
        result.status === 'ALREADY_CONNECTED';

      await ctx.reply(result.message, { reply_markup: getMenuKeyboard(hasActiveChat) });

      if (result.notifyPartnerUserId && this.userRepository) {
        try {
          const partner = await this.userRepository.findById(result.notifyPartnerUserId);
          if (partner?.telegramUserId) {
            await this.bot.api.sendMessage(
              partner.telegramUserId,
              REPLY_TEXTS.PARTNER_JOINED_CHAT,
              { reply_markup: ACTIVE_CHAT_KEYBOARD },
            );
          }
        } catch (notifyErr: any) {
          this.logger.warn(`Could not notify partner ${result.notifyPartnerUserId}: ${notifyErr.message}`);
        }
      }
    } catch (err: any) {
      this.logger.error(`Error in /start command: ${err.message}`, err.stack);
      await ctx.reply(REPLY_TEXTS.UNEXPECTED_ERROR, {
        reply_markup: NO_ACTIVE_CHAT_KEYBOARD,
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
          REPLY_TEXTS.PROFILE_NO_ACTIVE_CHAT,
          { reply_markup: NO_ACTIVE_CHAT_KEYBOARD },
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
            caption: REPLY_TEXTS.PROFILE_CAPTION(partnerName),
            reply_markup: ACTIVE_CHAT_KEYBOARD,
          });
          return;
        }
      } catch (photoErr: any) {
        this.logger.warn(`Could not get profile photo for ${partnerTgId}: ${photoErr.message}`);
      }

      // Fallback when photo is missing or privacy restricted
      await ctx.reply(
        REPLY_TEXTS.PROFILE_NO_PHOTO_CAPTION(partnerName),
        { reply_markup: ACTIVE_CHAT_KEYBOARD },
      );
    } catch (err: any) {
      this.logger.error(`Error in handleShowProfile: ${err.message}`, err.stack);
      await ctx.reply(REPLY_TEXTS.PROFILE_FETCH_ERROR, { reply_markup: NO_ACTIVE_CHAT_KEYBOARD });
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
          REPLY_TEXTS.CHATS_NO_ACTIVE,
          { reply_markup: NO_ACTIVE_CHAT_KEYBOARD },
        );
        return;
      }

      const keyboard = new InlineKeyboard();
      for (const item of result.chats) {
        keyboard.text(
          BUTTON_TEXTS.CHAT_LIST_ITEM(item.partnerName, item.isCurrentActive),
          `switch_chat:${item.chatId}`,
        ).row();
      }
      keyboard.text(BUTTON_TEXTS.CLOSE_CHAT_LIST, 'close_chat_list');

      await ctx.reply(REPLY_TEXTS.CHATS_LIST_TITLE, {
        reply_markup: keyboard,
      });
    } catch (err: any) {
      this.logger.error(`Error in handleListChats: ${err.message}`, err.stack);
      await ctx.reply(REPLY_TEXTS.CHATS_FETCH_ERROR, { reply_markup: NO_ACTIVE_CHAT_KEYBOARD });
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
      await ctx.answerCallbackQuery({ text: REPLY_TEXTS.INVALID_CHAT_ID });
      return;
    }

    try {
      const result = await this.switchUserActiveChatUseCase.execute({
        telegramUserId,
        targetChatId,
      });

      if (!result.success) {
        await ctx.answerCallbackQuery({
          text: REPLY_TEXTS.CHAT_ACCESS_DENIED,
          show_alert: true,
        });
        return;
      }

      await ctx.answerCallbackQuery({ text: REPLY_TEXTS.SWITCH_CHAT_ALERT(result.partnerName ?? REPLY_TEXTS.DEFAULT_USER_NAME) });

      await ctx.reply(
        REPLY_TEXTS.SWITCH_CHAT_SUCCESS(result.partnerName ?? REPLY_TEXTS.DEFAULT_USER_NAME),
        {
          reply_markup: ACTIVE_CHAT_KEYBOARD,
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
              await ctx.reply(REPLY_TEXTS.LAST_RECEIVED_MESSAGE(result.partnerName ?? REPLY_TEXTS.DEFAULT_USER_NAME, lastMsg.content));
            }
          }
        } catch {
          // Non-critical, ignore
        }
      }
    } catch (err: any) {
      this.logger.error(`Error in handleSwitchChatCallback: ${err.message}`, err.stack);
      await ctx.answerCallbackQuery({ text: REPLY_TEXTS.SWITCH_CHAT_ERROR, show_alert: true });
    }
  }

  /**
   * Prompts user with confirmation before terminating active chat
   */
  private async handleTerminateChatPrompt(ctx: Context) {
    const from = ctx.from;
    if (!from) return;

    const telegramUserId = String(from.id);
    try {
      const activePartnerResult = await this.getUserActiveChatPartnerUseCase.execute({ telegramUserId });

      if (!activePartnerResult.success || !activePartnerResult.partnerUser || !activePartnerResult.chatId) {
        await ctx.reply(REPLY_TEXTS.TERMINATE_NO_ACTIVE_CHAT, {
          reply_markup: NO_ACTIVE_CHAT_KEYBOARD,
        });
        return;
      }

      const partnerName = activePartnerResult.partnerName ?? REPLY_TEXTS.DEFAULT_USER_NAME;
      const chatId = activePartnerResult.chatId;

      const confirmKeyboard = new InlineKeyboard()
        .text(BUTTON_TEXTS.CONFIRM_TERMINATE, `confirm_terminate:${chatId}`)
        .text(BUTTON_TEXTS.CANCEL_TERMINATE, 'cancel_terminate');

      await ctx.reply(REPLY_TEXTS.TERMINATE_CONFIRM_PROMPT(partnerName), {
        reply_markup: confirmKeyboard,
      });
    } catch (err: any) {
      this.logger.error(`Error in handleTerminateChatPrompt: ${err.message}`, err.stack);
      await ctx.reply(REPLY_TEXTS.TERMINATE_PROMPT_ERROR, {
        reply_markup: NO_ACTIVE_CHAT_KEYBOARD,
      });
    }
  }

  /**
   * Handles user confirming chat termination via inline button
   */
  private async handleConfirmTerminateCallback(ctx: Context) {
    const from = ctx.from;
    if (!from) return;

    const telegramUserId = String(from.id);
    const targetChatId = (ctx as any).match?.[1];

    if (!targetChatId) {
      await ctx.answerCallbackQuery({ text: REPLY_TEXTS.INVALID_CHAT_ID });
      return;
    }

    await ctx.answerCallbackQuery().catch(() => {});
    await ctx.deleteMessage().catch(() => {});

    if (!this.terminateChatUseCase) {
      await ctx.reply(REPLY_TEXTS.TERMINATE_SYSTEM_UNAVAILABLE, {
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
        await ctx.reply(REPLY_TEXTS.TERMINATE_FORBIDDEN, {
          reply_markup: NO_ACTIVE_CHAT_KEYBOARD,
        });
        return;
      }

      const partnerName = termResult.partnerName ?? REPLY_TEXTS.DEFAULT_USER_NAME;
      const terminatorName = termResult.terminatorName ?? REPLY_TEXTS.DEFAULT_USER_NAME;
      const partnerTgId = termResult.partnerTelegramUserId;

      // 1. Process post-termination for initiator (User A)
      await this.processUserPostTermination({
        telegramUserId,
        notificationMessage: REPLY_TEXTS.CHAT_CLOSED_BY_USER(partnerName),
        ctx,
      });

      // 2. Process post-termination for partner (User B)
      if (partnerTgId) {
        await this.processUserPostTermination({
          telegramUserId: partnerTgId,
          notificationMessage: REPLY_TEXTS.CHAT_CLOSED_BY_USER(terminatorName),
        });
      }
    } catch (err: any) {
      this.logger.error(`Error in handleConfirmTerminateCallback: ${err.message}`, err.stack);
      await ctx.reply(REPLY_TEXTS.TERMINATE_ERROR, { reply_markup: NO_ACTIVE_CHAT_KEYBOARD });
    }
  }

  /**
   * Post-termination flow for a user:
   * 1. Displays notification: کاربر [name] چت را بست
   * 2. If available chats === 1: switches automatically to that next chat
   * 3. If available chats > 1: displays list of chats to choose another chat
   * 4. If available chats === 0: sets no-active-chat keyboard
   */
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

    // Check available chats remaining for user (excluding the terminated chat)
    const listResult = await this.getUserChatListUseCase.execute({
      telegramUserId,
      autoSelectIfNone: false,
    });

    const availableChats = listResult.success ? listResult.chats : [];

    if (availableChats.length === 1) {
      // Exactly 1 other chat -> switch to next chat
      const nextChat = availableChats[0];
      await this.switchUserActiveChatUseCase.execute({
        telegramUserId,
        targetChatId: nextChat.chatId,
      });

      await sendMessage(notificationMessage);
      await sendMessage(
        REPLY_TEXTS.AUTO_SWITCH_SUCCESS(nextChat.partnerName),
        ACTIVE_CHAT_KEYBOARD,
      );
    } else if (availableChats.length > 1) {
      // More than 1 chat -> display list to choose
      await sendMessage(notificationMessage, NO_ACTIVE_CHAT_KEYBOARD);

      const keyboard = new InlineKeyboard();
      for (const item of availableChats) {
        keyboard.text(
          BUTTON_TEXTS.CHAT_LIST_ITEM(item.partnerName),
          `switch_chat:${item.chatId}`,
        ).row();
      }
      keyboard.text(BUTTON_TEXTS.CLOSE_CHAT_LIST, 'close_chat_list');

      await sendMessage(REPLY_TEXTS.CHATS_LIST_TITLE, keyboard);
    } else {
      // 0 available chats
      await sendMessage(notificationMessage, NO_ACTIVE_CHAT_KEYBOARD);
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
