import { describe, expect, it } from 'vitest';
import { filterTraceSpans, matchesPattern } from '../../src/assertions/traceUtils';

import type { TraceSpan } from '../../src/types/tracing';

describe('filterTraceSpans', () => {
  const spans: TraceSpan[] = [
    {
      spanId: 'search',
      name: 'execute_tool',
      startTime: 0,
      attributes: { 'gen_ai.tool.name': 'search', cached: false, retries: 0 },
    },
    {
      spanId: 'fetch',
      name: 'execute_tool',
      startTime: 0,
      attributes: { 'gen_ai.tool.name': 'fetch', cached: false, retries: 0 },
    },
    {
      spanId: 'other-operation',
      name: 'invoke_agent',
      startTime: 0,
      attributes: { 'gen_ai.tool.name': 'search', cached: false, retries: 0 },
    },
    { spanId: 'missing', name: 'execute_tool', startTime: 0 },
  ];

  it('combines the span pattern with all exact attribute conditions', () => {
    const matching = filterTraceSpans(spans, 'execute_*', {
      'gen_ai.tool.name': 'search',
      cached: false,
      retries: 0,
    });
    expect(matching.map((span) => span.spanId)).toEqual(['search']);
    expect(matching[0]).toBe(spans[0]);
  });

  it.each([
    { 'gen_ai.tool.name': 'SEARCH' },
    { 'gen_ai.tool.name': 'search*' },
    { 'gen_ai.tool.name': 'search', retries: 1 },
    { cached: 'false' },
    { retries: '0' },
    { missing: false },
  ])('does not coerce, glob-match, or ignore missing attributes: %j', (attributes) => {
    expect(filterTraceSpans(spans, 'execute_*', attributes)).toEqual([]);
  });

  it('preserves name-only matching with omitted or empty filters', () => {
    const expected = [spans[0], spans[1], spans[3]];
    expect(filterTraceSpans(spans, 'EXECUTE_*')).toEqual(expected);
    expect(filterTraceSpans(spans, 'EXECUTE_*', {})).toEqual(expected);
  });

  it('only reads own literal attribute keys', () => {
    const inherited = Object.create({ 'gen_ai.tool.name': 'search' });
    const own = JSON.parse('{"__proto__":"literal","gen_ai.tool.name":"search"}');
    const candidates = [
      { ...spans[0], spanId: 'inherited', attributes: inherited },
      { ...spans[0], spanId: 'nested', attributes: { gen_ai: { tool: { name: 'search' } } } },
      { ...spans[0], spanId: 'own', attributes: own },
    ];
    expect(
      filterTraceSpans(candidates, '*', { 'gen_ai.tool.name': 'search' }).map(
        (span) => span.spanId,
      ),
    ).toEqual(['own']);
    expect(
      filterTraceSpans(candidates, '*', JSON.parse('{"__proto__":"literal"}')).map(
        (span) => span.spanId,
      ),
    ).toEqual(['own']);
  });

  it.each([
    null,
    [],
    'search',
    false,
    0,
    new Map(),
    new Date(0),
    { tool: null },
    { tool: [] },
    { tool: {} },
    { tool: undefined },
    { retries: Number.NaN },
    { retries: Number.POSITIVE_INFINITY },
  ])('rejects malformed filters even with no spans: %j', (attributes) => {
    expect(() => filterTraceSpans([], '*', attributes)).toThrow(
      'Trace assertion attributes must be an object with string, boolean, or finite number values',
    );
  });
});

describe('tracing utilities', () => {
  describe('matchesPattern', () => {
    it('should match exact span names', () => {
      expect(matchesPattern('llm.completion', 'llm.completion')).toBe(true);
      expect(matchesPattern('database.query', 'database.query')).toBe(true);
    });

    it('should not match different span names', () => {
      expect(matchesPattern('llm.completion', 'llm.chat')).toBe(false);
      expect(matchesPattern('database.query', 'api.call')).toBe(false);
    });

    it('should match wildcard * for any characters', () => {
      expect(matchesPattern('llm.completion', '*')).toBe(true);
      expect(matchesPattern('llm.completion', 'llm.*')).toBe(true);
      expect(matchesPattern('llm.completion', '*.completion')).toBe(true);
      expect(matchesPattern('llm.completion', '*.*')).toBe(true);
      expect(matchesPattern('llm.chat.stream', '*.*.*')).toBe(true);
    });

    it('should match wildcard * in the middle', () => {
      expect(matchesPattern('llm.completion', 'llm*completion')).toBe(true);
      expect(matchesPattern('llm.chat.completion', 'llm*completion')).toBe(true);
      expect(matchesPattern('api.external.call', 'api*call')).toBe(true);
    });

    it('should match wildcard ? for single character', () => {
      expect(matchesPattern('llm.chat', 'llm.c?at')).toBe(true);
      expect(matchesPattern('llm.coat', 'llm.c?at')).toBe(true);
      expect(matchesPattern('llm.chat', 'llm.???t')).toBe(true);
    });

    it('should not match ? for zero or multiple characters', () => {
      expect(matchesPattern('llm.ct', 'llm.c?at')).toBe(false);
      expect(matchesPattern('llm.chaat', 'llm.c?at')).toBe(false);
    });

    it('should be case-insensitive', () => {
      expect(matchesPattern('LLM.COMPLETION', 'llm.completion')).toBe(true);
      expect(matchesPattern('llm.completion', 'LLM.COMPLETION')).toBe(true);
      expect(matchesPattern('LLM.Completion', '*llm*')).toBe(true);
    });

    it('should escape special regex characters', () => {
      expect(matchesPattern('llm.completion', 'llm.completion')).toBe(true);
      expect(matchesPattern('test[0]', 'test[0]')).toBe(true);
      expect(matchesPattern('test(1)', 'test(1)')).toBe(true);
      expect(matchesPattern('price$100', 'price$100')).toBe(true);
      expect(matchesPattern('a+b', 'a+b')).toBe(true);
      expect(matchesPattern('a^b', 'a^b')).toBe(true);
      expect(matchesPattern('a|b', 'a|b')).toBe(true);
      expect(matchesPattern('path\\file', 'path\\file')).toBe(true);
    });

    it('should handle empty pattern', () => {
      expect(matchesPattern('', '')).toBe(true);
      expect(matchesPattern('something', '')).toBe(false);
    });

    it('should handle empty span name', () => {
      expect(matchesPattern('', '*')).toBe(true);
      expect(matchesPattern('', 'something')).toBe(false);
    });

    it('should match complex patterns', () => {
      expect(matchesPattern('api.v2.users.get', 'api.*.users.*')).toBe(true);
      expect(matchesPattern('api.v2.posts.get', 'api.*.users.*')).toBe(false);
      expect(matchesPattern('retrieval.search.vector', '*retrieval*')).toBe(true);
      expect(matchesPattern('llm.openai.chat', 'llm.*.chat')).toBe(true);
    });
  });
});
