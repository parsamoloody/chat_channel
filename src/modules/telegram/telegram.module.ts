import { Module } from '@nestjs/common';
import { TelegramBotService } from './infrastructure/telegram-bot.service';
import { TelegramController } from './presentation/telegram.controller';
import { HandleTelegramStartUseCase } from './application/handle-telegram-start.use-case';
import { HandleTelegramMessageUseCase } from './application/handle-telegram-message.use-case';
import { MediaRateLimiterService } from './application/media-rate-limiter.service';
import { UsersModule } from '../users/users.module';
import { ReferralsModule } from '../referrals/referrals.module';
import { MatchesModule } from '../matches/matches.module';
import { ChatsModule } from '../chats/chats.module';
import { MessagesModule } from '../messages/messages.module';

@Module({
  imports: [
    UsersModule,
    ReferralsModule,
    MatchesModule,
    ChatsModule,
    MessagesModule,
  ],
  controllers: [TelegramController],
  providers: [
    TelegramBotService,
    HandleTelegramStartUseCase,
    HandleTelegramMessageUseCase,
    MediaRateLimiterService,
  ],
  exports: [
    TelegramBotService,
    HandleTelegramStartUseCase,
    HandleTelegramMessageUseCase,
    MediaRateLimiterService,
  ],
})
export class TelegramModule {}
