import { Module } from '@nestjs/common';
import { AdminController } from './presentation/admin.controller';
import { AdminInspectChatUseCase } from './application/admin-inspect-chat.use-case';
import { AdminListHiddenChatsUseCase } from './application/admin-list-hidden-chats.use-case';
import { AdminListReferralsUseCase } from './application/admin-list-referrals.use-case';
import { AdminCreateMatchUseCase } from './application/admin-create-match.use-case';
import { AdminGetMatchUseCase } from './application/admin-get-match.use-case';
import { AdminListMatchesUseCase } from './application/admin-list-matches.use-case';
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
    AdminCreateMatchUseCase,
    AdminGetMatchUseCase,
    AdminListMatchesUseCase,
  ],
})
export class AdminModule {}
