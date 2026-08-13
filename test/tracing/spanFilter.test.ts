import { describe, expect, it } from 'vitest';
import { isRelevantSpan, matchesSpanFilter } from '../../src/tracing/spanFilter';

describe('trace span relevance', () => {
  it.each([
    {
      description: 'OpenTelemetry model operations',
      attributes: { 'gen_ai.operation.name': 'chat', 'gen_ai.request.model': 'gpt-4.1-mini' },
    },
    {
      description: 'OpenTelemetry tool operations',
      attributes: {
        'gen_ai.operation.name': 'execute_tool',
        'gen_ai.tool.name': 'search_knowledge_base',
      },
    },
    {
      description: 'Vercel AI SDK tool operations',
      attributes: { 'ai.toolCall.name': 'lookup_customer' },
    },
    {
      description: 'Vercel AI SDK model operations',
      attributes: { 'ai.model.id': 'gpt-4.1-mini' },
    },
    {
      description: 'legacy model attributes',
      attributes: { 'llm.model': 'gpt-4' },
    },
    {
      description: 'guardrail decisions',
      attributes: { 'guardrails.decision': 'blocked' },
    },
    ...['codex.command', 'command', 'command.name', 'command_name'].map((attribute) => ({
      description: `command activity from ${attribute}`,
      attributes: { [attribute]: 'git status' },
    })),
    ...['codex.search.query', 'search.query', 'search_query'].map((attribute) => ({
      description: `search activity from ${attribute}`,
      attributes: { [attribute]: 'customer records' },
    })),
  ])('includes $description regardless of the span name', ({ attributes }) => {
    expect(isRelevantSpan({ attributes })).toBe(true);
  });

  it('includes errors without requiring GenAI attributes', () => {
    expect(isRelevantSpan({ attributes: {}, statusCode: 2 })).toBe(true);
  });

  it('excludes grader model activity and grading errors from target evidence', () => {
    expect(
      isRelevantSpan({
        attributes: { 'gen_ai.operation.name': 'chat', 'promptfoo.span.role': 'grader' },
      }),
    ).toBe(false);
    expect(isRelevantSpan({ attributes: { 'promptfoo.span.role': 'grader' }, statusCode: 2 })).toBe(
      false,
    );
  });

  it.each([
    { 'http.request.method': 'POST' },
    { 'url.full': 'https://example.com/chat' },
    { 'otel.span.kind': 'internal' },
    { 'command.output': 'git status output' },
    { 'search.results': 'customer records' },
    { command: '  ' },
    { 'search.query': '' },
    {},
  ])('excludes framework and HTTP spans without meaningful attributes: %o', (attributes) => {
    expect(isRelevantSpan({ attributes })).toBe(false);
  });
});

describe('trace span name filters', () => {
  it.each([
    ['llm.generate', ['llm.*']],
    ['chat gpt-4.1-mini', ['chat*']],
    ['execute_tool search_knowledge_base', ['*tool*']],
    ['guardrail.check', ['guardrail.?heck']],
    ['CHAT GPT-4.1-MINI', ['chat*']],
  ])('matches %s against wildcard filters', (spanName, filters) => {
    expect(matchesSpanFilter(spanName, filters)).toBe(true);
  });

  it('keeps case-insensitive substring matching for existing plain filters', () => {
    expect(matchesSpanFilter('execute_tool search_knowledge_base', ['KNOWLEDGE'])).toBe(true);
  });

  it('treats regex punctuation as literal text', () => {
    expect(matchesSpanFilter('target.call', ['target.(call)'])).toBe(false);
    expect(matchesSpanFilter('target.call', ['target.*'])).toBe(true);
  });

  it('accepts a span when any configured filter matches', () => {
    expect(matchesSpanFilter('chat gpt-4.1-mini', ['guardrail*', 'chat*'])).toBe(true);
  });
});
