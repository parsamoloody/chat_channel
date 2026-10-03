import { Match } from './match.entity';
import { MatchStatus } from './match-status.enum';

export const MATCH_REPOSITORY = Symbol('MATCH_REPOSITORY');

export interface CreateMatchData {
  externalMatchId: string;
  user1Id: string;
  user2Id: string;
  status?: MatchStatus;
  expiresAt?: Date | null;
}

export interface IMatchRepository {
  findById(id: string): Promise<Match | null>;
  findByExternalMatchId(externalMatchId: string): Promise<Match | null>;
  create(data: CreateMatchData): Promise<Match>;
  updateStatus(id: string, status: MatchStatus): Promise<Match>;
}
