import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import { getEnvConfig } from '../../../shared/infrastructure/config/env.config';

export interface CreateMatchIdInput {
  externalMatchId?: string;
  count?: number;
}

export interface ListMatchIdsInput {
  status?: 'AVAILABLE' | 'USED' | 'ALL';
  limit?: number;
  offset?: number;
}

@Injectable()
export class ExternalMatchPoolService implements OnModuleInit {
  private readonly logger = new Logger(ExternalMatchPoolService.name);
  public static readonly MIN_THRESHOLD = 5;
  public static readonly TARGET_COUNT = 10;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Automatically replenish pool on initial app startup if available count < 5
   */
  async onModuleInit() {
    try {
      await this.ensureReplenished();
    } catch (err: any) {
      this.logger.error(`Error during initial match pool replenishment: ${err.message}`, err.stack);
    }
  }

  /**
   * Generates a clean random externalMatchId
   */
  generateMatchId(): string {
    return `match_${randomBytes(4).toString('hex')}`;
  }

  /**
   * Replenishes the pool up to TARGET_COUNT (10) if available count < MIN_THRESHOLD (5)
   */
  async ensureReplenished(): Promise<{ replenished: number; currentAvailable: number }> {
    const availableCount = await this.prisma.externalMatchPool.count({
      where: { status: 'AVAILABLE' },
    });

    if (availableCount < ExternalMatchPoolService.MIN_THRESHOLD) {
      const needed = ExternalMatchPoolService.TARGET_COUNT - availableCount;
      this.logger.log(
        `Available externalMatchId count (${availableCount}) is less than ${ExternalMatchPoolService.MIN_THRESHOLD}. Creating ${needed} match IDs to reach ${ExternalMatchPoolService.TARGET_COUNT}...`,
      );

      const createdIds: string[] = [];
      for (let i = 0; i < needed; i++) {
        let created = false;
        let attempts = 0;
        while (!created && attempts < 5) {
          attempts++;
          const id = this.generateMatchId();
          try {
            await this.prisma.externalMatchPool.create({
              data: {
                externalMatchId: id,
                status: 'AVAILABLE',
              },
            });
            createdIds.push(id);
            created = true;
          } catch {
            // Collision retry
          }
        }
      }

      this.logger.log(`Successfully auto-created ${createdIds.length} match IDs: ${createdIds.join(', ')}`);
      return {
        replenished: createdIds.length,
        currentAvailable: availableCount + createdIds.length,
      };
    }

    return { replenished: 0, currentAvailable: availableCount };
  }

  /**
   * API: Create one or multiple externalMatchIds manually
   */
  async createMatchId(input?: CreateMatchIdInput) {
    if (input?.externalMatchId) {
      const customId = input.externalMatchId.trim();
      const existing = await this.prisma.externalMatchPool.findUnique({
        where: { externalMatchId: customId },
      });
      if (existing) {
        return {
          created: [existing],
          message: `Match ID '${customId}' already exists in pool (status: ${existing.status})`,
        };
      }

      const created = await this.prisma.externalMatchPool.create({
        data: {
          externalMatchId: customId,
          status: 'AVAILABLE',
        },
      });

      return {
        created: [created],
        message: `Successfully created match ID '${customId}'`,
      };
    }

    const count = Math.max(1, Math.min(input?.count ?? 1, 50));
    const createdList: any[] = [];
    for (let i = 0; i < count; i++) {
      let created = false;
      let attempts = 0;
      while (!created && attempts < 5) {
        attempts++;
        const id = this.generateMatchId();
        try {
          const rec = await this.prisma.externalMatchPool.create({
            data: {
              externalMatchId: id,
              status: 'AVAILABLE',
            },
          });
          createdList.push(rec);
          created = true;
        } catch {
          // retry
        }
      }
    }

    return {
      created: createdList,
      message: `Successfully created ${createdList.length} match ID(s)`,
    };
  }

  /**
   * API: List externalMatchIds with status and pagination
   */
  async listMatchIds(input?: ListMatchIdsInput) {
    const limit = Math.min(input?.limit ?? 50, 100);
    const offset = input?.offset ?? 0;
    const where: any = {};

    if (input?.status && input.status !== 'ALL') {
      where.status = input.status;
    }

    const [items, total, availableCount, usedCount] = await Promise.all([
      this.prisma.externalMatchPool.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.externalMatchPool.count({ where }),
      this.prisma.externalMatchPool.count({ where: { status: 'AVAILABLE' } }),
      this.prisma.externalMatchPool.count({ where: { status: 'USED' } }),
    ]);

    return {
      data: items.map((item) => ({
        id: item.id,
        externalMatchId: item.externalMatchId,
        status: item.status,
        usedAt: item.usedAt,
        createdAt: item.createdAt,
        startPayload: `ref_${item.externalMatchId}`,
        deepLinkSample: `https://t.me/${getEnvConfig().TELEGRAM_BOT_USERNAME}?start=ref_${item.externalMatchId}`,
      })),
      total,
      stats: {
        available: availableCount,
        used: usedCount,
        total: availableCount + usedCount,
      },
    };
  }

  /**
   * Claims an available externalMatchId from the pool, marks it as USED,
   * and immediately triggers auto-replenishment if available count < 5.
   */
  async claimAvailableMatchId(): Promise<string> {
    const available = await this.prisma.externalMatchPool.findFirst({
      where: { status: 'AVAILABLE' },
      orderBy: { createdAt: 'asc' },
    });

    let externalMatchId: string;
    if (available) {
      await this.prisma.externalMatchPool.update({
        where: { id: available.id },
        data: {
          status: 'USED',
          usedAt: new Date(),
        },
      });
      externalMatchId = available.externalMatchId;
    } else {
      // If pool was empty, generate and record
      externalMatchId = this.generateMatchId();
      await this.prisma.externalMatchPool.create({
        data: {
          externalMatchId,
          status: 'USED',
          usedAt: new Date(),
        },
      });
    }

    // Trigger auto-replenishment after usage!
    await this.ensureReplenished();

    return externalMatchId;
  }

  /**
   * Marks a specific externalMatchId as USED after match creation/usage,
   * and immediately triggers auto-replenishment if available count < 5.
   */
  async markMatchIdUsed(externalMatchId: string): Promise<void> {
    const cleanId = externalMatchId.replace(/^(ref_|match_)/, '');

    const record = await this.prisma.externalMatchPool.findFirst({
      where: {
        OR: [
          { externalMatchId },
          { externalMatchId: cleanId },
          { externalMatchId: `match_${cleanId}` },
        ],
      },
    });

    if (record) {
      if (record.status !== 'USED') {
        await this.prisma.externalMatchPool.update({
          where: { id: record.id },
          data: {
            status: 'USED',
            usedAt: new Date(),
          },
        });
        this.logger.log(`Marked externalMatchId '${record.externalMatchId}' as USED.`);
      }
    } else {
      // Record as used
      await this.prisma.externalMatchPool.create({
        data: {
          externalMatchId,
          status: 'USED',
          usedAt: new Date(),
        },
      }).catch(() => {});
    }

    // After each match ID usage: replenish if count < 5 until count is 10!
    await this.ensureReplenished();
  }
}
