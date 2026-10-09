import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';

export interface AdminListMatchesInput {
  limit?: number;
  offset?: number;
  status?: string;
}

@Injectable()
export class AdminListMatchesUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(input: AdminListMatchesInput) {
    const limit = Math.min(input.limit ?? 20, 100);
    const offset = input.offset ?? 0;
    const where = input.status ? { status: input.status } : {};

    const [matches, total] = await Promise.all([
      this.prisma.match.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { createdAt: 'desc' },
        include: {
          user1: true,
          user2: true,
          chat: {
            select: { id: true, visibility: true },
          },
        },
      }),
      this.prisma.match.count({ where }),
    ]);

    return {
      matches: matches.map((m) => ({
        id: m.id,
        externalMatchId: m.externalMatchId,
        status: m.status,
        expiresAt: m.expiresAt,
        createdAt: m.createdAt,
        user1: {
          id: m.user1.id,
          telegramUserId: m.user1.telegramUserId,
          firstName: m.user1.firstName,
          username: m.user1.username,
        },
        user2: m.user2
          ? {
              id: m.user2.id,
              telegramUserId: m.user2.telegramUserId,
              firstName: m.user2.firstName,
              username: m.user2.username,
            }
          : null,
        hasChat: Boolean(m.chat),
        chatId: m.chat?.id ?? null,
        startPayload: `ref_${m.externalMatchId}`,
      })),
      total,
    };
  }
}
