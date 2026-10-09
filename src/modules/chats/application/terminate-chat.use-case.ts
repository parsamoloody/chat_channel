import { Injectable, Inject, Logger } from '@nestjs/common';
import { IUserRepository, USER_REPOSITORY } from '../../users/domain/user.repository.interface';
import { IChatRepository, CHAT_REPOSITORY } from '../domain/chat.repository.interface';
import { IMatchRepository, MATCH_REPOSITORY } from '../../matches/domain/match.repository.interface';
import { MatchStatus } from '../../matches/domain/match-status.enum';
import { UserActiveChatService } from './user-active-chat.service';

export interface TerminateChatInput {
  telegramUserId: string;
  chatId: string;
}

export interface TerminateChatOutput {
  success: boolean;
  error?: string;
  partnerName?: string;
  partnerTelegramUserId?: string;
}

@Injectable()
export class TerminateChatUseCase {
  private readonly logger = new Logger(TerminateChatUseCase.name);

  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
    @Inject(CHAT_REPOSITORY)
    private readonly chatRepository: IChatRepository,
    @Inject(MATCH_REPOSITORY)
    private readonly matchRepository: IMatchRepository,
    private readonly userActiveChatService: UserActiveChatService,
  ) {}

  async execute(input: TerminateChatInput): Promise<TerminateChatOutput> {
    const user = await this.userRepository.findByTelegramUserId(input.telegramUserId);
    if (!user) {
      return { success: false, error: 'USER_NOT_FOUND' };
    }

    // Verify user is a participant in this chat
    const isParticipant = await this.chatRepository.isParticipant(input.chatId, user.id);
    if (!isParticipant) {
      this.logger.warn(`User ${user.id} tried to terminate chat ${input.chatId} which they don't belong to`);
      return { success: false, error: 'NOT_PARTICIPANT' };
    }

    // Get chat with participants to find the partner
    const chatWithParticipants = await this.chatRepository.findWithParticipants(input.chatId);
    if (!chatWithParticipants) {
      return { success: false, error: 'CHAT_NOT_FOUND' };
    }

    const partnerParticipant = chatWithParticipants.participants.find((p) => p.userId !== user.id);
    let partnerName = 'کاربر';
    let partnerTelegramUserId: string | undefined;

    if (partnerParticipant) {
      const partnerUser = await this.userRepository.findById(partnerParticipant.userId);
      if (partnerUser) {
        partnerName =
          [partnerUser.firstName, partnerUser.lastName].filter(Boolean).join(' ') ||
          partnerUser.username ||
          'کاربر';
        partnerTelegramUserId = partnerUser.telegramUserId;

        // Clear partner's active chat if it was this chat
        const partnerActiveChat = this.userActiveChatService.getActiveChat(partnerUser.id);
        if (partnerActiveChat === input.chatId) {
          this.userActiveChatService.clearActiveChat(partnerUser.id);
        }
      }
    }

    // If the chat has a matchId, close the match
    if (chatWithParticipants.chat.matchId) {
      try {
        await this.matchRepository.updateStatus(chatWithParticipants.chat.matchId, MatchStatus.CANCELLED);
        this.logger.log(`Match ${chatWithParticipants.chat.matchId} cancelled due to chat termination by user ${user.id}`);
      } catch (err: any) {
        this.logger.warn(`Could not update match status: ${err.message}`);
      }
    }

    // Clear the user's active chat
    const userActiveChat = this.userActiveChatService.getActiveChat(user.id);
    if (userActiveChat === input.chatId) {
      this.userActiveChatService.clearActiveChat(user.id);
    }

    this.logger.log(`User ${user.id} terminated chat ${input.chatId} with partner ${partnerName}`);

    return {
      success: true,
      partnerName,
      partnerTelegramUserId,
    };
  }
}
