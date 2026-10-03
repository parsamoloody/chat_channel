import { Injectable, Inject, Logger } from '@nestjs/common';
import { Match } from '../domain/match.entity';
import { IMatchRepository, MATCH_REPOSITORY } from '../domain/match.repository.interface';
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
  matchedWithUserId: string;
}

@Injectable()
export class ResolveMatchContextUseCase {
  private readonly logger = new Logger(ResolveMatchContextUseCase.name);

  constructor(
    @Inject(MATCH_REPOSITORY)
    private readonly matchRepository: IMatchRepository,
  ) {}

  async execute(input: ResolveMatchContextInput): Promise<ResolveMatchContextOutput> {
    const match = await this.matchRepository.findByExternalMatchId(input.referenceId);

    if (!match) {
      this.logger.warn(`Match not found for reference ID: ${input.referenceId}`);
      throw new MatchNotFoundError(`No active match found for reference ID '${input.referenceId}'`);
    }

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
    };
  }
}
