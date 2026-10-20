import { Logger } from '../../../shared/infrastructure/logger';
import { IMessageRepository } from '../domain/message.repository.interface';
import { IChatRepository } from '../../chats/domain/chat.repository.interface';
import { Message } from '../domain/message.entity';
import {
  UserNotChatParticipantError,
  ValidationError,
  ChatNotFoundError,
} from '../../../shared/domain/domain.error';

export interface SendMessageInput {
  chatId: string;
  senderId: string;
  content: string;
}

export class SendMessageUseCase {
  private readonly logger = new Logger(SendMessageUseCase.name);

  constructor(
    private readonly messageRepository: IMessageRepository,
    private readonly chatRepository: IChatRepository,
  ) {}

  async execute(input: SendMessageInput): Promise<Message> {
    // 1. Validate content
    if (!input.content || input.content.trim().length === 0) {
      throw new ValidationError('Message content cannot be empty');
    }

    if (input.content.length > 4000) {
      throw new ValidationError('Message content exceeds maximum limit of 4000 characters');
    }

    // 2. Validate chat exists
    const chat = await this.chatRepository.findById(input.chatId);
    if (!chat) {
      throw new ChatNotFoundError(`Chat with ID '${input.chatId}' does not exist`);
    }

    // 3. Authorization check: sender MUST be a participant of the chat
    const isParticipant = await this.chatRepository.isParticipant(input.chatId, input.senderId);
    if (!isParticipant) {
      this.logger.warn(
        `Unauthorized message send attempt: User ${input.senderId} -> Chat ${input.chatId}`,
      );
      throw new UserNotChatParticipantError(
        'You are not authorized to send messages to this chat',
      );
    }

    // 4. Create message
    const message = await this.messageRepository.create({
      chatId: input.chatId,
      senderId: input.senderId,
      content: input.content.trim(),
    });

    this.logger.log(`Message ${message.id} sent to chat ${input.chatId} by user ${input.senderId}`);
    return message;
  }
}
