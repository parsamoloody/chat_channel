import { Injectable, Inject, Logger } from '@nestjs/common';
import { ReferralPayload, ReferralPayloadParseResult } from '../domain/referral-payload.vo';
import { Referral } from '../domain/referral.entity';
import { ReferralSource, ReferralType, ReferralStatus } from '../domain/referral-source.enum';
import { IReferralRepository, REFERRAL_REPOSITORY } from '../domain/referral.repository.interface';

export interface ProcessReferralInput {
  userId: string;
  rawPayload?: string | null;
}

export interface ProcessReferralOutput {
  referral: Referral;
  parseResult: ReferralPayloadParseResult;
  isDuplicate: boolean;
}

@Injectable()
export class ProcessReferralUseCase {
  private readonly logger = new Logger(ProcessReferralUseCase.name);

  constructor(
    @Inject(REFERRAL_REPOSITORY)
    private readonly referralRepository: IReferralRepository,
  ) {}

  async execute(input: ProcessReferralInput): Promise<ProcessReferralOutput> {
    const parseResult = ReferralPayload.parse(input.rawPayload);

    // 1. Organic user
    if (parseResult.isOrganic) {
      this.logger.log(`Recording organic start for user ${input.userId}`);
      const referral = await this.referralRepository.create({
        userId: input.userId,
        type: ReferralType.REFERRAL,
        referenceId: null,
        source: ReferralSource.ORGANIC,
        rawPayload: null,
        status: ReferralStatus.RESOLVED,
      });

      return {
        referral,
        parseResult,
        isDuplicate: false,
      };
    }

    // 2. Malformed referral payload
    if (!parseResult.isValid) {
      this.logger.warn(
        `Invalid referral payload for user ${input.userId}: ${parseResult.errorMessage}`,
      );
      const referral = await this.referralRepository.create({
        userId: input.userId,
        type: ReferralType.REFERRAL,
        referenceId: null,
        source: ReferralSource.REFERRAL,
        rawPayload: input.rawPayload ?? null,
        status: ReferralStatus.FAILED,
      });

      return {
        referral,
        parseResult,
        isDuplicate: false,
      };
    }

    // 3. Valid referral payload - check for duplicate/previous processing
    const normalizedRaw = parseResult.rawPayload!;
    const existing = await this.referralRepository.findByUserAndPayload(input.userId, normalizedRaw);
    if (existing) {
      this.logger.log(
        `Duplicate referral start detected for user ${input.userId} with payload ${normalizedRaw}`,
      );
      return {
        referral: existing,
        parseResult,
        isDuplicate: true,
      };
    }

    // 4. Create new pending referral record
    const referral = await this.referralRepository.create({
      userId: input.userId,
      type: parseResult.type!,
      referenceId: parseResult.referenceId,
      source: ReferralSource.REFERRAL,
      rawPayload: normalizedRaw,
      status: ReferralStatus.PENDING,
    });

    return {
      referral,
      parseResult,
      isDuplicate: false,
    };
  }
}
