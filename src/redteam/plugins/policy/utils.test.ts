import { validate as isUUID } from 'uuid';
import { sha256 } from '../../../util/createHash';
import { PolicyObjectSchema } from '../../types';
import { POLICY_METRIC_PREFIX } from './constants';
import {
  deserializePolicyIdFromMetric,
  determinePolicyTypeFromId,
  formatPolicyIdentifierAsMetric,
  isPolicyMetric,
  isValidInlinePolicyId,
  isValidPolicyId,
  isValidPolicyObject,
  isValidReusablePolicyId,
  makeCustomPolicyCloudUrl,
  makeInlinePolicyId,
} from './utils';

// Mock dependencies
jest.mock('uuid', () => ({
  validate: jest.fn(),
}));

jest.mock('../../../util/createHash', () => ({
  sha256: jest.fn(),
}));

describe('Policy Utils', () => {
  describe('isPolicyMetric', () => {
    it('should return true for metrics that start with POLICY_METRIC_PREFIX', () => {
      expect(isPolicyMetric(`${POLICY_METRIC_PREFIX}:test`)).toBe(true);
      expect(isPolicyMetric(`${POLICY_METRIC_PREFIX}`)).toBe(true);
      expect(isPolicyMetric(`${POLICY_METRIC_PREFIX}:{"id":"123"}`)).toBe(true);
    });

    it('should return false for metrics that do not start with POLICY_METRIC_PREFIX', () => {
      expect(isPolicyMetric('test:policy')).toBe(false);
      expect(isPolicyMetric('other')).toBe(false);
      expect(isPolicyMetric('')).toBe(false);
      expect(isPolicyMetric('Policy')).toBe(false);
    });
  });

  describe('deserializePolicyIdFromMetric', () => {
    it('should deserialize a policy ID from a metric', () => {
      const result = deserializePolicyIdFromMetric(`${POLICY_METRIC_PREFIX}:test-id`);
      expect(result).toBe('test-id');
    });
  });

  describe('formatPolicyIdentifierAsMetric', () => {
    it('should format a policy identifier correctly', () => {
      expect(formatPolicyIdentifierAsMetric('test-policy')).toBe('Policy: test-policy');
      expect(formatPolicyIdentifierAsMetric('123')).toBe('Policy: 123');
      expect(formatPolicyIdentifierAsMetric('')).toBe('Policy: ');
    });

    it('should handle identifiers with special characters', () => {
      expect(formatPolicyIdentifierAsMetric('policy-with-dashes')).toBe(
        'Policy: policy-with-dashes',
      );
      expect(formatPolicyIdentifierAsMetric('policy_with_underscores')).toBe(
        'Policy: policy_with_underscores',
      );
      expect(formatPolicyIdentifierAsMetric('policy.with.dots')).toBe('Policy: policy.with.dots');
    });
  });

  describe('makeCustomPolicyCloudUrl', () => {
    it('should create a valid cloud URL', () => {
      const result = makeCustomPolicyCloudUrl('https://cloud.example.com', 'policy-123');
      expect(result).toBe('https://cloud.example.com/redteam/plugins/policies/policy-123');
    });

    it('should handle URLs with trailing slash', () => {
      const result = makeCustomPolicyCloudUrl('https://cloud.example.com/', 'policy-456');
      expect(result).toBe('https://cloud.example.com//redteam/plugins/policies/policy-456');
    });

    it('should handle various policy ID formats', () => {
      expect(makeCustomPolicyCloudUrl('https://app.com', 'uuid-123-456')).toBe(
        'https://app.com/redteam/plugins/policies/uuid-123-456',
      );
      expect(makeCustomPolicyCloudUrl('https://app.com', 'hash12345678')).toBe(
        'https://app.com/redteam/plugins/policies/hash12345678',
      );
    });

    it('should handle empty strings', () => {
      expect(makeCustomPolicyCloudUrl('', 'policy-id')).toBe('/redteam/plugins/policies/policy-id');
      expect(makeCustomPolicyCloudUrl('https://app.com', '')).toBe(
        'https://app.com/redteam/plugins/policies/',
      );
    });
  });

  describe('determinePolicyTypeFromId', () => {
    it('should return "reusable" for valid UUIDs', () => {
      (isUUID as jest.Mock).mockReturnValue(true);
      expect(determinePolicyTypeFromId('550e8400-e29b-41d4-a716-446655440000')).toBe('reusable');
      expect(isUUID).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440000');
    });

    it('should return "inline" for non-UUID strings', () => {
      (isUUID as jest.Mock).mockReturnValue(false);
      expect(determinePolicyTypeFromId('hash123456')).toBe('inline');
      expect(determinePolicyTypeFromId('not-a-uuid')).toBe('inline');
      expect(determinePolicyTypeFromId('')).toBe('inline');
    });

    it('should handle edge cases', () => {
      (isUUID as jest.Mock).mockReturnValue(false);
      expect(determinePolicyTypeFromId('123')).toBe('inline');
      expect(determinePolicyTypeFromId('550e8400')).toBe('inline');
    });
  });

  describe('isValidPolicyObject', () => {
    // Mock the PolicyObjectSchema.safeParse method
    const mockSafeParse = jest.spyOn(PolicyObjectSchema, 'safeParse');

    it('should return true for valid PolicyObject', () => {
      mockSafeParse.mockReturnValueOnce({ success: true, data: {} as any });
      const policy = {
        id: 'test-id',
        name: 'Test Policy',
        text: 'Policy text',
      };

      expect(isValidPolicyObject(policy)).toBe(true);
      expect(mockSafeParse).toHaveBeenCalledWith(policy);
    });

    it('should return false for invalid PolicyObject', () => {
      mockSafeParse.mockReturnValueOnce({ success: false, error: {} as any });
      const invalidPolicy = {
        invalid: 'field',
      };

      expect(isValidPolicyObject(invalidPolicy as any)).toBe(false);
      expect(mockSafeParse).toHaveBeenCalledWith(invalidPolicy);
    });

    it('should return false for string policy', () => {
      mockSafeParse.mockReturnValueOnce({ success: false, error: {} as any });
      const stringPolicy = 'This is a string policy';

      expect(isValidPolicyObject(stringPolicy)).toBe(false);
      expect(mockSafeParse).toHaveBeenCalledWith(stringPolicy);
    });

    it('should handle null and undefined', () => {
      mockSafeParse.mockReturnValueOnce({ success: false, error: {} as any });
      expect(isValidPolicyObject(null as any)).toBe(false);

      mockSafeParse.mockReturnValueOnce({ success: false, error: {} as any });
      expect(isValidPolicyObject(undefined as any)).toBe(false);
    });
  });

  describe('makeInlinePolicyId', () => {
    it('should create a 12-character ID from policy text', () => {
      (sha256 as jest.Mock).mockReturnValue('abcdef1234567890abcdef1234567890');
      const result = makeInlinePolicyId('This is my policy text');

      expect(result).toBe('abcdef123456');
      expect(result).toHaveLength(12);
      expect(sha256).toHaveBeenCalledWith('This is my policy text');
    });

    it('should create consistent IDs for the same text', () => {
      (sha256 as jest.Mock).mockReturnValue('1234567890abcdef1234567890abcdef');
      const text = 'Same policy text';
      const id1 = makeInlinePolicyId(text);
      const id2 = makeInlinePolicyId(text);

      expect(id1).toBe(id2);
      expect(id1).toBe('1234567890ab');
    });

    it('should create different IDs for different text', () => {
      (sha256 as jest.Mock)
        .mockReturnValueOnce('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
        .mockReturnValueOnce('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');

      const id1 = makeInlinePolicyId('Policy A');
      const id2 = makeInlinePolicyId('Policy B');

      expect(id1).toBe('aaaaaaaaaaaa');
      expect(id2).toBe('bbbbbbbbbbbb');
      expect(id1).not.toBe(id2);
    });

    it('should handle empty strings', () => {
      (sha256 as jest.Mock).mockReturnValue('emptyhashabcd1234567890abcdef');
      const result = makeInlinePolicyId('');

      expect(result).toBe('emptyhashabc');
      expect(sha256).toHaveBeenCalledWith('');
    });

    it('should handle special characters and multiline text', () => {
      (sha256 as jest.Mock).mockReturnValue('specialhash1234567890abcdef');
      const text = `Line 1
Line 2
Special chars: !@#$%^&*()
Unicode: 你好 🎉`;

      const result = makeInlinePolicyId(text);
      expect(result).toBe('specialhash1');
      expect(sha256).toHaveBeenCalledWith(text);
    });

    it('should always return 12 characters even if hash is shorter', () => {
      (sha256 as jest.Mock).mockReturnValue('short');
      const result = makeInlinePolicyId('Short hash text');

      expect(result).toBe('short');
      expect(result.length).toBeLessThanOrEqual(12);
    });
  });

  describe('isValidReusablePolicyId', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should return true for valid UUIDs', () => {
      (isUUID as jest.Mock).mockReturnValue(true);
      expect(isValidReusablePolicyId('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
      expect(isUUID).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440000');
    });

    it('should return false for invalid UUIDs', () => {
      (isUUID as jest.Mock).mockReturnValue(false);
      expect(isValidReusablePolicyId('not-a-uuid')).toBe(false);
      expect(isValidReusablePolicyId('abcdef123456')).toBe(false);
      expect(isValidReusablePolicyId('')).toBe(false);
    });

    it('should return false for inline policy IDs', () => {
      (isUUID as jest.Mock).mockReturnValue(false);
      expect(isValidReusablePolicyId('abcdef123456')).toBe(false);
      expect(isValidReusablePolicyId('123456789abc')).toBe(false);
    });

    it('should handle various invalid formats', () => {
      (isUUID as jest.Mock).mockReturnValue(false);
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
      jest.clearAllMocks();
    });

    it('should return true for valid reusable policy IDs (UUIDs)', () => {
      (isUUID as jest.Mock).mockReturnValue(true);
      expect(isValidPolicyId('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
      expect(isValidPolicyId('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
    });

    it('should return true for valid inline policy IDs (12-char hex)', () => {
      (isUUID as jest.Mock).mockReturnValue(false);
      expect(isValidPolicyId('abcdef123456')).toBe(true);
      expect(isValidPolicyId('123456789abc')).toBe(true);
      expect(isValidPolicyId('FEDCBA987654')).toBe(true);
    });

    it('should return false for invalid policy IDs', () => {
      (isUUID as jest.Mock).mockReturnValue(false);
      expect(isValidPolicyId('not-a-valid-id')).toBe(false);
      expect(isValidPolicyId('abc')).toBe(false);
      expect(isValidPolicyId('')).toBe(false);
      expect(isValidPolicyId('550e8400')).toBe(false);
    });

    it('should return false for strings that are neither UUID nor 12-char hex', () => {
      (isUUID as jest.Mock).mockReturnValue(false);
      expect(isValidPolicyId('abcdef12345')).toBe(false); // 11 chars
      expect(isValidPolicyId('abcdef1234567')).toBe(false); // 13 chars
      expect(isValidPolicyId('ghijkl123456')).toBe(false); // non-hex chars
      expect(isValidPolicyId('abcdef-12345')).toBe(false); // contains dash
    });

    it('should handle edge cases', () => {
      (isUUID as jest.Mock).mockReturnValue(false);
      expect(isValidPolicyId('000000000000')).toBe(true); // All zeros is valid hex
      expect(isValidPolicyId('ffffffffffff')).toBe(true); // All f's is valid hex
      expect(isValidPolicyId('123')).toBe(false); // Too short
    });
  });
});
