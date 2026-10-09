import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import { ExternalMatchPoolService } from '../../matches/application/external-match-pool.service';
import { ValidationError, ConflictError } from '../../../shared/domain/domain.error';
import { getEnvConfig } from '../../../shared/infrastructure/config/env.config';

export interface AdminCreateMatchInput {
  externalMatchId?: string;
  user1Id?: string;
  user2Id?: string;
  user1TelegramId?: string;
  user2TelegramId?: string;
  user1FirstName?: string;
  user2FirstName?: string;
  user1Username?: string;
  user2Username?: string;
  expiresAt?: string | Date | null;
}

export interface AdminCreateMatchOutput {
  id: string;
  externalMatchId: string;
  user1Id: string;
  user2Id: string;
  status: string;
  expiresAt: Date | null;
  createdAt: Date;
  user1: {
    id: string;
    telegramUserId: string;
    firstName: string | null;
    username: string | null;
  };
  user2: {
    id: string;
    telegramUserId: string;
    firstName: string | null;
    username: string | null;
  };
  startPayload: string;
  deepLinkSample: string;
}

@Injectable()
export class AdminCreateMatchUseCase {
  private readonly logger = new Logger(AdminCreateMatchUseCase.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    private readonly matchPoolService?: ExternalMatchPoolService,
  ) {}

  async execute(input: AdminCreateMatchInput): Promise<AdminCreateMatchOutput> {
    // 1. Resolve User 1
    let user1Id = input.user1Id;
    if (!user1Id && input.user1TelegramId) {
      const u1 = await this.prisma.user.upsert({
        where: { telegramUserId: String(input.user1TelegramId) },
        update: {
          firstName: input.user1FirstName ?? undefined,
          username: input.user1Username ?? undefined,
        },
        create: {
          telegramUserId: String(input.user1TelegramId),
          firstName: input.user1FirstName ?? null,
          username: input.user1Username ?? null,
        },
      });
      user1Id = u1.id;
    }

    if (!user1Id) {
      throw new ValidationError('Either user1TelegramId or user1Id is required to create a match');
    }

    // 2. Resolve User 2
    let user2Id = input.user2Id;
    if (!user2Id && input.user2TelegramId) {
      const u2 = await this.prisma.user.upsert({
        where: { telegramUserId: String(input.user2TelegramId) },
        update: {
          firstName: input.user2FirstName ?? undefined,
          username: input.user2Username ?? undefined,
        },
        create: {
          telegramUserId: String(input.user2TelegramId),
          firstName: input.user2FirstName ?? null,
          username: input.user2Username ?? null,
        },
      });
      user2Id = u2.id;
    }

    if (!user2Id) {
      throw new ValidationError('Either user2TelegramId or user2Id is required to create a match');
    }

    if (user1Id === user2Id) {
      throw new ValidationError('user1 and user2 cannot be the same user');
    }

    // 3. Verify users exist
    const [user1, user2] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: user1Id } }),
      this.prisma.user.findUnique({ where: { id: user2Id } }),
    ]);

    if (!user1) throw new ValidationError(`User 1 (${user1Id}) does not exist`);
    if (!user2) throw new ValidationError(`User 2 (${user2Id}) does not exist`);

    // 4. Resolve externalMatchId
    let externalMatchId: string;
    if (input.externalMatchId?.trim()) {
      externalMatchId = input.externalMatchId.trim();
      const existingMatch = await this.prisma.match.findUnique({
        where: { externalMatchId },
      });
      if (existingMatch) {
        throw new ConflictError(`Match with externalMatchId '${externalMatchId}' already exists`);
      }
      if (this.matchPoolService) {
        await this.matchPoolService.markMatchIdUsed(externalMatchId);
      }
    } else {
      if (this.matchPoolService) {
        externalMatchId = await this.matchPoolService.claimAvailableMatchId();
      } else {
        externalMatchId = `match_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      }
    }

    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;

    // 5. Create Match
    const match = await this.prisma.match.create({
      data: {
        externalMatchId,
        user1Id,
        user2Id,
        status: 'ACTIVE',
        expiresAt,
      },
    });

    this.logger.log(
      `Created match ${match.id} (external: ${externalMatchId}) for users ${user1Id} and ${user2Id}`,
    );

    return {
      id: match.id,
      externalMatchId: match.externalMatchId,
      user1Id: match.user1Id,
      user2Id: match.user2Id ?? user2Id,
      status: match.status,
      expiresAt: match.expiresAt,
      createdAt: match.createdAt,
      user1: {
        id: user1.id,
        telegramUserId: user1.telegramUserId,
        firstName: user1.firstName,
        username: user1.username,
      },
      user2: {
        id: user2.id,
        telegramUserId: user2.telegramUserId,
        firstName: user2.firstName,
        username: user2.username,
      },
      startPayload: `ref_${externalMatchId}`,
      deepLinkSample: `https://t.me/${getEnvConfig().TELEGRAM_BOT_USERNAME}?start=ref_${externalMatchId}`,
    };
  }
}
