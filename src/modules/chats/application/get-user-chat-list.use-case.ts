import { Injectable, Inject, Logger, Optional } from '@nestjs/common';
import { IUserRepository, USER_REPOSITORY } from '../../users/domain/user.repository.interface';
import { IChatRepository, CHAT_REPOSITORY } from '../domain/chat.repository.interface';
import { IMatchRepository, MATCH_REPOSITORY } from '../../matches/domain/match.repository.interface';
import { MatchStatus } from '../../matches/domain/match-status.enum';
import { UserActiveChatService } from './user-active-chat.service';
import { User } from '../../users/domain/user.entity';

export interface ChatListItem {
  chatId: string;
  partnerUser: User;
  partnerName: string;
  isCurrentActive: boolean;
}

export interface GetUserChatListInput {
  telegramUserId: string;
  autoSelectIfNone?: boolean;
}

export interface GetUserChatListOutput {
  success: boolean;
  error?: string;
  currentActiveChatId?: string | null;
  chats: ChatListItem[];
}

@Injectable()
export class GetUserChatListUseCase {
  private readonly logger = new Logger(GetUserChatListUseCase.name);

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

  async execute(input: GetUserChatListInput): Promise<GetUserChatListOutput> {
    const user = await this.userRepository.findByTelegramUserId(input.telegramUserId);
    if (!user) {
      return {
        success: false,
        error: 'USER_NOT_FOUND',
        chats: [],
      };
    }

    // Include hidden chats so user can see all their match chats
    const userChats = await this.chatRepository.findUserChats(user.id, true);
    if (userChats.length === 0) {
      return {
        success: true,
        currentActiveChatId: null,
        chats: [],
      };
    }

    let activeChatId = this.userActiveChatService.getActiveChat(user.id);

    const items: ChatListItem[] = [];

    for (const chat of userChats) {
      // Ignore terminated chats
      if (this.userActiveChatService.isChatTerminated(chat.id)) {
        continue;
      }

      if (this.matchRepository && chat.matchId) {
        const match = await this.matchRepository.findById(chat.matchId);
        if (match && match.status === MatchStatus.CANCELLED) {
          continue;
        }
      }

      const fullChat = await this.chatRepository.findWithParticipants(chat.id);
      const partnerParticipant = fullChat?.participants.find((p) => p.userId !== user.id);

      // Strictly ignore orphaned chats with no partner
      if (!partnerParticipant) continue;

      const partnerUser = await this.userRepository.findById(partnerParticipant.userId);
      if (!partnerUser) continue;

      const partnerName =
        [partnerUser.firstName, partnerUser.lastName].filter(Boolean).join(' ') ||
        partnerUser.username ||
        'کاربر';

      items.push({
        chatId: chat.id,
        partnerUser,
        partnerName,
        isCurrentActive: chat.id === activeChatId,
      });
    }

    if (items.length === 0) {
      return {
        success: true,
        currentActiveChatId: null,
        chats: [],
      };
    }

    const autoSelect = input.autoSelectIfNone ?? true;
    if (autoSelect) {
      // If activeChatId was not set or was pointing to an invalid/orphaned chat, pick first valid chat
      if (!activeChatId || !items.some((i) => i.chatId === activeChatId)) {
        activeChatId = items[0].chatId;
        this.userActiveChatService.setActiveChat(user.id, activeChatId);
        items[0].isCurrentActive = true;
      }
    } else {
      if (!items.some((i) => i.chatId === activeChatId)) {
        activeChatId = undefined;
      }
    }

    return {
      success: true,
      currentActiveChatId: activeChatId ?? null,
      chats: items,
    };
  }
}
