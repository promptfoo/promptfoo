import { describe, expect, it } from 'vitest';
import {
  formatContentFilterResponse,
  isContentFilterError,
  isServiceError,
} from '../../../src/providers/azure/errors';
import { isRateLimitOrQuotaMessage } from '../../../src/util/fetch/errors';

describe('isContentFilterError', () => {
  it.each([
    'content_filter triggered',
    'content filter violation',
    'Content filter blocked this',
    'filtered due to policy',
    'content filtering system',
    'inappropriate content detected',
    'safety guidelines violation',
    'guardrail triggered',
  ])('matches %j', (msg) => {
    expect(isContentFilterError(msg)).toBe(true);
  });

  it('returns false for unrelated errors', () => {
    expect(isContentFilterError('some other error')).toBe(false);
    expect(isContentFilterError('')).toBe(false);
  });
});

describe('isRateLimitOrQuotaMessage', () => {
  it.each([
    'rate limit exceeded',
    'Rate limit reached',
    'HTTP 429 Too Many Requests',
    'Quota exceeded for daily tokens',
    '429',
    'Request failed with status code 429.',
    'API error (429)',
  ])('matches %j', (msg) => {
    expect(isRateLimitOrQuotaMessage(msg)).toBe(true);
  });

  it.each([
    'API error: 400 Bad Request: your messages resulted in 204291 tokens.',
    '429 tokens exceed the limit',
    'The model returned 429 tokens',
    'Your input used 1,429 tokens',
    'Request ID: req-429-x',
    'some other error',
  ])('does not classify %j as a rate limit', (msg) => {
    expect(isRateLimitOrQuotaMessage(msg)).toBe(false);
  });
});

describe('isServiceError', () => {
  it.each([
    'Service unavailable',
    'Bad gateway',
    'Gateway timeout',
    'Server is busy',
    'Sorry, something went wrong',
  ])('matches %j', (msg) => {
    expect(isServiceError(msg)).toBe(true);
  });

  it('returns false for unrelated errors', () => {
    expect(isServiceError('some other error')).toBe(false);
  });
});

describe('formatContentFilterResponse', () => {
  it('flags input when message names the prompt/input', () => {
    const result = formatContentFilterResponse(
      'Content filter triggered: The input contained inappropriate content',
    );
    expect(result.guardrails).toEqual({
      flagged: true,
      flaggedInput: true,
      flaggedOutput: false,
    });
    expect(result.output).toContain('Azure OpenAI');
  });

  it('flags output when message names the response', () => {
    const result = formatContentFilterResponse('content filter blocked response output');
    expect(result.guardrails).toEqual({
      flagged: true,
      flaggedInput: false,
      flaggedOutput: true,
    });
  });

  it('defaults to flagged output when neither side is named', () => {
    const result = formatContentFilterResponse('content_filter violation detected');
    expect(result.guardrails).toEqual({
      flagged: true,
      flaggedInput: false,
      flaggedOutput: true,
    });
  });

  it('treats input/output as mutually exclusive when both terms appear', () => {
    // Mirrors the Azure content-filter response shape: a single trip is one
    // side or the other, never both. Input wins when the message mentions it.
    const result = formatContentFilterResponse('input prompt produced filtered response output');
    expect(result.guardrails?.flaggedInput).toBe(true);
    expect(result.guardrails?.flaggedOutput).toBe(false);
  });
});
