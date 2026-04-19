import { describe, expect, it } from 'vitest';
import { getToolNameFromAttributes } from '../../src/tracing/traceContext';

describe('getToolNameFromAttributes', () => {
  it('returns undefined when attributes are missing', () => {
    expect(getToolNameFromAttributes(undefined)).toBeUndefined();
  });

  it('returns Vercel AI SDK tool span names', () => {
    expect(
      getToolNameFromAttributes({
        'ai.toolCall.name': 'lookup_customer',
      }),
    ).toBe('lookup_customer');
  });

  it('prefers generic tool.name when present', () => {
    expect(
      getToolNameFromAttributes({
        'tool.name': 'search_orders',
        'ai.toolCall.name': 'lookup_customer',
      }),
    ).toBe('search_orders');
  });

  it('recognizes other common tool-name attributes', () => {
    expect(
      getToolNameFromAttributes({
        'function.name': 'compose_reply',
      }),
    ).toBe('compose_reply');
  });

  it('recognizes dynamic function-name-style keys', () => {
    expect(
      getToolNameFromAttributes({
        customFunctionName: 'draft_reply',
      }),
    ).toBe('draft_reply');
  });

  it('recognizes generic tool-like keys and ignores result-only attributes', () => {
    expect(
      getToolNameFromAttributes({
        metadata: 42,
        'tool.result': '{"status":"ok"}',
        'workflow.tool': 'search_inventory',
      }),
    ).toBe('search_inventory');
  });
});
