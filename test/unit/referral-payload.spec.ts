import { ReferralPayload } from '../../src/modules/referrals/domain/referral-payload.vo';
import { ReferralSource, ReferralType } from '../../src/modules/referrals/domain/referral-source.enum';

describe('ReferralPayload Unit Tests', () => {
  describe('Organic Start', () => {
    it('should parse undefined payload as organic start', () => {
      const result = ReferralPayload.parse(undefined);
      expect(result.isValid).toBe(true);
      expect(result.isOrganic).toBe(true);
      expect(result.source).toBe(ReferralSource.ORGANIC);
      expect(result.type).toBeNull();
      expect(result.referenceId).toBeNull();
      expect(result.rawPayload).toBeNull();
    });

    it('should parse empty string as organic start', () => {
      const result = ReferralPayload.parse('');
      expect(result.isValid).toBe(true);
      expect(result.isOrganic).toBe(true);
      expect(result.source).toBe(ReferralSource.ORGANIC);
      expect(result.referenceId).toBeNull();
    });

    it('should parse whitespace string as organic start', () => {
      const result = ReferralPayload.parse('   ');
      expect(result.isValid).toBe(true);
      expect(result.isOrganic).toBe(true);
      expect(result.source).toBe(ReferralSource.ORGANIC);
    });
  });

  describe('Valid Referral Formats', () => {
    it('should parse standard ref_12345 payload', () => {
      const result = ReferralPayload.parse('ref_12345');
      expect(result.isValid).toBe(true);
      expect(result.isOrganic).toBe(false);
      expect(result.source).toBe(ReferralSource.REFERRAL);
      expect(result.type).toBe(ReferralType.REFERRAL);
      expect(result.referenceId).toBe('12345');
      expect(result.rawPayload).toBe('ref_12345');
    });

    it('should parse match_UUID payload', () => {
      const uuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
      const result = ReferralPayload.parse(`match_${uuid}`);
      expect(result.isValid).toBe(true);
      expect(result.isOrganic).toBe(false);
      expect(result.type).toBe(ReferralType.MATCH);
      expect(result.referenceId).toBe(uuid);
    });

    it('should parse invite_abc-123_xyz payload', () => {
      const result = ReferralPayload.parse('invite_abc-123_xyz');
      expect(result.isValid).toBe(true);
      expect(result.type).toBe(ReferralType.INVITE);
      expect(result.referenceId).toBe('abc-123_xyz');
    });

    it('should be case-insensitive to prefix', () => {
      const result = ReferralPayload.parse('REF_99999');
      expect(result.isValid).toBe(true);
      expect(result.type).toBe(ReferralType.REFERRAL);
      expect(result.referenceId).toBe('99999');
    });

    it('should handle boundary case: maximum 64 char identifier', () => {
      const longId = 'a'.repeat(64);
      const result = ReferralPayload.parse(`ref_${longId}`);
      expect(result.isValid).toBe(true);
      expect(result.referenceId).toBe(longId);
    });
  });

  describe('Malformed / Unsupported Payloads', () => {
    it('should reject payload with missing separator', () => {
      const result = ReferralPayload.parse('ref12345');
      expect(result.isValid).toBe(false);
      expect(result.isOrganic).toBe(false);
      if (!result.isValid) {
        expect(result.errorMessage).toContain("missing prefix delimiter '_'");
      }
    });

    it('should reject unsupported prefix', () => {
      const result = ReferralPayload.parse('promo_disc100');
      expect(result.isValid).toBe(false);
      if (!result.isValid) {
        expect(result.errorMessage).toContain("Unsupported referral prefix 'promo'");
      }
    });

    it('should reject empty identifier after prefix', () => {
      const result = ReferralPayload.parse('ref_');
      expect(result.isValid).toBe(false);
      if (!result.isValid) {
        expect(result.errorMessage).toContain('Referral identifier cannot be empty');
      }
    });

    it('should reject identifier with illegal characters', () => {
      const result = ReferralPayload.parse('ref_hello@world!');
      expect(result.isValid).toBe(false);
      if (!result.isValid) {
        expect(result.errorMessage).toContain('contains invalid characters');
      }
    });

    it('should reject identifier exceeding 64 characters', () => {
      const tooLongId = 'a'.repeat(65);
      const result = ReferralPayload.parse(`ref_${tooLongId}`);
      expect(result.isValid).toBe(false);
      if (!result.isValid) {
        expect(result.errorMessage).toContain('contains invalid characters');
      }
    });

    it('should never throw an unhandled exception for unexpected symbols', () => {
      expect(() => ReferralPayload.parse(';;;---///###')).not.toThrow();
      const res = ReferralPayload.parse(';;;---///###');
      expect(res.isValid).toBe(false);
    });
  });
});
