import { Injectable, Inject } from '@nestjs/common';
import { IReferralRepository, REFERRAL_REPOSITORY } from '../../referrals/domain/referral.repository.interface';
import { Referral } from '../../referrals/domain/referral.entity';

export interface AdminListReferralsInput {
  limit?: number;
  offset?: number;
}

export interface AdminListReferralsOutput {
  referrals: Referral[];
  total: number;
}

@Injectable()
export class AdminListReferralsUseCase {
  constructor(
    @Inject(REFERRAL_REPOSITORY)
    private readonly referralRepository: IReferralRepository,
  ) {}

  async execute(input: AdminListReferralsInput): Promise<AdminListReferralsOutput> {
    const limit = Math.min(input.limit ?? 50, 100);
    const offset = input.offset ?? 0;
    return await this.referralRepository.findAll(limit, offset);
  }
}
