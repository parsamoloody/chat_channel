import { Module } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { UsersModule } from '../modules/users/users.module';
import { ReferralsModule } from '../modules/referrals/referrals.module';
import { MatchesModule } from '../modules/matches/matches.module';
import { ChatsModule } from '../modules/chats/chats.module';
import { MessagesModule } from '../modules/messages/messages.module';
import { AdminModule } from '../modules/admin/admin.module';
import { TelegramModule } from '../modules/telegram/telegram.module';
import { AppController } from './app.controller';

@Module({
  imports: [
    SharedModule,
    UsersModule,
    ReferralsModule,
    MatchesModule,
    ChatsModule,
    MessagesModule,
    AdminModule,
    TelegramModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
