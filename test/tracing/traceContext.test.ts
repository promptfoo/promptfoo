import { describe, expect, it } from 'vitest';
import { getToolNameFromAttributes } from '../../src/tracing/traceContext';

describe('getToolNameFromAttributes', () => {
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
});
