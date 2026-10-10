import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
import { FindOrCreateTelegramUserUseCase } from '../../users/application/find-or-create-telegram-user.use-case';
import { ProcessReferralUseCase } from '../../referrals/application/process-referral.use-case';
import { ResolveMatchContextUseCase } from '../../matches/application/resolve-match-context.use-case';
import { GetOrCreateMatchChatUseCase } from '../../chats/application/get-or-create-match-chat.use-case';
import { UserActiveChatService } from '../../chats/application/user-active-chat.service';
import { ExternalMatchPoolService } from '../../matches/application/external-match-pool.service';
import { REPLY_TEXTS } from '../constants/reply-texts';
import {
  IReferralRepository,
  REFERRAL_REPOSITORY,
} from '../../referrals/domain/referral.repository.interface';
import { ReferralStatus } from '../../referrals/domain/referral-source.enum';
import {
  MatchNotFoundError,
  MatchExpiredError,
  UserNotMatchParticipantError,
} from '../../../shared/domain/domain.error';
import { User } from '../../users/domain/user.entity';

export interface HandleTelegramStartInput {
  telegramUserId: string;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  startPayload?: string | null;
}

export type TelegramStartStatus =
  | 'ORGANIC'
  | 'CONNECTED'
  | 'ALREADY_CONNECTED'
  | 'INVALID_REFERRAL'
  | 'MATCH_NOT_FOUND'
  | 'MATCH_EXPIRED'
  | 'UNAUTHORIZED';

export interface HandleTelegramStartOutput {
  status: TelegramStartStatus;
  message: string;
  user: User;
  chatId?: string;
  matchedWithUserId?: string;
  notifyPartnerUserId?: string;
}

@Injectable()
export class HandleTelegramStartUseCase {
  private readonly logger = new Logger(HandleTelegramStartUseCase.name);

  constructor(
    private readonly findOrCreateUserUseCase: FindOrCreateTelegramUserUseCase,
    private readonly processReferralUseCase: ProcessReferralUseCase,
    private readonly resolveMatchContextUseCase: ResolveMatchContextUseCase,
    private readonly getOrCreateMatchChatUseCase: GetOrCreateMatchChatUseCase,
    @Inject(REFERRAL_REPOSITORY)
    private readonly referralRepository: IReferralRepository,
    @Optional()
    private readonly userActiveChatService?: UserActiveChatService,
    @Optional()
    private readonly matchPoolService?: ExternalMatchPoolService,
  ) {}


  async execute(input: HandleTelegramStartInput): Promise<HandleTelegramStartOutput> {
    this.logger.log(
      `telegram.start.received: telegramUserId=${input.telegramUserId} payload=${input.startPayload ?? '<none>'}`,
    );

    // 1. Find or create user
    const user = await this.findOrCreateUserUseCase.execute({
      telegramUserId: input.telegramUserId,
      username: input.username,
      firstName: input.firstName,
      lastName: input.lastName,
    });

    // 2. Process referral or organic entry
    const { referral, parseResult, isDuplicate } = await this.processReferralUseCase.execute({
      userId: user.id,
      rawPayload: input.startPayload,
    });

    // Case 1: Organic User
    if (parseResult.isOrganic) {
      this.logger.log(`User ${user.id} entered organically without referral`);
      return {
        status: 'ORGANIC',
        message: REPLY_TEXTS.START_ORGANIC,
        user,
      };
    }

    // Case 2: Invalid / Malformed Referral Payload
    if (!parseResult.isValid) {
      this.logger.warn(`referral.invalid for user ${user.id}: ${parseResult.errorMessage}`);
      return {
        status: 'INVALID_REFERRAL',
        message: REPLY_TEXTS.START_INVALID_REFERRAL,
        user,
      };
    }

    // Case 3: Valid Referral Payload -> Resolve Match & Connect Chat
    const referenceId = parseResult.referenceId!;
    try {
      const matchResult = await this.resolveMatchContextUseCase.execute({
        referenceId,
        requestingUserId: user.id,
      });

      const { match, matchedWithUserId, isPendingWaitingForPartner, justConnectedPartner } = matchResult;

      // If user 1 opened the link first, they are waiting for user 2 to join
      if (isPendingWaitingForPartner) {
        return {
          status: 'CONNECTED',
          message: REPLY_TEXTS.START_WAITING_FOR_PARTNER,
          user,
        };
      }

      // 4. Create or retrieve hidden chat with both participants
      const { chat } = await this.getOrCreateMatchChatUseCase.execute({
        matchId: match.id,
        participantUserIds: [match.user1Id, match.user2Id!],
        title: `Match Chat (${match.externalMatchId})`,
      });

      // 5. Update referral status to RESOLVED
      await this.referralRepository.updateStatus(referral.id, ReferralStatus.RESOLVED);

      if (this.userActiveChatService) {
        this.userActiveChatService.setActiveChat(user.id, chat.id);
        if (matchedWithUserId && !this.userActiveChatService.getActiveChat(matchedWithUserId)) {
          this.userActiveChatService.setActiveChat(matchedWithUserId, chat.id);
        }
      }

      this.logger.log(`chat.resolved: chatId=${chat.id} matchId=${match.id} user=${user.id}`);

      if (this.matchPoolService && referenceId) {
        await this.matchPoolService.markMatchIdUsed(referenceId).catch(() => {});
      }

      const connectedMsg = justConnectedPartner
        ? REPLY_TEXTS.START_PARTNER_WAITING
        : REPLY_TEXTS.START_CONNECTED;

      return {
        status: isDuplicate ? 'ALREADY_CONNECTED' : 'CONNECTED',
        message: isDuplicate
          ? REPLY_TEXTS.START_ALREADY_CONNECTED
          : connectedMsg,
        user,
        chatId: chat.id,
        matchedWithUserId: matchedWithUserId ?? undefined,
        notifyPartnerUserId: justConnectedPartner && matchedWithUserId ? matchedWithUserId : undefined,
      };
    } catch (error: any) {
      // Mark referral as FAILED if error occurred
      await this.referralRepository.updateStatus(referral.id, ReferralStatus.FAILED);

      if (error instanceof MatchNotFoundError) {
        this.logger.warn(`referral.not_found for user ${user.id}, referenceId ${referenceId}`);
        return {
          status: 'MATCH_NOT_FOUND',
          message: REPLY_TEXTS.START_MATCH_NOT_FOUND,
          user,
        };
      }

      if (error instanceof MatchExpiredError) {
        this.logger.warn(`referral.expired for user ${user.id}, referenceId ${referenceId}`);
        return {
          status: 'MATCH_EXPIRED',
          message: REPLY_TEXTS.START_MATCH_EXPIRED,
          user,
        };
      }

      if (error instanceof UserNotMatchParticipantError) {
        this.logger.warn(`chat.access.denied for user ${user.id}, referenceId ${referenceId}`);
        return {
          status: 'UNAUTHORIZED',
          message: REPLY_TEXTS.START_UNAUTHORIZED,
          user,
        };
      }

      this.logger.error(`Unexpected error resolving referral ${referenceId}: ${error.message}`, error.stack);
      return {
        status: 'INVALID_REFERRAL',
        message: REPLY_TEXTS.START_ERROR,
        user,
      };
    }
  }
}
