import { ReferralSource, ReferralType, ReferralStatus } from './referral-source.enum';

export class Referral {
  constructor(
    public readonly id: string,
    public readonly userId: string,
    public readonly type: ReferralType,
    public readonly referenceId: string | null,
    public readonly source: ReferralSource,
    public readonly rawPayload: string | null,
    public readonly status: ReferralStatus,
    public readonly createdAt: Date,
  ) {}

  public static create(props: {
    id: string;
    userId: string;
    type: ReferralType;
    referenceId?: string | null;
    source: ReferralSource;
    rawPayload?: string | null;
    status?: ReferralStatus;
    createdAt?: Date;
  }): Referral {
    return new Referral(
      props.id,
      props.userId,
      props.type,
      props.referenceId ?? null,
      props.source,
      props.rawPayload ?? null,
      props.status ?? ReferralStatus.PENDING,
      props.createdAt ?? new Date(),
    );
  }

  public markResolved(): Referral {
    return new Referral(
      this.id,
      this.userId,
      this.type,
      this.referenceId,
      this.source,
      this.rawPayload,
      ReferralStatus.RESOLVED,
      this.createdAt,
    );
  }

  public markFailed(): Referral {
    return new Referral(
      this.id,
      this.userId,
      this.type,
      this.referenceId,
      this.source,
      this.rawPayload,
      ReferralStatus.FAILED,
      this.createdAt,
    );
  }
}
