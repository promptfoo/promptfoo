import { describe, expect, it } from 'vitest';
import {
  formatContentFilterResponse,
  isContentFilterError,
  isRateLimitError,
  isServiceError,
} from '../../../src/providers/azure/errors';

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

describe('isRateLimitError', () => {
  it.each([
    'rate limit exceeded',
    'Rate limit reached',
    'HTTP 429 Too Many Requests',
    'Quota exceeded for daily tokens',
  ])('matches %j', (msg) => {
    expect(isRateLimitError(msg)).toBe(true);
  });

  it('returns false for unrelated errors', () => {
    expect(isRateLimitError('some other error')).toBe(false);
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
