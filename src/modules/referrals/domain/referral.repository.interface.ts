import { Referral } from './referral.entity';
import { ReferralStatus, ReferralSource, ReferralType } from './referral-source.enum';

export const REFERRAL_REPOSITORY = Symbol('REFERRAL_REPOSITORY');

export interface CreateReferralData {
  userId: string;
  type: ReferralType;
  referenceId?: string | null;
  source: ReferralSource;
  rawPayload?: string | null;
  status?: ReferralStatus;
}

export interface IReferralRepository {
  create(data: CreateReferralData): Promise<Referral>;
  findById(id: string): Promise<Referral | null>;
  findLatestByUserId(userId: string): Promise<Referral | null>;
  findByUserAndPayload(userId: string, rawPayload: string): Promise<Referral | null>;
  updateStatus(id: string, status: ReferralStatus): Promise<Referral>;
  findAll(limit: number, offset: number): Promise<{ referrals: Referral[]; total: number }>;
}
