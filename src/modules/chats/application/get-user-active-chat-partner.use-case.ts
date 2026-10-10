import { Injectable, Inject, Logger, Optional } from '@nestjs/common';
import { IUserRepository, USER_REPOSITORY } from '../../users/domain/user.repository.interface';
import { IChatRepository, CHAT_REPOSITORY } from '../domain/chat.repository.interface';
import { IMatchRepository, MATCH_REPOSITORY } from '../../matches/domain/match.repository.interface';
import { MatchStatus } from '../../matches/domain/match-status.enum';
import { UserActiveChatService } from './user-active-chat.service';
import { User } from '../../users/domain/user.entity';

export interface GetUserActiveChatPartnerInput {
  telegramUserId: string;
}

export interface GetUserActiveChatPartnerOutput {
  success: boolean;
  error?: string;
  chatId?: string;
  partnerUser?: User;
  partnerName?: string;
}

@Injectable()
export class GetUserActiveChatPartnerUseCase {
  private readonly logger = new Logger(GetUserActiveChatPartnerUseCase.name);

  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
    @Inject(CHAT_REPOSITORY)
    private readonly chatRepository: IChatRepository,
    private readonly userActiveChatService: UserActiveChatService,
    @Optional()
    @Inject(MATCH_REPOSITORY)
    private readonly matchRepository?: IMatchRepository,
  ) {}

  async execute(input: GetUserActiveChatPartnerInput): Promise<GetUserActiveChatPartnerOutput> {
    const user = await this.userRepository.findByTelegramUserId(input.telegramUserId);
    if (!user) {
      return {
        success: false,
        error: 'USER_NOT_FOUND',
      };
    }

    const userChats = await this.chatRepository.findUserChats(user.id, true);
    if (userChats.length === 0) {
      return {
        success: false,
        error: 'NO_CHATS',
      };
    }

    // Determine current active chat ID
    let activeChatId = this.userActiveChatService.getActiveChat(user.id);
    if (activeChatId && this.userActiveChatService.isChatTerminated(activeChatId)) {
      activeChatId = undefined;
    }

    let fullChat = activeChatId ? await this.chatRepository.findWithParticipants(activeChatId) : null;
    let partnerParticipant = fullChat?.participants.find((p) => p.userId !== user.id);

    // If activeChatId was invalid, not set, or had no partner, search for first valid chat
    if (!partnerParticipant) {
      for (const chat of userChats) {
        if (this.userActiveChatService.isChatTerminated(chat.id)) {
          continue;
        }
        if (this.matchRepository && chat.matchId) {
          const match = await this.matchRepository.findById(chat.matchId);
          if (match && match.status === MatchStatus.CANCELLED) {
            continue;
          }
        }

        const fc = await this.chatRepository.findWithParticipants(chat.id);
        const p = fc?.participants.find((part) => part.userId !== user.id);
        if (p) {
          activeChatId = chat.id;
          fullChat = fc;
          partnerParticipant = p;
          this.userActiveChatService.setActiveChat(user.id, activeChatId);
          break;
        }
      }
    }

    if (!partnerParticipant || !fullChat || !activeChatId) {
      return {
        success: false,
        error: 'NO_PARTNER',
      };
    }

    const partnerUser = await this.userRepository.findById(partnerParticipant.userId);
    if (!partnerUser) {
      return {
        success: false,
        error: 'PARTNER_NOT_FOUND',
      };
    }

    const partnerName =
      [partnerUser.firstName, partnerUser.lastName].filter(Boolean).join(' ') ||
      partnerUser.username ||
      'کاربر';

    return {
      success: true,
      chatId: activeChatId,
      partnerUser,
      partnerName,
    };
  }
}
