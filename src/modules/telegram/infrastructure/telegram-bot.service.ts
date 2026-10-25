import { Bot, Context, Keyboard, InlineKeyboard } from 'grammy';
import { Logger } from '../../../shared/infrastructure/logger';
import { HandleTelegramStartUseCase } from '../application/handle-telegram-start.use-case';
import { HandleTelegramMessageUseCase, MessageMediaType } from '../application/handle-telegram-message.use-case';
import { MediaRateLimiterService } from '../application/media-rate-limiter.service';
import { GetUserActiveChatPartnerUseCase } from '../../chats/application/get-user-active-chat-partner.use-case';
import { GetUserChatListUseCase } from '../../chats/application/get-user-chat-list.use-case';
import { SwitchUserActiveChatUseCase } from '../../chats/application/switch-user-active-chat.use-case';
import { TerminateChatUseCase } from '../../chats/application/terminate-chat.use-case';
import { UserActiveChatService } from '../../chats/application/user-active-chat.service';
import { IMessageRepository } from '../../messages/domain/message.repository.interface';
import { IUserRepository } from '../../users/domain/user.repository.interface';
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
  mediaRateLimiterService?: MediaRateLimiterService;
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
  private readonly mediaRateLimiterService?: MediaRateLimiterService;

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
    mediaRateLimiterService?: MediaRateLimiterService,
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
      this.mediaRateLimiterService = deps.mediaRateLimiterService;
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
      this.mediaRateLimiterService = mediaRateLimiterService;
      token = botToken ?? getEnvConfig().TELEGRAM_BOT_TOKEN;
    }

    this.bot = new Bot<Context>(token, {
      botInfo: {
        id: 100000000,
        is_bot: true,
        first_name: 'ChatBot',
        username: getEnvConfig().TELEGRAM_BOT_USERNAME || 'chat_bot',
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
        if (method === 'sendSticker') {
          return {
            ok: true,
            result: {
              message_id: Math.floor(Math.random() * 100000),
              date: Math.floor(Date.now() / 1000),
              chat: { id: (payload as any)?.chat_id ?? 1, type: 'private' },
              sticker: { file_id: (payload as any)?.sticker ?? 'mock_sticker' },
            } as any,
          } as any;
        }
        if (method === 'sendAnimation') {
          return {
            ok: true,
            result: {
              message_id: Math.floor(Math.random() * 100000),
              date: Math.floor(Date.now() / 1000),
              chat: { id: (payload as any)?.chat_id ?? 1, type: 'private' },
              animation: { file_id: (payload as any)?.animation ?? 'mock_animation' },
            } as any,
          } as any;
        }
        if (method === 'sendDice') {
          return {
            ok: true,
            result: {
              message_id: Math.floor(Math.random() * 100000),
              date: Math.floor(Date.now() / 1000),
              chat: { id: (payload as any)?.chat_id ?? 1, type: 'private' },
              dice: { emoji: (payload as any)?.emoji ?? '🎲', value: 3 },
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
              await this.bot.api.sendMessage(
                result.recipientTelegramUserId,
                REPLY_TEXTS.RELAY_MESSAGE(ctx.message.text),
              );
            } else {
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

    // 6. Sticker handler
    this.bot.on('message:sticker', async (ctx) => {
      const sticker = ctx.message.sticker;
      await this.handleIncomingMedia(ctx, 'sticker', {
        fileId: sticker.file_id,
        fileSize: sticker.file_size,
        emoji: sticker.emoji,
        mediaLabel: 'استیکر',
      });
    });

    // 7. Animation / GIF handler
    this.bot.on('message:animation', async (ctx) => {
      const animation = ctx.message.animation;
      await this.handleIncomingMedia(ctx, 'animation', {
        fileId: animation.file_id,
        fileSize: animation.file_size,
        caption: ctx.message.caption,
        mediaLabel: 'گیف',
      });
    });

    // 8. Dice / Animated emoji handler (🎲, 🎯, 🏀, ⚽, 🎰, 🎳)
    this.bot.on('message:dice', async (ctx) => {
      const dice = ctx.message.dice;
      await this.handleIncomingMedia(ctx, 'dice', {
        emoji: dice.emoji,
        mediaLabel: 'ایموجی',
      });
    });

    // 9. Photo handler
    this.bot.on('message:photo', async (ctx) => {
      const photos = ctx.message.photo;
      const photo = photos[photos.length - 1];
      await this.handleIncomingMedia(ctx, 'photo', {
        fileId: photo.file_id,
        fileSize: photo.file_size,
        caption: ctx.message.caption,
        mediaLabel: 'عکس',
      });
    });

    // 10. Video handler
    this.bot.on('message:video', async (ctx) => {
      const video = ctx.message.video;
      await this.handleIncomingMedia(ctx, 'video', {
        fileId: video.file_id,
        fileSize: video.file_size,
        caption: ctx.message.caption,
        mediaLabel: 'ویدیو',
      });
    });

    // 11. Document handler (for GIFs or videos sent as document)
    this.bot.on('message:document', async (ctx) => {
      const doc = ctx.message.document;
      const isGif = doc.mime_type === 'image/gif';
      await this.handleIncomingMedia(ctx, isGif ? 'animation' : 'document', {
        fileId: doc.file_id,
        fileSize: doc.file_size,
        caption: ctx.message.caption,
        mediaLabel: isGif ? 'گیف' : 'فایل',
      });
    });
  }

  private async handleIncomingMedia(
    ctx: Context,
    mediaType: MessageMediaType,
    data: {
      fileId?: string;
      fileSize?: number;
      caption?: string;
      emoji?: string;
      mediaLabel: string;
    },
  ) {
    const from = ctx.from;
    if (!from) return;

    const telegramUserId = String(from.id);
    const content = this.formatMediaContent(mediaType, data);

    try {
      const result = await this.handleMessageUseCase.execute({
        telegramUserId,
        content,
        mediaType,
        fileId: data.fileId,
        fileSize: data.fileSize,
        caption: data.caption,
        emoji: data.emoji,
      });

      if (result.success && result.recipientTelegramUserId) {
        try {
          if (result.isRecipientActiveInSameChat) {
            // Direct relay based on media type
            if (mediaType === 'sticker' && data.fileId) {
              await this.bot.api.sendSticker(result.recipientTelegramUserId, data.fileId);
            } else if (mediaType === 'animation' && data.fileId) {
              await this.bot.api.sendAnimation(result.recipientTelegramUserId, data.fileId, {
                caption: data.caption ? REPLY_TEXTS.RELAY_MESSAGE(data.caption) : undefined,
              });
            } else if (mediaType === 'dice' && data.emoji) {
              await this.bot.api.sendDice(result.recipientTelegramUserId, data.emoji as any);
            } else if (mediaType === 'photo' && data.fileId) {
              await this.bot.api.sendPhoto(result.recipientTelegramUserId, data.fileId, {
                caption: data.caption ? REPLY_TEXTS.RELAY_MESSAGE(data.caption) : undefined,
              });
            } else if (mediaType === 'video' && data.fileId) {
              await this.bot.api.sendVideo(result.recipientTelegramUserId, data.fileId, {
                caption: data.caption ? REPLY_TEXTS.RELAY_MESSAGE(data.caption) : undefined,
              });
            } else {
              await this.bot.api.sendMessage(
                result.recipientTelegramUserId,
                REPLY_TEXTS.RELAY_MESSAGE(content),
              );
            }
          } else {
            // Recipient is chatting with another user -> notification with switch button
            const switchKeyboard = new InlineKeyboard().text(
              BUTTON_TEXTS.SWITCH_TO_CHAT(result.senderName),
              `switch_chat:${result.chatId}`,
            );

            await this.bot.api.sendMessage(
              result.recipientTelegramUserId,
              REPLY_TEXTS.MEDIA_NOTIFICATION(
                result.senderName ?? REPLY_TEXTS.DEFAULT_USER_NAME,
                data.mediaLabel,
              ),
              {
                reply_markup: switchKeyboard,
              },
            );
          }
        } catch (relayErr: any) {
          this.logger.warn(`Could not relay media to ${result.recipientTelegramUserId}: ${relayErr.message}`);
        }
      } else if (!result.success && result.responseToSender) {
        const hasActiveChat = await this.isUserInActiveChat(telegramUserId);
        await ctx.reply(result.responseToSender, {
          reply_markup: getMenuKeyboard(hasActiveChat),
        });
      }
    } catch (err: any) {
      this.logger.error(`Error handling media message: ${err.message}`, err.stack);
    }
  }

  private formatMediaContent(
    mediaType: MessageMediaType,
    data: { emoji?: string; caption?: string },
  ): string {
    switch (mediaType) {
      case 'sticker':
        return data.emoji ? `[استیکر ${data.emoji}]` : '[استیکر]';
      case 'animation':
        return data.caption ? `[گیف] ${data.caption}` : '[گیف]';
      case 'dice':
        return `[ایموجی ${data.emoji ?? '🎲'}]`;
      case 'photo':
        return data.caption ? `[عکس] ${data.caption}` : '[عکس]';
      case 'video':
        return data.caption ? `[ویدیو] ${data.caption}` : '[ویدیو]';
      default:
        return data.caption ? `[رسانه] ${data.caption}` : '[رسانه]';
    }
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
            REPLY_TEXTS.PARTNER_JOINED_CHAT,
            { reply_markup: ACTIVE_CHAT_KEYBOARD },
          );
        } catch (notifyErr: any) {
          this.logger.warn(`Could not notify partner ${result.notifyPartnerTelegramUserId}: ${notifyErr.message}`);
        }
      }
    } catch (err: any) {
      this.logger.error(`Error in /start command: ${err.message}`, err.stack);
      await ctx.reply(REPLY_TEXTS.UNEXPECTED_ERROR, {
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
          REPLY_TEXTS.PROFILE_NO_ACTIVE_CHAT,
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
            caption: REPLY_TEXTS.PROFILE_CAPTION(partnerName),
            reply_markup: ACTIVE_CHAT_KEYBOARD,
          });
          return;
        }
      } catch (photoErr: any) {
        this.logger.warn(`Could not get profile photo for ${partnerTgId}: ${photoErr.message}`);
      }

      await ctx.reply(
        REPLY_TEXTS.PROFILE_NO_PHOTO_CAPTION(partnerName),
        { reply_markup: ACTIVE_CHAT_KEYBOARD },
      );
    } catch (err: any) {
      this.logger.error(`Error in handleShowProfile: ${err.message}`, err.stack);
      await ctx.reply(REPLY_TEXTS.PROFILE_FETCH_ERROR, { reply_markup: NO_ACTIVE_CHAT_KEYBOARD });
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
          // Non-critical
        }
      }
    } catch (err: any) {
      this.logger.error(`Error in handleSwitchChatCallback: ${err.message}`, err.stack);
      await ctx.answerCallbackQuery({ text: REPLY_TEXTS.SWITCH_CHAT_ERROR, show_alert: true });
    }
  }

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

      await this.processUserPostTermination({
        telegramUserId,
        notificationMessage: REPLY_TEXTS.CHAT_CLOSED_BY_USER(partnerName),
        ctx,
      });

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
        REPLY_TEXTS.AUTO_SWITCH_SUCCESS(nextChat.partnerName),
        ACTIVE_CHAT_KEYBOARD,
      );
    } else if (availableChats.length > 1) {
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
