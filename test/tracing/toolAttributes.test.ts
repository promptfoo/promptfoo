import { describe, expect, it } from 'vitest';
import { getToolNameFromAttributes } from '../../src/tracing/toolAttributes';

describe('getToolNameFromAttributes', () => {
  it('returns undefined when attributes are missing', () => {
    expect(getToolNameFromAttributes(undefined)).toBeUndefined();
  });

  it('returns undefined when no recognized keys are present', () => {
    expect(getToolNameFromAttributes({ foo: 'bar' })).toBeUndefined();
  });

  it('returns Vercel AI SDK tool span names', () => {
    expect(
      getToolNameFromAttributes({
        'ai.toolCall.name': 'lookup_customer',
      }),
    ).toBe('lookup_customer');
  });

  it('prefers generic tool.name over vendor-specific keys', () => {
    expect(
      getToolNameFromAttributes({
        'tool.name': 'search_orders',
        'ai.toolCall.name': 'lookup_customer',
      }),
    ).toBe('search_orders');
  });

  it('recognizes function.name', () => {
    expect(
      getToolNameFromAttributes({
        'function.name': 'compose_reply',
      }),
    ).toBe('compose_reply');
  });

  it('trims whitespace from values', () => {
    expect(
      getToolNameFromAttributes({
        'tool.name': '  trimmed_tool  ',
      }),
    ).toBe('trimmed_tool');
  });

  it('skips empty string values in favor of later recognized keys', () => {
    expect(
      getToolNameFromAttributes({
        'tool.name': '   ',
        'ai.toolCall.name': 'fallback_tool',
      }),
    ).toBe('fallback_tool');
  });

  it('skips non-string values', () => {
    expect(
      getToolNameFromAttributes({
        'tool.name': 42,
        'ai.toolCall.name': 'fallback_tool',
      }),
    ).toBe('fallback_tool');
  });

  it('does not match arbitrary attributes whose keys are not in the allowlist', () => {
    expect(
      getToolNameFromAttributes({
        'workflow.tool': 'should_not_match',
        'tool.description': 'not a tool name',
      }),
    ).toBeUndefined();
  });
});
