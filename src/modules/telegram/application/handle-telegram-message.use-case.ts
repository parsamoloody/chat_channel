import { Injectable, Logger, Inject } from '@nestjs/common';
import { IUserRepository, USER_REPOSITORY } from '../../users/domain/user.repository.interface';
import { IChatRepository, CHAT_REPOSITORY } from '../../chats/domain/chat.repository.interface';
import { SendMessageUseCase } from '../../messages/application/send-message.use-case';
import { Message } from '../../messages/domain/message.entity';

export interface HandleTelegramMessageInput {
  telegramUserId: string;
  content: string;
}

export interface HandleTelegramMessageOutput {
  success: boolean;
  message?: Message;
  recipientTelegramUserId?: string;
  responseToSender: string;
}

@Injectable()
export class HandleTelegramMessageUseCase {
  private readonly logger = new Logger(HandleTelegramMessageUseCase.name);

  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
    @Inject(CHAT_REPOSITORY)
    private readonly chatRepository: IChatRepository,
    private readonly sendMessageUseCase: SendMessageUseCase,
  ) {}

  async execute(input: HandleTelegramMessageInput): Promise<HandleTelegramMessageOutput> {
    const user = await this.userRepository.findByTelegramUserId(input.telegramUserId);
    if (!user) {
      return {
        success: false,
        responseToSender: 'Please click the link from your Dating Bot first to start your chat.',
      };
    }

    // Find the user's active chats (including hidden ones)
    const userChats = await this.chatRepository.findUserChats(user.id, true);
    if (userChats.length === 0) {
      return {
        success: false,
        responseToSender: 'You do not have an active chat yet. Please click your match link to connect.',
      };
    }

    // Pick the active chat (most recent)
    const activeChat = userChats[0];

    try {
      const savedMessage = await this.sendMessageUseCase.execute({
        chatId: activeChat.id,
        senderId: user.id,
        content: input.content,
      });

      // Find recipient user to forward message if needed
      const fullChat = await this.chatRepository.findWithParticipants(activeChat.id);
      let recipientTelegramUserId: string | undefined;

      if (fullChat) {
        const otherParticipant = fullChat.participants.find((p) => p.userId !== user.id);
        if (otherParticipant) {
          const recipientUser = await this.userRepository.findById(otherParticipant.userId);
          if (recipientUser) {
            recipientTelegramUserId = recipientUser.telegramUserId;
          }
        }
      }

      return {
        success: true,
        message: savedMessage,
        recipientTelegramUserId,
        responseToSender: 'Message delivered',
      };
    } catch (error: any) {
      this.logger.error(`Error sending message for telegram user ${input.telegramUserId}: ${error.message}`);
      return {
        success: false,
        responseToSender: 'Failed to deliver message. Please try again.',
      };
    }
  }
}
