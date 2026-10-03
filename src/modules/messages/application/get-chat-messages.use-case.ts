import { Injectable, Inject, Logger } from '@nestjs/common';
import { IMessageRepository, MESSAGE_REPOSITORY } from '../domain/message.repository.interface';
import { IChatRepository, CHAT_REPOSITORY } from '../../chats/domain/chat.repository.interface';
import { Message } from '../domain/message.entity';
import { UserNotChatParticipantError, ChatNotFoundError } from '../../../shared/domain/domain.error';

export interface GetChatMessagesInput {
  chatId: string;
  requestingUserId: string;
  limit?: number;
  offset?: number;
}

export interface GetChatMessagesOutput {
  messages: Message[];
  total: number;
}

@Injectable()
export class GetChatMessagesUseCase {
  private readonly logger = new Logger(GetChatMessagesUseCase.name);

  constructor(
    @Inject(MESSAGE_REPOSITORY)
    private readonly messageRepository: IMessageRepository,
    @Inject(CHAT_REPOSITORY)
    private readonly chatRepository: IChatRepository,
  ) {}

  async execute(input: GetChatMessagesInput): Promise<GetChatMessagesOutput> {
    const chat = await this.chatRepository.findById(input.chatId);
    if (!chat) {
      throw new ChatNotFoundError(`Chat with ID '${input.chatId}' does not exist`);
    }

    const isParticipant = await this.chatRepository.isParticipant(
      input.chatId,
      input.requestingUserId,
    );

    if (!isParticipant) {
      this.logger.warn(
        `Unauthorized message read attempt: User ${input.requestingUserId} -> Chat ${input.chatId}`,
      );
      throw new UserNotChatParticipantError(
        'You are not authorized to view messages in this chat',
      );
    }

    const limit = Math.min(input.limit ?? 50, 100);
    const offset = input.offset ?? 0;

    return await this.messageRepository.findByChatId(input.chatId, limit, offset);
  }
}
