import { Module } from '@nestjs/common';
import { REFERRAL_REPOSITORY } from './domain/referral.repository.interface';
import { PrismaReferralRepository } from './infrastructure/prisma-referral.repository';
import { ProcessReferralUseCase } from './application/process-referral.use-case';

@Module({
  providers: [
    {
      provide: REFERRAL_REPOSITORY,
      useClass: PrismaReferralRepository,
    },
    ProcessReferralUseCase,
  ],
  exports: [REFERRAL_REPOSITORY, ProcessReferralUseCase],
})
export class ReferralsModule {}
