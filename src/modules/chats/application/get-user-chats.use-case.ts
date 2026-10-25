import { IChatRepository } from '../domain/chat.repository.interface';
import { Chat } from '../domain/chat.entity';

export interface GetUserChatsInput {
  userId: string;
  includeHidden?: boolean;
}

export class GetUserChatsUseCase {
  constructor(private readonly chatRepository: IChatRepository) {}

  async execute(input: GetUserChatsInput): Promise<Chat[]> {
    return await this.chatRepository.findUserChats(input.userId, input.includeHidden ?? true);
  }
}
