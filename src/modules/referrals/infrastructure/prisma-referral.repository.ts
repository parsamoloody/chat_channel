import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import { Referral } from '../domain/referral.entity';
import { ReferralSource, ReferralType, ReferralStatus } from '../domain/referral-source.enum';
import { IReferralRepository, CreateReferralData } from '../domain/referral.repository.interface';

@Injectable()
export class PrismaReferralRepository implements IReferralRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateReferralData): Promise<Referral> {
    const record = await this.prisma.referral.create({
      data: {
        userId: data.userId,
        type: data.type,
        referenceId: data.referenceId ?? null,
        source: data.source,
        rawPayload: data.rawPayload ?? null,
        status: data.status ?? ReferralStatus.PENDING,
      },
    });
    return this.toDomain(record);
  }

  async findById(id: string): Promise<Referral | null> {
    const record = await this.prisma.referral.findUnique({
      where: { id },
    });
    if (!record) return null;
    return this.toDomain(record);
  }

  async findLatestByUserId(userId: string): Promise<Referral | null> {
    const record = await this.prisma.referral.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    if (!record) return null;
    return this.toDomain(record);
  }

  async findByUserAndPayload(userId: string, rawPayload: string): Promise<Referral | null> {
    const record = await this.prisma.referral.findFirst({
      where: { userId, rawPayload },
      orderBy: { createdAt: 'desc' },
    });
    if (!record) return null;
    return this.toDomain(record);
  }

  async updateStatus(id: string, status: ReferralStatus): Promise<Referral> {
    const record = await this.prisma.referral.update({
      where: { id },
      data: { status },
    });
    return this.toDomain(record);
  }

  async findAll(limit: number, offset: number): Promise<{ referrals: Referral[]; total: number }> {
    const [records, total] = await Promise.all([
      this.prisma.referral.findMany({
        take: limit,
        skip: offset,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.referral.count(),
    ]);

    return {
      referrals: records.map((r) => this.toDomain(r)),
      total,
    };
  }

  private toDomain(record: {
    id: string;
    userId: string;
    type: string;
    referenceId: string | null;
    source: string;
    rawPayload: string | null;
    status: string;
    createdAt: Date;
  }): Referral {
    return Referral.create({
      id: record.id,
      userId: record.userId,
      type: record.type as ReferralType,
      referenceId: record.referenceId,
      source: record.source as ReferralSource,
      rawPayload: record.rawPayload,
      status: record.status as ReferralStatus,
      createdAt: record.createdAt,
    });
  }
}
