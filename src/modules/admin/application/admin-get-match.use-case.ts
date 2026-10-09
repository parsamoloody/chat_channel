import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import { MatchNotFoundError } from '../../../shared/domain/domain.error';
import { getEnvConfig } from '../../../shared/infrastructure/config/env.config';

@Injectable()
export class AdminGetMatchUseCase {
  private readonly logger = new Logger(AdminGetMatchUseCase.name);

  constructor(private readonly prisma: PrismaService) {}

  async execute(identifier: string) {
    const cleanId = identifier.trim();
    const strippedPrefix = cleanId.replace(/^(ref_|match_)/, '');

    const match = await this.prisma.match.findFirst({
      where: {
        OR: [
          { id: cleanId },
          { externalMatchId: cleanId },
          { externalMatchId: strippedPrefix },
        ],
      },
      include: {
        user1: true,
        user2: true,
        chat: {
          include: {
            participants: {
              include: {
                user: true,
              },
            },
          },
        },
      },
    });

    if (!match) {
      throw new MatchNotFoundError(`Match not found for identifier '${identifier}'`);
    }

    return {
      id: match.id,
      externalMatchId: match.externalMatchId,
      status: match.status,
      expiresAt: match.expiresAt,
      createdAt: match.createdAt,
      user1: {
        id: match.user1.id,
        telegramUserId: match.user1.telegramUserId,
        firstName: match.user1.firstName,
        lastName: match.user1.lastName,
        username: match.user1.username,
      },
      user2: match.user2
        ? {
            id: match.user2.id,
            telegramUserId: match.user2.telegramUserId,
            firstName: match.user2.firstName,
            lastName: match.user2.lastName,
            username: match.user2.username,
          }
        : null,
      chat: match.chat
        ? {
            id: match.chat.id,
            visibility: match.chat.visibility,
            createdAt: match.chat.createdAt,
            participantsCount: match.chat.participants.length,
            participants: match.chat.participants.map((p) => ({
              userId: p.userId,
              telegramUserId: p.user.telegramUserId,
              name:
                [p.user.firstName, p.user.lastName].filter(Boolean).join(' ') ||
                p.user.username ||
                'User',
            })),
          }
        : null,
      startPayload: `ref_${match.externalMatchId}`,
      deepLinkSample: `https://t.me/${getEnvConfig().TELEGRAM_BOT_USERNAME}?start=ref_${match.externalMatchId}`,
    };
  }
}
