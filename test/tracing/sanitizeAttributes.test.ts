import { describe, expect, it } from 'vitest';
import {
  getTraceTextRedactor,
  sanitizeTraceAttributes,
} from '../../src/tracing/sanitizeAttributes';

it.each([
  JSON.stringify({ rows: [{ value: 'PRIVATE_JSON_LEAF' }] }),
  JSON.stringify(['PRIVATE_JSON_LEAF']),
  JSON.stringify('PRIVATE_JSON_LEAF'),
])('redacts decoded echoes of serialized private attributes: %s', (original) => {
  const redact = getTraceTextRedactor([{ original, sanitized: '[REDACTED]' }]);
  expect(redact('query returned PRIVATE_JSON_LEAF')).not.toContain('PRIVATE_JSON_LEAF');
});

it('preserves text around existing redaction markers on repeated sanitization', () => {
  const redact = getTraceTextRedactor(
    [{ original: '[REDACTED]', sanitized: '<redacted>' }],
    '<redacted>',
  );
  expect(redact('token [REDACTED] [REDACTED]')).toBe('token <redacted> <redacted>');
});

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

  it('bounds deeply nested attribute arrays', () => {
    let nested: unknown = 'value';
    for (let depth = 0; depth < 30; depth++) {
      nested = [nested];
    }

    expect(JSON.stringify(sanitizeTraceAttributes({ nested }))).toContain('[TRUNCATED]');
  });
});
