import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Bot, Context } from 'grammy';
import { HandleTelegramStartUseCase } from '../application/handle-telegram-start.use-case';
import { HandleTelegramMessageUseCase } from '../application/handle-telegram-message.use-case';
import { getEnvConfig } from '../../../shared/infrastructure/config/env.config';

@Injectable()
export class TelegramBotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramBotService.name);
  private bot: Bot<Context>;

  constructor(
    private readonly handleStartUseCase: HandleTelegramStartUseCase,
    private readonly handleMessageUseCase: HandleTelegramMessageUseCase,
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

    // In test environment or with mock token, mock outgoing Telegram API calls (like sendMessage)
    this.bot.api.config.use(async (prev, method, payload, signal) => {
      if (process.env.NODE_ENV === 'test' || token.startsWith('mock_')) {
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

    // 3. Text message handler for active chats
    this.bot.on('message:text', async (ctx) => {
      if (ctx.message.text.startsWith('/')) return; // Ignore commands
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
            await this.bot.api.sendMessage(
              result.recipientTelegramUserId,
              `💬 ${ctx.message.text}`,
            );
          } catch (relayErr: any) {
            this.logger.warn(`Could not relay message to ${result.recipientTelegramUserId}: ${relayErr.message}`);
          }
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

      await ctx.reply(result.message);
    } catch (err: any) {
      this.logger.error(`Error in /start command: ${err.message}`, err.stack);
      await ctx.reply('An unexpected error occurred. Please try again later.');
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
