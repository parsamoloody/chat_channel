import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import { Match } from '../domain/match.entity';
import { MatchStatus } from '../domain/match-status.enum';
import { IMatchRepository, CreateMatchData } from '../domain/match.repository.interface';

@Injectable()
export class PrismaMatchRepository implements IMatchRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Match | null> {
    const record = await this.prisma.match.findUnique({
      where: { id },
    });
    if (!record) return null;
    return this.toDomain(record);
  }

  async findByExternalMatchId(externalMatchId: string): Promise<Match | null> {
    const clean = externalMatchId.replace(/^(ref_|match_)/, '');
    const record = await this.prisma.match.findFirst({
      where: {
        OR: [
          { externalMatchId },
          { externalMatchId: `match_${clean}` },
          { externalMatchId: clean },
        ],
      },
    });
    if (!record) return null;
    return this.toDomain(record);
  }

  async create(data: CreateMatchData): Promise<Match> {
    const record = await this.prisma.match.create({
      data: {
        externalMatchId: data.externalMatchId,
        user1Id: data.user1Id,
        user2Id: data.user2Id ?? null,
        status: data.status ?? (data.user2Id ? MatchStatus.ACTIVE : MatchStatus.PENDING),
        expiresAt: data.expiresAt ?? null,
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

  async assignUser2(id: string, user2Id: string, status: MatchStatus = MatchStatus.ACTIVE): Promise<Match> {
    const record = await this.prisma.match.update({
      where: { id },
      data: {
        user2Id,
        status,
      },
    });
    return this.toDomain(record);
  }

  private toDomain(record: {
    id: string;
    externalMatchId: string;
    user1Id: string;
    user2Id: string | null;
    status: string;
    expiresAt: Date | null;
    createdAt: Date;
  }): Match {
    return Match.create({
      id: record.id,
      externalMatchId: record.externalMatchId,
      user1Id: record.user1Id,
      user2Id: record.user2Id,
      status: record.status as MatchStatus,
      expiresAt: record.expiresAt,
      createdAt: record.createdAt,
    });
  }
}
