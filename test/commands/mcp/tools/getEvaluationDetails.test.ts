import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerGetEvaluationDetailsTool } from '../../../../src/commands/mcp/tools/getEvaluationDetails';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

vi.mock('../../../../src/util/database');

const tool = vi.fn();
registerGetEvaluationDetailsTool({ tool } as unknown as McpServer);
const evalIdSchema = tool.mock.calls[0][1].id;

afterEach(() => vi.resetAllMocks());

describe('getEvaluationDetails eval ID validation', () => {
  it.each([
    [
      'should accept new format eval IDs with random sequence',
      [
        'eval-8h1-2025-11-15T14:17:18',
        'eval-abc-2024-01-01T00:00:00',
        'eval-XyZ-2025-12-31T23:59:59',
        'eval-123-2025-06-15T12:30:45',
      ],
    ],
    [
      'should accept old format eval IDs without random sequence',
      ['eval-2024-10-01T18:24:51', 'eval-2025-01-01T00:00:00', 'eval-2023-12-31T23:59:59'],
    ],
    // Even though current format uses hyphens, be permissive for legacy
    ['should accept eval IDs with underscores', ['eval_abc123', 'eval_test_123']],
    ['should accept simple alphanumeric IDs', ['eval123', 'evalABC', 'eval-test-123']],
    ['should accept very long eval IDs', ['eval-' + 'a'.repeat(100) + '-2025-11-15T14:17:18']],
    ['should accept IDs with multiple colons', ['eval:test:2025-11-15T14:17:18']],
    ['should accept IDs with multiple hyphens', ['eval---test---123']],
    // Regression test for #6222: this is the exact format that caused the bug report
    ['should accept eval IDs returned by list_evaluations', ['eval-8h1-2025-11-15T14:17:18']],
    [
      'should accept all valid ISO timestamp formats in eval IDs',
      // Test various times to ensure colons in time component work
      [
        'eval-abc-2025-11-15T00:00:00',
        'eval-abc-2025-11-15T12:30:45',
        'eval-abc-2025-11-15T23:59:59',
        'eval-abc-2025-11-15T14:17:18', // From bug report
      ],
    ],
  ])('%s', (_name, ids) => {
    for (const id of ids) {
      const result = evalIdSchema.safeParse(id);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(id);
      }
    }
  });

  it.each([
    ['should reject empty strings', [''], 'Eval ID cannot be empty'],
    [
      'should reject IDs with spaces',
      ['eval 123', 'eval-abc 123', 'eval-2024-10-01T18:24:51 ', ' eval-2024-10-01T18:24:51'],
      'Invalid eval ID format',
    ],
    [
      'should reject IDs with special characters',
      [
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
      ],
      'Invalid eval ID format',
    ],
    ['should reject IDs with newlines or tabs', ['eval\n123', 'eval\t123', 'eval\r123'], undefined],
    ['should reject non-string values', [null, undefined, 123, {}, [], true], undefined],
  ])('%s', (_name, ids, message) => {
    for (const id of ids) {
      const result = evalIdSchema.safeParse(id);
      expect(result.success).toBe(false);
      if (!result.success && message) {
        expect(result.error.issues[0].message).toBe(message);
      }
    }
  });
});
