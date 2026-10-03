import { Injectable, Inject } from '@nestjs/common';
import { IChatRepository, CHAT_REPOSITORY, ChatWithParticipants } from '../../chats/domain/chat.repository.interface';
import { IMatchRepository, MATCH_REPOSITORY } from '../../matches/domain/match.repository.interface';
import { IUserRepository, USER_REPOSITORY } from '../../users/domain/user.repository.interface';
import { ChatNotFoundError } from '../../../shared/domain/domain.error';

export interface AdminInspectChatOutput {
  chat: ChatWithParticipants;
  match: any | null;
  users: any[];
}

@Injectable()
export class AdminInspectChatUseCase {
  constructor(
    @Inject(CHAT_REPOSITORY)
    private readonly chatRepository: IChatRepository,
    @Inject(MATCH_REPOSITORY)
    private readonly matchRepository: IMatchRepository,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
  ) {}

  async execute(chatId: string): Promise<AdminInspectChatOutput> {
    const chatWithParticipants = await this.chatRepository.findWithParticipants(chatId);
    if (!chatWithParticipants) {
      throw new ChatNotFoundError(`Chat with ID '${chatId}' not found`);
    }

    let match = null;
    if (chatWithParticipants.chat.matchId) {
      match = await this.matchRepository.findById(chatWithParticipants.chat.matchId);
    }

    const users = await Promise.all(
      chatWithParticipants.participants.map(async (p) => {
        const u = await this.userRepository.findById(p.userId);
        return {
          participantId: p.id,
          role: p.role,
          joinedAt: p.joinedAt,
          user: u,
        };
      }),
    );

    return {
      chat: chatWithParticipants,
      match,
      users,
    };
  }
}
