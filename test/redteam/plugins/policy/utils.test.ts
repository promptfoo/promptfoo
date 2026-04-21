import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { POLICY_METRIC_PREFIX } from '../../../../src/redteam/plugins/policy/constants';
import {
  deserializePolicyIdFromMetric,
  determinePolicyTypeFromId,
  formatPolicyIdentifierAsMetric,
  isPolicyMetric,
  isValidPolicyObject,
  makeCustomPolicyCloudUrl,
  makeInlinePolicyId,
  makeInlinePolicyIdSync,
} from '../../../../src/redteam/plugins/policy/utils';
import { PolicyObjectSchema } from '../../../../src/redteam/types';
import { sha256 } from '../../../../src/util/createHash';
import { isUuid } from '../../../../src/util/uuid';

// Mock dependencies
vi.mock('../../../../src/util/uuid', () => ({
  isUuid: vi.fn(),
}));

vi.mock('../../../../src/util/createHash', () => ({
  sha256: vi.fn(),
}));

describe('Policy Utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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
    it('should deserialize a policy ID from a metric without strategy suffix', () => {
      const result = deserializePolicyIdFromMetric(`${POLICY_METRIC_PREFIX}:test-id`);
      expect(result).toBe('test-id');
    });

    it('should deserialize a policy ID and remove strategy suffix', () => {
      const mockUuid = '550e8400-e29b-41d4-a716-446655440000';

      const result = deserializePolicyIdFromMetric(`${POLICY_METRIC_PREFIX}:${mockUuid}/jailbreak`);
      expect(result).toBe(mockUuid);
    });

    it('should handle multiple strategy suffixes', () => {
      const mockUuid = '550e8400-e29b-41d4-a716-446655440000';

      const result = deserializePolicyIdFromMetric(
        `${POLICY_METRIC_PREFIX}:${mockUuid}/jailbreak/extra`,
      );
      expect(result).toBe(mockUuid);
    });

    it('should handle various strategy names', () => {
      expect(deserializePolicyIdFromMetric(`${POLICY_METRIC_PREFIX}:policy-id/GOAT`)).toBe(
        'policy-id',
      );
      expect(
        deserializePolicyIdFromMetric(`${POLICY_METRIC_PREFIX}:policy-id/prompt-injection`),
      ).toBe('policy-id');
      expect(
        deserializePolicyIdFromMetric(`${POLICY_METRIC_PREFIX}:abcdef123456/harmful-content`),
      ).toBe('abcdef123456');
    });

    it('should handle inline policy IDs with strategy suffix', () => {
      const inlineId = 'abcdef123456';
      const result = deserializePolicyIdFromMetric(`${POLICY_METRIC_PREFIX}:${inlineId}/jailbreak`);
      expect(result).toBe(inlineId);
    });
  });

  describe('formatPolicyIdentifierAsMetric', () => {
    it('should format a policy identifier correctly without originalMetric', () => {
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

    it('should preserve strategy suffix from originalMetric', () => {
      const mockUuid = '550e8400-e29b-41d4-a716-446655440000';
      expect(
        formatPolicyIdentifierAsMetric('test-policy', `PolicyViolation:${mockUuid}/jailbreak`),
      ).toBe('Policy/jailbreak: test-policy');
      expect(formatPolicyIdentifierAsMetric('my-policy', `PolicyViolation:${mockUuid}/GOAT`)).toBe(
        'Policy/GOAT: my-policy',
      );
    });

    it('should handle empty originalMetric', () => {
      expect(formatPolicyIdentifierAsMetric('test-policy', '')).toBe('Policy: test-policy');
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
      (isUuid as Mock).mockReturnValue(true);
      expect(determinePolicyTypeFromId('550e8400-e29b-41d4-a716-446655440000')).toBe('reusable');
      expect(isUuid).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440000');
    });

    it('should return "inline" for non-UUID strings', () => {
      (isUuid as Mock).mockReturnValue(false);
      expect(determinePolicyTypeFromId('hash123456')).toBe('inline');
      expect(determinePolicyTypeFromId('not-a-uuid')).toBe('inline');
      expect(determinePolicyTypeFromId('')).toBe('inline');
    });

    it('should handle edge cases', () => {
      (isUuid as Mock).mockReturnValue(false);
      expect(determinePolicyTypeFromId('123')).toBe('inline');
      expect(determinePolicyTypeFromId('550e8400')).toBe('inline');
    });
  });

  describe('isValidPolicyObject', () => {
    // Mock the PolicyObjectSchema.safeParse method
    const mockSafeParse = vi.spyOn(PolicyObjectSchema, 'safeParse');

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
    it('should create a 12-character ID from policy text', async () => {
      (sha256 as Mock).mockResolvedValue('abcdef1234567890abcdef1234567890');
      const result = await makeInlinePolicyId('This is my policy text');

      expect(result).toBe('abcdef123456');
      expect(result).toHaveLength(12);
      expect(sha256).toHaveBeenCalledWith('This is my policy text');
    });

    it('should create consistent IDs for the same text', async () => {
      (sha256 as Mock).mockResolvedValue('1234567890abcdef1234567890abcdef');
      const text = 'Same policy text';
      const id1 = await makeInlinePolicyId(text);
      const id2 = await makeInlinePolicyId(text);

      expect(id1).toBe(id2);
      expect(id1).toBe('1234567890ab');
    });

    it('should create different IDs for different text', async () => {
      (sha256 as Mock)
        .mockResolvedValueOnce('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
        .mockResolvedValueOnce('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');

      const id1 = await makeInlinePolicyId('Policy A');
      const id2 = await makeInlinePolicyId('Policy B');

      expect(id1).toBe('aaaaaaaaaaaa');
      expect(id2).toBe('bbbbbbbbbbbb');
      expect(id1).not.toBe(id2);
    });

    it('should handle empty strings', async () => {
      (sha256 as Mock).mockResolvedValue('emptyhashabcd1234567890abcdef');
      const result = await makeInlinePolicyId('');

      expect(result).toBe('emptyhashabc');
      expect(sha256).toHaveBeenCalledWith('');
    });

    it('should handle special characters and multiline text', async () => {
      (sha256 as Mock).mockResolvedValue('specialhash1234567890abcdef');
      const text = `Line 1
Line 2
Special chars: !@#$%^&*()
Unicode: 你好 🎉`;

      const result = await makeInlinePolicyId(text);
      expect(result).toBe('specialhash1');
      expect(sha256).toHaveBeenCalledWith(text);
    });

    it('should always return 12 characters even if hash is shorter', async () => {
      (sha256 as Mock).mockResolvedValue('short');
      const result = await makeInlinePolicyId('Short hash text');

      expect(result).toBe('short');
      expect(result.length).toBeLessThanOrEqual(12);
    });
  });

  describe('makeInlinePolicyIdSync', () => {
    it('should create a 12-character ID from policy text synchronously', () => {
      (sha256 as Mock).mockReturnValue('abcdef1234567890abcdef1234567890');
      const result = makeInlinePolicyIdSync('This is my policy text');

      expect(result).toBe('abcdef123456');
      expect(result).toHaveLength(12);
      expect(sha256).toHaveBeenCalledWith('This is my policy text');
    });

    it('should create consistent IDs for the same text', () => {
      (sha256 as Mock).mockReturnValue('1234567890abcdef1234567890abcdef');
      const text = 'Same policy text';
      const id1 = makeInlinePolicyIdSync(text);
      const id2 = makeInlinePolicyIdSync(text);

      expect(id1).toBe(id2);
      expect(id1).toBe('1234567890ab');
    });

    it('should handle empty strings', () => {
      (sha256 as Mock).mockReturnValue('emptyhashabcd1234567890abcdef');
      const result = makeInlinePolicyIdSync('');

      expect(result).toBe('emptyhashabc');
      expect(sha256).toHaveBeenCalledWith('');
    });
  });
});
