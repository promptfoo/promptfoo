import { describe, expect, it } from 'vitest';
import { sanitizeTraceAttributes } from '../../src/tracing/sanitizeAttributes';

describe('sanitizeTraceAttributes', () => {
  it('preserves safe token metrics and redacts normalized credential names recursively', () => {
    expect(
      sanitizeTraceAttributes(
        {
          'gen_ai.usage.reasoning.output_tokens': 3,
          'gen_ai.usage.cache_read.input_tokens': 4,
          'gen_ai.usage.cache_creation.input_tokens': 5,
          'gen_ai.usage.total_tokens': 12,
          'promptfoo.usage.total_tokens': 12,
          'promptfoo.usage.cached_response_tokens': 6,
          'promptfoo.usage.accepted_prediction_tokens': 7,
          'promptfoo.usage.rejected_prediction_tokens': 8,
          'llm.usage.prompt_tokens': 9,
          'llm.usage.completion_tokens': 10,
          'llm.usage.total_tokens': 19,
          'X-API-Key': 'secret',
          nested: { access_token: 'secret' },
          customer_email: 'private@example.com',
        },
        { redactAttributes: ['email'] },
      ),
    ).toEqual({
      'gen_ai.usage.reasoning.output_tokens': 3,
      'gen_ai.usage.cache_read.input_tokens': 4,
      'gen_ai.usage.cache_creation.input_tokens': 5,
      'gen_ai.usage.total_tokens': 12,
      'promptfoo.usage.total_tokens': 12,
      'promptfoo.usage.cached_response_tokens': 6,
      'promptfoo.usage.accepted_prediction_tokens': 7,
      'promptfoo.usage.rejected_prediction_tokens': 8,
      'llm.usage.prompt_tokens': 9,
      'llm.usage.completion_tokens': 10,
      'llm.usage.total_tokens': 19,
      'X-API-Key': '<redacted>',
      nested: { access_token: '<redacted>' },
      customer_email: '[REDACTED]',
    });
  });

  it('preserves numeric token counters from application instrumentation', () => {
    expect(
      sanitizeTraceAttributes({
        'prompt.tokens': 150,
        'response.tokens': 85,
        'llm.token_count.prompt': 150,
        'llm.token_count.total': 235,
        'ai.usage.promptTokens': 150,
        'ai.usage.completionTokens': 85,
      }),
    ).toEqual({
      'prompt.tokens': 150,
      'response.tokens': 85,
      'llm.token_count.prompt': 150,
      'llm.token_count.total': 235,
      'ai.usage.promptTokens': 150,
      'ai.usage.completionTokens': 85,
    });
  });

  it('redacts token attributes that do not hold a count', () => {
    expect(
      sanitizeTraceAttributes({
        'session.tokens': 'sk-live-1234567890',
        'auth.token_count': ['sk-a', 'sk-b'],
        refresh_token: 'rt-1234567890',
      }),
    ).toEqual({
      'session.tokens': '<redacted>',
      'auth.token_count': '<redacted>',
      refresh_token: '<redacted>',
    });
  });

  it('lets explicit redactions override token counters', () => {
    expect(
      sanitizeTraceAttributes(
        { 'prompt.tokens': 150, 'gen_ai.usage.input_tokens': 150 },
        { redactAttributes: ['tokens'] },
      ),
    ).toEqual({ 'prompt.tokens': '[REDACTED]', 'gen_ai.usage.input_tokens': '[REDACTED]' });
  });

  it('applies explicit evaluation redactions even when generic sanitization is disabled', () => {
    expect(
      sanitizeTraceAttributes(
        { authorization: 'visible', private_field: 'secret' },
        { redactAttributes: ['private'], sanitizeSensitiveAttributes: false },
      ),
    ).toEqual({ authorization: 'visible', private_field: '[REDACTED]' });
  });

  it('can apply explicit storage redactions without truncating other attribute values', () => {
    const longToolArguments = 'argument-value '.repeat(40);

    expect(
      sanitizeTraceAttributes(
        {
          authorization: 'visible',
          private_field: 'secret',
          'gen_ai.tool.call.arguments': longToolArguments,
          nested: { customer_email: 'private@example.com', full_input: longToolArguments },
        },
        {
          redactAttributes: ['private', 'email'],
          sanitizeSensitiveAttributes: false,
          truncateValues: false,
        },
      ),
    ).toEqual({
      authorization: 'visible',
      private_field: '[REDACTED]',
      'gen_ai.tool.call.arguments': longToolArguments,
      nested: { customer_email: '[REDACTED]', full_input: longToolArguments },
    });
  });
});
