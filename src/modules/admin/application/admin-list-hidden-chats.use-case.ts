import { Injectable, Inject } from '@nestjs/common';
import { IChatRepository, CHAT_REPOSITORY, ChatWithParticipants } from '../../chats/domain/chat.repository.interface';

export interface AdminListHiddenChatsInput {
  limit?: number;
  offset?: number;
}

export interface AdminListHiddenChatsOutput {
  chats: ChatWithParticipants[];
  total: number;
}

@Injectable()
export class AdminListHiddenChatsUseCase {
  constructor(
    @Inject(CHAT_REPOSITORY)
    private readonly chatRepository: IChatRepository,
  ) {}

  async execute(input: AdminListHiddenChatsInput): Promise<AdminListHiddenChatsOutput> {
    const limit = Math.min(input.limit ?? 20, 100);
    const offset = input.offset ?? 0;
    return await this.chatRepository.findAllHiddenChats(limit, offset);
  }
}
