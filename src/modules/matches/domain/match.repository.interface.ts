import { Match } from './match.entity';
import { MatchStatus } from './match-status.enum';

export const MATCH_REPOSITORY = Symbol('MATCH_REPOSITORY');

export interface CreateMatchData {
  matchKey?: string;
  externalMatchId?: string;
  user1Id: string;
  user2Id: string;
  status?: MatchStatus;
}

export interface IMatchRepository {
  findById(id: string): Promise<Match | null>;
  findByMatchKey(matchKey: string): Promise<Match | null>;
  findByExternalMatchId(externalMatchId: string): Promise<Match | null>;
  create(data: CreateMatchData): Promise<Match>;
  updateStatus(id: string, status: MatchStatus): Promise<Match>;
}
