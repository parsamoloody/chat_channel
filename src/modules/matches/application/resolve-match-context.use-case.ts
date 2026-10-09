import { Injectable, Inject, Logger, Optional } from '@nestjs/common';
import { Match } from '../domain/match.entity';
import { MatchStatus } from '../domain/match-status.enum';
import { IMatchRepository, MATCH_REPOSITORY } from '../domain/match.repository.interface';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import { ExternalMatchPoolService } from './external-match-pool.service';
import {
  MatchNotFoundError,
  MatchExpiredError,
  UserNotMatchParticipantError,
} from '../../../shared/domain/domain.error';

export interface ResolveMatchContextInput {
  referenceId: string;
  requestingUserId: string;
}

export interface ResolveMatchContextOutput {
  match: Match;
  matchedWithUserId: string | null;
  isPendingWaitingForPartner?: boolean;
  justConnectedPartner?: boolean;
}

@Injectable()
export class ResolveMatchContextUseCase {
  private readonly logger = new Logger(ResolveMatchContextUseCase.name);

  constructor(
    @Inject(MATCH_REPOSITORY)
    private readonly matchRepository: IMatchRepository,
    @Optional()
    private readonly prisma?: PrismaService,
    @Optional()
    private readonly matchPoolService?: ExternalMatchPoolService,
  ) {}

  async execute(input: ResolveMatchContextInput): Promise<ResolveMatchContextOutput> {
    let match = await this.matchRepository.findByExternalMatchId(input.referenceId);

    // If no match row exists in Match table yet, check if referenceId exists in ExternalMatchPool
    if (!match) {
      if (!this.prisma) {
        this.logger.warn(`Match not found for reference ID: ${input.referenceId}`);
        throw new MatchNotFoundError(`No active match found for reference ID '${input.referenceId}'`);
      }

      const clean = input.referenceId.replace(/^(ref_|match_)/, '');
      const poolItem = await this.prisma.externalMatchPool.findFirst({
        where: {
          OR: [
            { externalMatchId: input.referenceId },
            { externalMatchId: `match_${clean}` },
            { externalMatchId: clean },
          ],
        },
      });

      if (!poolItem) {
        this.logger.warn(`Match not found for reference ID: ${input.referenceId}`);
        throw new MatchNotFoundError(`No active match found for reference ID '${input.referenceId}'`);
      }

      if (poolItem.status === 'USED') {
        throw new MatchExpiredError(`This match link '${input.referenceId}' has already been used and closed.`);
      }

      // First user claims this available match ID from the pool!
      match = await this.matchRepository.create({
        externalMatchId: poolItem.externalMatchId,
        user1Id: input.requestingUserId,
        status: MatchStatus.PENDING,
      });

      this.logger.log(
        `User ${input.requestingUserId} claimed available pool match ${poolItem.externalMatchId}. Waiting for partner...`,
      );

      return {
        match,
        matchedWithUserId: null,
        isPendingWaitingForPartner: true,
      };
    }

    // If match exists and is in PENDING state (waiting for user2)
    if (match.isPending()) {
      if (match.user1Id === input.requestingUserId) {
        // User 1 clicked again while still waiting for User 2
        return {
          match,
          matchedWithUserId: null,
          isPendingWaitingForPartner: true,
        };
      }

      // User 2 has joined! Connect them!
      const updatedMatch = await this.matchRepository.assignUser2(
        match.id,
        input.requestingUserId,
        MatchStatus.ACTIVE,
      );

      if (this.matchPoolService) {
        await this.matchPoolService.markMatchIdUsed(match.externalMatchId);
      }

      this.logger.log(
        `User ${input.requestingUserId} joined pending match ${match.id}. Partner: ${match.user1Id}. Match is now ACTIVE!`,
      );

      return {
        match: updatedMatch,
        matchedWithUserId: match.user1Id,
        isPendingWaitingForPartner: false,
        justConnectedPartner: true,
      };
    }

    // Match exists and both users are set
    if (!match.isActive()) {
      this.logger.warn(`Match ${match.id} (external: ${input.referenceId}) has expired`);
      throw new MatchExpiredError(`The match referenced by '${input.referenceId}' has expired or was cancelled`);
    }

    if (!match.isParticipant(input.requestingUserId)) {
      this.logger.warn(
        `User ${input.requestingUserId} attempted to access match ${match.id} which they do not belong to`,
      );
      throw new UserNotMatchParticipantError(
        `You are not an authorized participant in the referenced match`,
      );
    }

    const matchedWithUserId = match.getOtherParticipantId(input.requestingUserId);

    this.logger.log(
      `Resolved match ${match.id} for user ${input.requestingUserId} matched with ${matchedWithUserId}`,
    );

    return {
      match,
      matchedWithUserId,
      isPendingWaitingForPartner: false,
    };
  }
}
