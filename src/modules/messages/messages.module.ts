import { Module } from '@nestjs/common';
import { MESSAGE_REPOSITORY } from './domain/message.repository.interface';
import { PrismaMessageRepository } from './infrastructure/prisma-message.repository';
import { SendMessageUseCase } from './application/send-message.use-case';
import { GetChatMessagesUseCase } from './application/get-chat-messages.use-case';
import { MessagesController } from './presentation/messages.controller';
import { ChatsModule } from '../chats/chats.module';

@Module({
  imports: [ChatsModule],
  controllers: [MessagesController],
  providers: [
    {
      provide: MESSAGE_REPOSITORY,
      useClass: PrismaMessageRepository,
    },
    SendMessageUseCase,
    GetChatMessagesUseCase,
  ],
  exports: [MESSAGE_REPOSITORY, SendMessageUseCase, GetChatMessagesUseCase],
})
export class MessagesModule {}
