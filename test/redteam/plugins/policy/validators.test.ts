import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import {
  isValidInlinePolicyId,
  isValidPolicyId,
  isValidReusablePolicyId,
} from '../../../../src/redteam/plugins/policy/validators';
import { isUuid } from '../../../../src/util/uuid';

// Mock dependencies
vi.mock('../../../../src/util/uuid', () => ({
  isUuid: vi.fn(),
}));

describe('Policy Validators', () => {
  describe('isValidReusablePolicyId', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should return true for valid UUIDs', () => {
      (isUuid as Mock).mockReturnValue(true);
      expect(isValidReusablePolicyId('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
      expect(isUuid).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440000');
    });

    it('should return false for invalid UUIDs', () => {
      (isUuid as Mock).mockReturnValue(false);
      expect(isValidReusablePolicyId('not-a-uuid')).toBe(false);
      expect(isValidReusablePolicyId('abcdef123456')).toBe(false);
      expect(isValidReusablePolicyId('')).toBe(false);
    });

    it('should return false for inline policy IDs', () => {
      (isUuid as Mock).mockReturnValue(false);
      expect(isValidReusablePolicyId('abcdef123456')).toBe(false);
      expect(isValidReusablePolicyId('123456789abc')).toBe(false);
    });

    it('should handle various invalid formats', () => {
      (isUuid as Mock).mockReturnValue(false);
      expect(isValidReusablePolicyId('550e8400')).toBe(false);
      expect(isValidReusablePolicyId('550e8400-e29b-41d4')).toBe(false);
      expect(isValidReusablePolicyId('not-valid-at-all')).toBe(false);
      expect(isValidReusablePolicyId('123')).toBe(false);
    });
  });

  describe('isValidInlinePolicyId', () => {
    it('should return true for valid 12-character hex strings', () => {
      expect(isValidInlinePolicyId('abcdef123456')).toBe(true);
      expect(isValidInlinePolicyId('123456789abc')).toBe(true);
      expect(isValidInlinePolicyId('0123456789ab')).toBe(true);
      expect(isValidInlinePolicyId('fedcba987654')).toBe(true);
    });

    it('should be case insensitive', () => {
      expect(isValidInlinePolicyId('ABCDEF123456')).toBe(true);
      expect(isValidInlinePolicyId('AbCdEf123456')).toBe(true);
      expect(isValidInlinePolicyId('aBcDeF123456')).toBe(true);
    });

    it('should return false for strings that are not 12 characters', () => {
      expect(isValidInlinePolicyId('abcdef12345')).toBe(false); // 11 chars
      expect(isValidInlinePolicyId('abcdef1234567')).toBe(false); // 13 chars
      expect(isValidInlinePolicyId('abc')).toBe(false); // 3 chars
      expect(isValidInlinePolicyId('')).toBe(false); // 0 chars
    });

    it('should return false for non-hex characters', () => {
      expect(isValidInlinePolicyId('ghijkl123456')).toBe(false); // contains g-l
      expect(isValidInlinePolicyId('abcdef12345z')).toBe(false); // contains z
      expect(isValidInlinePolicyId('abcdef-12345')).toBe(false); // contains dash
      expect(isValidInlinePolicyId('abcdef 12345')).toBe(false); // contains space
    });

    it('should return false for UUIDs', () => {
      expect(isValidInlinePolicyId('550e8400-e29b-41d4-a716-446655440000')).toBe(false);
      expect(isValidInlinePolicyId('550e8400e29b41d4a716446655440000')).toBe(false);
    });

    it('should return false for special characters', () => {
      expect(isValidInlinePolicyId('abcdef12345!')).toBe(false);
      expect(isValidInlinePolicyId('abcdef12345@')).toBe(false);
      expect(isValidInlinePolicyId('abcdef12345#')).toBe(false);
    });
  });

  describe('isValidPolicyId', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should return true for valid reusable policy IDs (UUIDs)', () => {
      (isUuid as Mock).mockReturnValue(true);
      expect(isValidPolicyId('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
      expect(isValidPolicyId('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
    });

    it('should return true for valid inline policy IDs (12-char hex)', () => {
      (isUuid as Mock).mockReturnValue(false);
      expect(isValidPolicyId('abcdef123456')).toBe(true);
      expect(isValidPolicyId('123456789abc')).toBe(true);
      expect(isValidPolicyId('FEDCBA987654')).toBe(true);
    });

    it('should return false for invalid policy IDs', () => {
      (isUuid as Mock).mockReturnValue(false);
      expect(isValidPolicyId('not-a-valid-id')).toBe(false);
      expect(isValidPolicyId('abc')).toBe(false);
      expect(isValidPolicyId('')).toBe(false);
      expect(isValidPolicyId('550e8400')).toBe(false);
    });

    it('should return false for strings that are neither UUID nor 12-char hex', () => {
      (isUuid as Mock).mockReturnValue(false);
      expect(isValidPolicyId('abcdef12345')).toBe(false); // 11 chars
      expect(isValidPolicyId('abcdef1234567')).toBe(false); // 13 chars
      expect(isValidPolicyId('ghijkl123456')).toBe(false); // non-hex chars
      expect(isValidPolicyId('abcdef-12345')).toBe(false); // contains dash
    });

    it('should handle edge cases', () => {
      (isUuid as Mock).mockReturnValue(false);
      expect(isValidPolicyId('000000000000')).toBe(true); // All zeros is valid hex
      expect(isValidPolicyId('ffffffffffff')).toBe(true); // All f's is valid hex
      expect(isValidPolicyId('123')).toBe(false); // Too short
    });
  });
});
