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

it('retains source values and incomplete history across redaction batches', () => {
  const state = { secrets: new Set<string>(), length: 0, incomplete: false };
  getTraceTextRedactor(
    [{ original: 'PRIVATE_BATCH_VALUE', sanitized: '[REDACTED]' }],
    '[REDACTED]',
    state,
  );
  expect(getTraceTextRedactor([], '[REDACTED]', state)('echo PRIVATE_BATCH_VALUE')).toBe(
    'echo [REDACTED]',
  );
  getTraceTextRedactor(
    [{ original: 'x'.repeat(16_385), sanitized: '[REDACTED]' }],
    '[REDACTED]',
    state,
  );
  expect(state.secrets.size).toBe(0);
  expect(getTraceTextRedactor([], '[REDACTED]', state)('a later echo')).toBe('[REDACTED]');
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

  it.each([
    { authorization: 'PRIVATE_JSON_LEAF' },
    [{ authorization: 'PRIVATE_JSON_LEAF' }],
    JSON.stringify({ authorization: 'PRIVATE_JSON_LEAF' }),
  ])('discovers private fields inside JSON attribute text: %j', (payload) => {
    const original = { payload: JSON.stringify(payload) };
    const sanitized = sanitizeTraceAttributes(original);
    expect(JSON.stringify(sanitized)).not.toContain('PRIVATE_JSON_LEAF');
    const redactText = getTraceTextRedactor([{ original, sanitized }]);
    expect(redactText('returned PRIVATE_JSON_LEAF')).toBe('returned [REDACTED]');
    expect(
      sanitizeTraceAttributes(
        { response: JSON.stringify({ text: 'PRIVATE_JSON_LEAF' }) },
        {
          redactText,
        },
      ),
    ).toEqual({ response: JSON.stringify({ text: '[REDACTED]' }) });
  });

  it('preserves harmless serialized text and own prototype-named fields', () => {
    const payload = '{ "text": "ordinary value" }';
    expect(sanitizeTraceAttributes({ payload })).toEqual({ payload });
    const parsed = JSON.parse('{"__proto__":{"authorization":"PRIVATE_JSON_LEAF"}}');
    const sanitized = sanitizeTraceAttributes(parsed);
    expect(Object.prototype.hasOwnProperty.call(sanitized, '__proto__')).toBe(true);
    expect(sanitized.__proto__).toEqual({ authorization: '<redacted>' });
    expect(Object.getPrototypeOf(sanitized)).toBe(Object.prototype);
  });

  it('redacts JSON-escaped copies of a private value', () => {
    const secret = 'PRIVATE\\VALUE\nwith "quotes"';
    const redactText = getTraceTextRedactor([{ original: secret, sanitized: '[REDACTED]' }]);
    expect(redactText(`request=${JSON.stringify(secret)}`)).toBe('request="[REDACTED]"');
  });

  it('bounds deeply nested attribute arrays', () => {
    let nested: unknown = 'value';
    for (let depth = 0; depth < 30; depth++) {
      nested = [nested];
    }

    expect(JSON.stringify(sanitizeTraceAttributes({ nested }))).toContain('[TRUNCATED]');
  });
});

it.each(['9007199254740993', '1e309', '1.25e2', '1.0', '-0'])(
  'redacts original numeric JSON source %s from sibling text',
  (literal) => {
    const original = { payload: `{"authorization":${literal}}` };
    const sanitized = sanitizeTraceAttributes(original, { truncateValues: false });
    const redact = getTraceTextRedactor([{ original, sanitized }]);
    expect(redact(`request ${literal}`)).toBe('request [REDACTED]');
  },
);

it('fails closed when valid serialized JSON exceeds traversal capacity', () => {
  const payload =
    '{"authorization":"PRIVATE_DEEP_JSON","nested":' +
    '['.repeat(10000) +
    '0' +
    ']'.repeat(10000) +
    '}';
  const original = { payload };
  const sanitized = sanitizeTraceAttributes(original, { truncateValues: false });
  expect(JSON.stringify(sanitized)).not.toContain('PRIVATE_DEEP_JSON');
  expect(getTraceTextRedactor([{ original, sanitized }])('echo PRIVATE_DEEP_JSON')).toBe(
    '[REDACTED]',
  );
});

it.each([false, true])(
  'redacts known credentials in object keys (serialized: %s)',
  (serialized) => {
    const credential = 'PRIVATE_KEY_WITH_"QUOTES"';
    const redactText = getTraceTextRedactor([{ original: credential, sanitized: '<redacted>' }]);
    const original = { [credential]: 'ordinary value' };
    const result = sanitizeTraceAttributes(
      { payload: serialized ? JSON.stringify(original) : original },
      { redactText, truncateValues: false },
    );
    expect(serialized ? JSON.parse(result.payload) : result.payload).toEqual({
      '[REDACTED]': 'ordinary value',
    });
  },
);
