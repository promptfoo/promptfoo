import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withCacheEnabled } from '../../../src/cache';
import { SimulatedVoiceUser } from '../../../src/providers/voice/simulatedVoiceUser';
import { createProviderRateLimitOptions } from '../../../src/scheduler/providerWrapper';
import { mockProcessEnv } from '../../util/utils';

const { openSocket } = vi.hoisted(() => ({ openSocket: vi.fn() }));
vi.mock('ws', () => ({ default: openSocket }));

const NOW = new Date('2026-10-10T12:00:00.000Z');
const GATEWAY_KEY = 'fixture-gateway-credential';

function limited(headers: Record<string, string>, code = 'rate_limit_exceeded'): Response {
  return new Response(JSON.stringify({ error: { code, message: 'Speech request limited' } }), {
    status: 429,
    statusText: `Too Many Requests ${GATEWAY_KEY}`,
    headers: {
      'content-type': 'application/json',
      'x-api-key': GATEWAY_KEY,
      'x-gateway-diagnostic': GATEWAY_KEY,
      ...headers,
    },
  });
}

function simulate(twoClips = false) {
  const provider = new SimulatedVoiceUser({
    config: {
      instructions: 'Ask when the cafe closes.',
      durationMs: 1000,
      timeoutMs: 3000,
      target: { apiKey: 'unused-target-fixture-key' },
      caller: {
        apiBaseUrl: 'https://speech-retry.fixture.test/v1',
        headers: { 'X-API-Key': GATEWAY_KEY },
        maxRetries: 0,
      },
      interventionTts: { model: 'tts-1' },
      callerInterventions: [
        { atMs: 100, text: 'Hello' },
        ...(twoClips ? [{ atMs: 500, text: 'When do you close?' }] : []),
      ],
    },
  });
  return withCacheEnabled(false, () => provider.callApi('Cafe closes at four.'));
}

describe('prepared caller speech rate-limit propagation', () => {
  let restoreEnvironment: () => void;

  beforeEach(() => {
    restoreEnvironment = mockProcessEnv({}, { clear: true });
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(NOW);
    openSocket.mockReset();
    openSocket.mockImplementation(() => {
      throw new Error('Live sockets must not open after failed speech preparation');
    });
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected HTTP fixture request'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    restoreEnvironment();
  });

  it.each<{ name: string; headers: Record<string, string>; delay: number }>([
    { name: 'seconds', headers: { 'Retry-After': '120' }, delay: 120000 },
    { name: 'milliseconds', headers: { 'Retry-After-Ms': '1250' }, delay: 1250 },
    {
      name: 'HTTP date',
      headers: { 'Retry-After': new Date(NOW.getTime() + 120000).toUTCString() },
      delay: 120000,
    },
  ])('retains the actual HTTP $name delay for the outer scheduler', async ({ headers, delay }) => {
    vi.mocked(globalThis.fetch).mockResolvedValue(limited(headers));

    const result = await simulate();
    const scheduler = createProviderRateLimitOptions();

    expect(scheduler.isRateLimited?.(result, undefined)).toBe(true);
    expect(scheduler.getRetryAfter?.(result, undefined)).toBe(delay);
    expect(scheduler.getHeaders?.(result)).toEqual(
      Object.fromEntries(
        Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]),
      ),
    );
    expect(result.metadata?.http?.status).toBe(429);
    expect(result.metadata?.rateLimitKind).toBe('rate_limit');
    expect(JSON.stringify(result)).not.toContain(GATEWAY_KEY);
    expect(result.metadata?.voice.interventionPreparation.requests).toBe(1);
    expect(result.tokenUsage?.numRequests).toBe(1);
    expect(result.cost).toBeUndefined();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(openSocket).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps definitive billing quota nonretryable despite retry and reset headers', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      limited(
        {
          'retry-after': '120',
          'x-ratelimit-remaining-requests': '0',
          'x-ratelimit-reset-requests': '120s',
        },
        'credit_balance_exhausted',
      ),
    );

    const result = await simulate();
    const scheduler = createProviderRateLimitOptions();

    expect(result.metadata?.rateLimitKind).toBe('quota');
    expect(scheduler.isRateLimited?.(result, undefined)).toBe(false);
    expect(scheduler.getHeaders?.(result)).toBeUndefined();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(openSocket).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('retains prior speech cost and requests while redacting allowed header values', async () => {
    const pcm = Buffer.alloc(4800);
    for (let offset = 0; offset < pcm.length; offset += 2) {
      pcm.writeInt16LE(1000, offset);
    }
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(new Response(pcm, { status: 200 }))
      .mockResolvedValueOnce(
        limited({
          'retry-after': '120',
          'x-ratelimit-remaining-requests': '0',
          'x-ratelimit-reset-requests': GATEWAY_KEY,
        }),
      );

    const result = await simulate(true);
    const scheduler = createProviderRateLimitOptions();

    expect(scheduler.getRetryAfter?.(result, undefined)).toBe(120000);
    expect(scheduler.getHeaders?.(result)).toEqual({
      'retry-after': '120',
      'x-ratelimit-remaining-requests': '0',
      'x-ratelimit-reset-requests': '[REDACTED]',
    });
    expect(JSON.stringify(result)).not.toContain(GATEWAY_KEY);
    expect(result.metadata?.voice.interventionPreparation).toMatchObject({
      requests: 2,
      knownCost: 0.000075,
      costKnown: false,
    });
    expect(result.tokenUsage?.numRequests).toBe(2);
    expect(result.cost).toBeUndefined();
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(openSocket).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
