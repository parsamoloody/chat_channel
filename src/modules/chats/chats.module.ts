import { Module } from '@nestjs/common';
import { CHAT_REPOSITORY } from './domain/chat.repository.interface';
import { PrismaChatRepository } from './infrastructure/prisma-chat.repository';
import { GetOrCreateMatchChatUseCase } from './application/get-or-create-match-chat.use-case';
import { GetChatDetailsUseCase } from './application/get-chat-details.use-case';
import { GetUserChatsUseCase } from './application/get-user-chats.use-case';
import { UserActiveChatService } from './application/user-active-chat.service';
import { GetUserActiveChatPartnerUseCase } from './application/get-user-active-chat-partner.use-case';
import { GetUserChatListUseCase } from './application/get-user-chat-list.use-case';
import { SwitchUserActiveChatUseCase } from './application/switch-user-active-chat.use-case';
import { TerminateChatUseCase } from './application/terminate-chat.use-case';
import { ChatsController } from './presentation/chats.controller';
import { UsersModule } from '../users/users.module';
import { MatchesModule } from '../matches/matches.module';
import { SharedModule } from '../../shared/shared.module';

@Module({
  imports: [UsersModule, MatchesModule, SharedModule],
  controllers: [ChatsController],
  providers: [
    {
      provide: CHAT_REPOSITORY,
      useClass: PrismaChatRepository,
    },
    GetOrCreateMatchChatUseCase,
    GetChatDetailsUseCase,
    GetUserChatsUseCase,
    UserActiveChatService,
    GetUserActiveChatPartnerUseCase,
    GetUserChatListUseCase,
    SwitchUserActiveChatUseCase,
    TerminateChatUseCase,
  ],
  exports: [
    CHAT_REPOSITORY,
    GetOrCreateMatchChatUseCase,
    GetChatDetailsUseCase,
    GetUserChatsUseCase,
    UserActiveChatService,
    GetUserActiveChatPartnerUseCase,
    GetUserChatListUseCase,
    SwitchUserActiveChatUseCase,
    TerminateChatUseCase,
  ],
})
export class ChatsModule {}

