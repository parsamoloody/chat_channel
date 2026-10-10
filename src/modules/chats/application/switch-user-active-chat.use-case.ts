import { Injectable, Inject, Logger } from '@nestjs/common';
import { IUserRepository, USER_REPOSITORY } from '../../users/domain/user.repository.interface';
import { IChatRepository, CHAT_REPOSITORY } from '../domain/chat.repository.interface';
import { UserActiveChatService } from './user-active-chat.service';
import { User } from '../../users/domain/user.entity';

export interface SwitchUserActiveChatInput {
  telegramUserId: string;
  targetChatId: string;
}

export interface SwitchUserActiveChatOutput {
  success: boolean;
  error?: string;
  chatId?: string;
  partnerUser?: User;
  partnerName?: string;
}

@Injectable()
export class SwitchUserActiveChatUseCase {
  private readonly logger = new Logger(SwitchUserActiveChatUseCase.name);

  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
    @Inject(CHAT_REPOSITORY)
    private readonly chatRepository: IChatRepository,
    private readonly userActiveChatService: UserActiveChatService,
  ) {}

  async execute(input: SwitchUserActiveChatInput): Promise<SwitchUserActiveChatOutput> {
    const user = await this.userRepository.findByTelegramUserId(input.telegramUserId);
    if (!user) {
      return {
        success: false,
        error: 'USER_NOT_FOUND',
      };
    }

    const isMember = await this.chatRepository.isParticipant(input.targetChatId, user.id);
    if (!isMember) {
      this.logger.warn(`User ${user.id} tried to switch to unauthorized chat ${input.targetChatId}`);
      return {
        success: false,
        error: 'UNAUTHORIZED',
      };
    }

    if (this.userActiveChatService.isChatTerminated(input.targetChatId)) {
      this.logger.warn(`User ${user.id} tried to switch to terminated chat ${input.targetChatId}`);
      return {
        success: false,
        error: 'CHAT_TERMINATED',
      };
    }

    // Set new active chat
    this.userActiveChatService.setActiveChat(user.id, input.targetChatId);
    this.logger.log(`Switched active chat for user ${user.id} to ${input.targetChatId}`);

    const fullChat = await this.chatRepository.findWithParticipants(input.targetChatId);
    const partnerParticipant = fullChat?.participants.find((p) => p.userId !== user.id);

    let partnerUser: User | undefined;
    let partnerName = 'کاربر ناشناس';

    if (partnerParticipant) {
      const pUser = await this.userRepository.findById(partnerParticipant.userId);
      if (pUser) {
        partnerUser = pUser;
        partnerName =
          [pUser.firstName, pUser.lastName].filter(Boolean).join(' ') ||
          pUser.username ||
          'کاربر';
      }
    }

    return {
      success: true,
      chatId: input.targetChatId,
      partnerUser,
      partnerName,
    };
  }
}
