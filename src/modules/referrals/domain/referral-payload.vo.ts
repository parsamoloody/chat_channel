import { ReferralSource, ReferralType } from './referral-source.enum';

export interface ReferralPayloadSuccess {
  readonly isValid: true;
  readonly isOrganic: boolean;
  readonly source: ReferralSource;
  readonly type: ReferralType | null;
  readonly referenceId: string | null;
  readonly rawPayload: string | null;
}

export interface ReferralPayloadFailure {
  readonly isValid: false;
  readonly isOrganic: false;
  readonly source: ReferralSource;
  readonly type: null;
  readonly referenceId: null;
  readonly rawPayload: string;
  readonly errorMessage: string;
}

export type ReferralPayloadParseResult = ReferralPayloadSuccess | ReferralPayloadFailure;

export class ReferralPayload {
  // Supported prefixes mapped to ReferralType
  private static readonly PREFIX_MAP: Record<string, ReferralType> = {
    ref: ReferralType.REFERRAL,
    match: ReferralType.MATCH,
    invite: ReferralType.INVITE,
  };

  // Safe identifier regex: alphanumeric, dash, underscore, 1 to 64 characters
  private static readonly ID_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;

  private constructor(
    public readonly isValid: boolean,
    public readonly isOrganic: boolean,
    public readonly source: ReferralSource,
    public readonly type: ReferralType | null,
    public readonly referenceId: string | null,
    public readonly rawPayload: string | null,
    public readonly errorMessage?: string,
  ) {}

  public static parse(payload?: string | null): ReferralPayloadParseResult {
    // 1. Organic start
    if (!payload || payload.trim() === '') {
      return {
        isValid: true,
        isOrganic: true,
        source: ReferralSource.ORGANIC,
        type: null,
        referenceId: null,
        rawPayload: null,
      };
    }

    const trimmed = payload.trim();

    // 2. Format validation: must contain underscore separating prefix and identifier
    const separatorIndex = trimmed.indexOf('_');
    if (separatorIndex === -1) {
      return {
        isValid: false,
        isOrganic: false,
        source: ReferralSource.REFERRAL,
        type: null,
        referenceId: null,
        rawPayload: trimmed,
        errorMessage: `Malformed deep-link payload: missing prefix delimiter '_' in '${trimmed}'`,
      };
    }

    const prefix = trimmed.substring(0, separatorIndex).toLowerCase();
    const identifier = trimmed.substring(separatorIndex + 1);

    // 3. Prefix validation
    const referralType = this.PREFIX_MAP[prefix];
    if (!referralType) {
      const supported = Object.keys(this.PREFIX_MAP).join(', ');
      return {
        isValid: false,
        isOrganic: false,
        source: ReferralSource.REFERRAL,
        type: null,
        referenceId: null,
        rawPayload: trimmed,
        errorMessage: `Unsupported referral prefix '${prefix}'. Supported prefixes are: ${supported}`,
      };
    }

    // 4. Identifier validation
    if (!identifier || identifier.length === 0) {
      return {
        isValid: false,
        isOrganic: false,
        source: ReferralSource.REFERRAL,
        type: null,
        referenceId: null,
        rawPayload: trimmed,
        errorMessage: `Referral identifier cannot be empty in payload '${trimmed}'`,
      };
    }

    if (!this.ID_REGEX.test(identifier)) {
      return {
        isValid: false,
        isOrganic: false,
        source: ReferralSource.REFERRAL,
        type: null,
        referenceId: null,
        rawPayload: trimmed,
        errorMessage: `Referral identifier contains invalid characters. Must be alphanumeric, dashes, or underscores up to 64 chars.`,
      };
    }

    return {
      isValid: true,
      isOrganic: false,
      source: ReferralSource.REFERRAL,
      type: referralType,
      referenceId: identifier,
      rawPayload: trimmed,
    };
  }
}
