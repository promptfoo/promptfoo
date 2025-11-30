import { describe, expect, it } from 'vitest';
import { z } from 'zod';

// Schema from getEvaluationDetails.ts
const evalIdSchema = z
  .string()
  .min(1, 'Eval ID cannot be empty')
  .regex(/^[a-zA-Z0-9_:-]+$/, 'Invalid eval ID format');

describe('getEvaluationDetails eval ID validation', () => {
  describe('valid eval IDs', () => {
    it('should accept new format eval IDs with random sequence', () => {
      const validIds = [
        'eval-8h1-2025-11-15T14:17:18',
        'eval-abc-2024-01-01T00:00:00',
        'eval-XyZ-2025-12-31T23:59:59',
        'eval-123-2025-06-15T12:30:45',
      ];

      validIds.forEach((id) => {
        const result = evalIdSchema.safeParse(id);
        expect(result.success).toBe(true);
      });
    });

    it('should accept old format eval IDs without random sequence', () => {
      const validIds = [
        'eval-2024-10-01T18:24:51',
        'eval-2025-01-01T00:00:00',
        'eval-2023-12-31T23:59:59',
      ];

      validIds.forEach((id) => {
        const result = evalIdSchema.safeParse(id);
        expect(result.success).toBe(true);
      });
    });

    it('should accept eval IDs with underscores', () => {
      // Even though current format uses hyphens, be permissive for legacy
      const validIds = ['eval_abc123', 'eval_test_123'];

      validIds.forEach((id) => {
        const result = evalIdSchema.safeParse(id);
        expect(result.success).toBe(true);
      });
    });

    it('should accept simple alphanumeric IDs', () => {
      const validIds = ['eval123', 'evalABC', 'eval-test-123'];

      validIds.forEach((id) => {
        const result = evalIdSchema.safeParse(id);
        expect(result.success).toBe(true);
      });
    });
  });

  describe('invalid eval IDs', () => {
    it('should reject empty strings', () => {
      const result = evalIdSchema.safeParse('');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Eval ID cannot be empty');
      }
    });

    it('should reject IDs with spaces', () => {
      const invalidIds = [
        'eval 123',
        'eval-abc 123',
        'eval-2024-10-01T18:24:51 ',
        ' eval-2024-10-01T18:24:51',
      ];

      invalidIds.forEach((id) => {
        const result = evalIdSchema.safeParse(id);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toBe('Invalid eval ID format');
        }
      });
    });

    it('should reject IDs with special characters', () => {
      const invalidIds = [
        'eval@123',
        'eval#abc',
        'eval$test',
        'eval%123',
        'eval&test',
        'eval*123',
        'eval(test)',
        'eval+123',
        'eval=test',
        'eval[123]',
        'eval{test}',
        'eval/123',
        'eval\\test',
        'eval|123',
        'eval;test',
        'eval,123',
        'eval.test',
        'eval?123',
        'eval!test',
      ];

      invalidIds.forEach((id) => {
        const result = evalIdSchema.safeParse(id);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toBe('Invalid eval ID format');
        }
      });
    });

    it('should reject IDs with newlines or tabs', () => {
      const invalidIds = ['eval\n123', 'eval\t123', 'eval\r123'];

      invalidIds.forEach((id) => {
        const result = evalIdSchema.safeParse(id);
        expect(result.success).toBe(false);
      });
    });

    it('should reject non-string values', () => {
      const invalidValues = [null, undefined, 123, {}, [], true];

      invalidValues.forEach((value) => {
        const result = evalIdSchema.safeParse(value);
        expect(result.success).toBe(false);
      });
    });
  });

  describe('edge cases', () => {
    it('should accept very long eval IDs', () => {
      const longId = 'eval-' + 'a'.repeat(100) + '-2025-11-15T14:17:18';
      const result = evalIdSchema.safeParse(longId);
      expect(result.success).toBe(true);
    });

    it('should accept IDs with multiple colons', () => {
      const id = 'eval:test:2025-11-15T14:17:18';
      const result = evalIdSchema.safeParse(id);
      expect(result.success).toBe(true);
    });

    it('should accept IDs with multiple hyphens', () => {
      const id = 'eval---test---123';
      const result = evalIdSchema.safeParse(id);
      expect(result.success).toBe(true);
    });
  });

  describe('regression test for #6222', () => {
    it('should accept eval IDs returned by list_evaluations', () => {
      // This is the exact format that caused the bug report
      const bugReportId = 'eval-8h1-2025-11-15T14:17:18';
      const result = evalIdSchema.safeParse(bugReportId);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(bugReportId);
      }
    });

    it('should accept all valid ISO timestamp formats in eval IDs', () => {
      // Test various times to ensure colons in time component work
      const idsWithTimes = [
        'eval-abc-2025-11-15T00:00:00',
        'eval-abc-2025-11-15T12:30:45',
        'eval-abc-2025-11-15T23:59:59',
        'eval-abc-2025-11-15T14:17:18', // From bug report
      ];

      idsWithTimes.forEach((id) => {
        const result = evalIdSchema.safeParse(id);
        expect(result.success).toBe(true);
      });
    });
  });
});
