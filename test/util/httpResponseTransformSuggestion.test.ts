import { describe, expect, it, vi } from 'vitest';
import {
  canonicalizeResponseTransformSuggestion,
  parseConfigurationChangeSuggestion,
} from '../../src/util/httpResponseTransformSuggestion';

describe('HTTP response transform suggestions', () => {
  it.each([
    ['json', 'json'],
    [' json.response ', 'json.response'],
    ['json.choices[0].message.content', 'json.choices[0].message.content'],
    ['json[0001]["api-version"]', 'json[1]["api-version"]'],
    ['json[0]["200"]', 'json[0]["200"]'],
    ["json['result-data']['answer-text']", 'json["result-data"]["answer-text"]'],
    ["json['answer\\'s']", 'json["answer\'s"]'],
    ['json.$message', 'json.$message'],
    ['json.réponse', 'json.réponse'],
    ['text', 'text'],
    ['text.trim()', 'text.trim()'],
    ['text.slice(11)', 'text.slice(11)'],
    ['text.slice(0,100)', 'text.slice(0, 100)'],
    ['text.slice(-100, -1)', 'text.slice(-100, -1)'],
  ])('canonicalizes safe accessor %s', (input, expected) => {
    expect(canonicalizeResponseTransformSuggestion(input)).toBe(expected);
  });

  it.each([
    '() => process.env',
    'process.env',
    'globalThis.process',
    'json.constructor.constructor("return process")()',
    'json["constr\\u0075ctor"]',
    "json['constr\\u0075ctor']",
    'json["__proto__"]',
    "json['prototype']",
    'json.prototype',
    'text.replace(/x/, process.env.SECRET)',
    'file://parser.js',
    'json.foo; fetch("https://example.invalid")',
    'json?.response',
    'json[response]',
    "json['safe']; process.exit()",
    "json['unterminated]",
    'json[-1]',
    'text.slice(1000001)',
    'text.slice(0, 1); process.exit()',
    `json.${'a'.repeat(513)}`,
  ])('rejects executable or unbounded expression %s', (input) => {
    expect(canonicalizeResponseTransformSuggestion(input)).toBeUndefined();
  });

  it('rejects quoted properties that expand beyond the API limit when canonicalized', () => {
    const escapedNull = String.raw`\0`;
    const input = `json['${escapedNull.repeat(100)}']`;

    expect(input.length).toBeLessThan(512);
    expect(canonicalizeResponseTransformSuggestion(input)).toBeUndefined();
    expect(parseConfigurationChangeSuggestion({ transformResponse: input })).toBeUndefined();
  });

  it('projects only a safe transformResponse from the remote object', () => {
    expect(
      parseConfigurationChangeSuggestion({
        transformResponse: ' json.answer ',
        headers: '{"Authorization":"attacker"}',
        config: 'null',
      }),
    ).toEqual({ transformResponse: 'json.answer' });

    expect(parseConfigurationChangeSuggestion({ transformResponse: 'process.env.SECRET' })).toBe(
      undefined,
    );
    expect(parseConfigurationChangeSuggestion({ headers: '{}' })).toBeUndefined();
    expect(parseConfigurationChangeSuggestion(null)).toBeUndefined();
    expect(parseConfigurationChangeSuggestion([])).toBeUndefined();
  });

  it('does not invoke accessors on an untrusted suggestion object', () => {
    const getter = vi.fn(() => 'json.answer');
    const suggestion = Object.defineProperty({}, 'transformResponse', { get: getter });

    expect(parseConfigurationChangeSuggestion(suggestion)).toBeUndefined();
    expect(getter).not.toHaveBeenCalled();
  });
});
