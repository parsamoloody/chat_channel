import { Module } from '@nestjs/common';
import { CHAT_REPOSITORY } from './domain/chat.repository.interface';
import { PrismaChatRepository } from './infrastructure/prisma-chat.repository';
import { GetOrCreateMatchChatUseCase } from './application/get-or-create-match-chat.use-case';
import { GetChatDetailsUseCase } from './application/get-chat-details.use-case';
import { GetUserChatsUseCase } from './application/get-user-chats.use-case';
import { ChatsController } from './presentation/chats.controller';

@Module({
  controllers: [ChatsController],
  providers: [
    {
      provide: CHAT_REPOSITORY,
      useClass: PrismaChatRepository,
    },
    GetOrCreateMatchChatUseCase,
    GetChatDetailsUseCase,
    GetUserChatsUseCase,
  ],
  exports: [
    CHAT_REPOSITORY,
    GetOrCreateMatchChatUseCase,
    GetChatDetailsUseCase,
    GetUserChatsUseCase,
  ],
})
export class ChatsModule {}
