import { PrismaClient } from '@prisma/client';
import { Match } from '../domain/match.entity';
import { MatchStatus } from '../domain/match-status.enum';
import { IMatchRepository, CreateMatchData } from '../domain/match.repository.interface';

export class PrismaMatchRepository implements IMatchRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<Match | null> {
    const record = await this.prisma.match.findUnique({
      where: { id },
    });
    if (!record) return null;
    return this.toDomain(record);
  }

  async findByMatchKey(matchKey: string): Promise<Match | null> {
    const clean = matchKey.trim().replace(/^(ref_|match_)/, '');
    const record = await this.prisma.match.findFirst({
      where: {
        OR: [
          { matchKey },
          { matchKey: `match_${clean}` },
          { matchKey: clean },
        ],
      },
    });
    if (!record) return null;
    return this.toDomain(record);
  }

  async findByExternalMatchId(externalMatchId: string): Promise<Match | null> {
    return this.findByMatchKey(externalMatchId);
  }

  async create(data: CreateMatchData): Promise<Match> {
    const key = (data.matchKey ?? data.externalMatchId ?? '').trim().replace(/^(ref_|match_)/, '');
    const record = await this.prisma.match.create({
      data: {
        matchKey: key,
        user1Id: data.user1Id,
        user2Id: data.user2Id,
        status: data.status ?? MatchStatus.ACTIVE,
      },
    });
    return this.toDomain(record);
  }

  async updateStatus(id: string, status: MatchStatus): Promise<Match> {
    const record = await this.prisma.match.update({
      where: { id },
      data: { status },
    });
    return this.toDomain(record);
  }

  private toDomain(record: {
    id: string;
    matchKey: string;
    user1Id: string;
    user2Id: string;
    status: string;
    createdAt: Date;
  }): Match {
    return Match.create({
      id: record.id,
      matchKey: record.matchKey,
      user1Id: record.user1Id,
      user2Id: record.user2Id,
      status: record.status as MatchStatus,
      createdAt: record.createdAt,
    });
  }
}
