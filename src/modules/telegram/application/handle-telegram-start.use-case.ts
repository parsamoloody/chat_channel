import { Injectable, Logger, Inject } from '@nestjs/common';
import { FindOrCreateTelegramUserUseCase } from '../../users/application/find-or-create-telegram-user.use-case';
import { ProcessReferralUseCase } from '../../referrals/application/process-referral.use-case';
import { ResolveMatchContextUseCase } from '../../matches/application/resolve-match-context.use-case';
import { GetOrCreateMatchChatUseCase } from '../../chats/application/get-or-create-match-chat.use-case';
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
        message: 'Welcome! You entered without a match referral link. When you match with someone in our dating service, click their link to start a private chat.',
        user,
      };
    }

    // Case 2: Invalid / Malformed Referral Payload
    if (!parseResult.isValid) {
      this.logger.warn(`referral.invalid for user ${user.id}: ${parseResult.errorMessage}`);
      return {
        status: 'INVALID_REFERRAL',
        message: 'The link you used is invalid or malformed. Please return to the Dating Bot and click the match link again.',
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

      const { match, matchedWithUserId } = matchResult;

      // 4. Create or retrieve hidden chat with both participants
      const { chat } = await this.getOrCreateMatchChatUseCase.execute({
        matchId: match.id,
        participantUserIds: [match.user1Id, match.user2Id],
        title: `Match Chat (${match.externalMatchId})`,
      });

      // 5. Update referral status to RESOLVED
      await this.referralRepository.updateStatus(referral.id, ReferralStatus.RESOLVED);

      this.logger.log(`chat.resolved: chatId=${chat.id} matchId=${match.id} user=${user.id}`);

      return {
        status: isDuplicate ? 'ALREADY_CONNECTED' : 'CONNECTED',
        message: isDuplicate
          ? 'You are already connected to your private chat with your match! Send a message below to chat.'
          : '🎉 You have been connected to a private hidden chat with your match! Any messages you send here are private between you two.',
        user,
        chatId: chat.id,
        matchedWithUserId,
      };
    } catch (error: any) {
      // Mark referral as FAILED if error occurred
      await this.referralRepository.updateStatus(referral.id, ReferralStatus.FAILED);

      if (error instanceof MatchNotFoundError) {
        this.logger.warn(`referral.not_found for user ${user.id}, referenceId ${referenceId}`);
        return {
          status: 'MATCH_NOT_FOUND',
          message: 'No active match was found for this link. It may have been removed or already closed.',
          user,
        };
      }

      if (error instanceof MatchExpiredError) {
        this.logger.warn(`referral.expired for user ${user.id}, referenceId ${referenceId}`);
        return {
          status: 'MATCH_EXPIRED',
          message: 'This match link has expired. Please check your Dating Bot for updated matches.',
          user,
        };
      }

      if (error instanceof UserNotMatchParticipantError) {
        this.logger.warn(`chat.access.denied for user ${user.id}, referenceId ${referenceId}`);
        return {
          status: 'UNAUTHORIZED',
          message: 'You are not authorized to access this match chat.',
          user,
        };
      }

      this.logger.error(`Unexpected error resolving referral ${referenceId}: ${error.message}`, error.stack);
      return {
        status: 'INVALID_REFERRAL',
        message: 'An unexpected error occurred while connecting your chat. Please try again later.',
        user,
      };
    }
  }
}
