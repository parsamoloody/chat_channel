import { Injectable, Inject } from '@nestjs/common';
import { IChatRepository, CHAT_REPOSITORY } from '../domain/chat.repository.interface';
import { Chat } from '../domain/chat.entity';

export interface GetUserChatsInput {
  userId: string;
  includeHidden?: boolean;
}

@Injectable()
export class GetUserChatsUseCase {
  constructor(
    @Inject(CHAT_REPOSITORY)
    private readonly chatRepository: IChatRepository,
  ) {}

  async execute(input: GetUserChatsInput): Promise<Chat[]> {
    // Hidden chats are excluded by default for standard chat list views
    return await this.chatRepository.findUserChats(input.userId, input.includeHidden ?? false);
  }
}
