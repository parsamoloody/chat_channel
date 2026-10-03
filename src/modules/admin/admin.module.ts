import { Module } from '@nestjs/common';
import { AdminController } from './presentation/admin.controller';
import { AdminInspectChatUseCase } from './application/admin-inspect-chat.use-case';
import { AdminListHiddenChatsUseCase } from './application/admin-list-hidden-chats.use-case';
import { AdminListReferralsUseCase } from './application/admin-list-referrals.use-case';
import { ChatsModule } from '../chats/chats.module';
import { MatchesModule } from '../matches/matches.module';
import { UsersModule } from '../users/users.module';
import { ReferralsModule } from '../referrals/referrals.module';
import { MessagesModule } from '../messages/messages.module';

@Module({
  imports: [
    ChatsModule,
    MatchesModule,
    UsersModule,
    ReferralsModule,
    MessagesModule,
  ],
  controllers: [AdminController],
  providers: [
    AdminInspectChatUseCase,
    AdminListHiddenChatsUseCase,
    AdminListReferralsUseCase,
  ],
})
export class AdminModule {}
