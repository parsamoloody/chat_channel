import { Injectable, Inject, Logger } from '@nestjs/common';
import { IChatRepository, CHAT_REPOSITORY, ChatWithParticipants } from '../domain/chat.repository.interface';
import {
  ChatNotFoundError,
  UserNotChatParticipantError,
} from '../../../shared/domain/domain.error';

export interface GetChatDetailsInput {
  chatId: string;
  requestingUserId: string;
}

@Injectable()
export class GetChatDetailsUseCase {
  private readonly logger = new Logger(GetChatDetailsUseCase.name);

  constructor(
    @Inject(CHAT_REPOSITORY)
    private readonly chatRepository: IChatRepository,
  ) {}

  async execute(input: GetChatDetailsInput): Promise<ChatWithParticipants> {
    const isParticipant = await this.chatRepository.isParticipant(
      input.chatId,
      input.requestingUserId,
    );

    if (!isParticipant) {
      this.logger.warn(
        `Unauthorized chat access attempt: User ${input.requestingUserId} -> Chat ${input.chatId}`,
      );
      throw new UserNotChatParticipantError(
        'You are not authorized to access this chat',
      );
    }

    const chatWithParticipants = await this.chatRepository.findWithParticipants(input.chatId);
    if (!chatWithParticipants) {
      throw new ChatNotFoundError(`Chat with ID '${input.chatId}' not found`);
    }

    return chatWithParticipants;
  }
}
