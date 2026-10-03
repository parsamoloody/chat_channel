import { Controller, Post, Body, HttpCode, HttpStatus, Logger } from '@nestjs/common';
import { TelegramBotService } from '../infrastructure/telegram-bot.service';

@Controller('api/v1/telegram')
export class TelegramController {
  private readonly logger = new Logger(TelegramController.name);

  constructor(private readonly telegramBotService: TelegramBotService) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(@Body() update: any) {
    try {
      await this.telegramBotService.handleUpdate(update);
    } catch (error: any) {
      this.logger.error(`Error processing webhook update: ${error.message}`);
    }
    return { ok: true };
  }
}
