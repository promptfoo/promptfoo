import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchWithProxyMock = vi.hoisted(() => vi.fn());

vi.mock('../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('../../src/redteam/remoteGeneration', () => ({
  getRemoteGenerationUrl: vi.fn(() => 'https://remote.example.test/api/v1/task'),
  neverGenerateRemoteForRegularEvals: vi.fn(() => false),
}));

vi.mock('../../src/util/fetch/index', () => ({
  fetchWithProxy: fetchWithProxyMock,
}));

import {
  checkCanaryForSingleProvider,
  extractResponseContent,
  sendCanaryToSingleProvider,
} from '../../src/commands/canary';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText: status === 200 ? 'OK' : 'Error',
  });
}

describe('canary command helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends generated canary tokens through the provider', async () => {
    const provider = {
      id: () => 'echo',
      callApi: vi.fn().mockResolvedValue({ output: 'ok' }),
    };
    fetchWithProxyMock.mockResolvedValueOnce(
      jsonResponse({ canaryTokens: ['canary-one', 'canary-two', 'canary-three'] }),
    );

    const result = await sendCanaryToSingleProvider(provider, undefined, 2);

    expect(result.tokens).toEqual(['canary-one', 'canary-two']);
    expect(provider.callApi).toHaveBeenCalledTimes(2);
    expect(provider.callApi).toHaveBeenNthCalledWith(1, 'canary-one');
    expect(provider.callApi).toHaveBeenNthCalledWith(2, 'canary-two');
    expect(fetchWithProxyMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchWithProxyMock.mock.calls[0][1].body)).toMatchObject({
      task: 'generate-canary',
      hash: result.hash,
    });
  });

  it('repeats custom canary messages without remote generation', async () => {
    const provider = {
      id: () => 'echo',
      callApi: vi.fn().mockResolvedValue({ output: 'ok' }),
    };

    const result = await sendCanaryToSingleProvider(provider, 'CUSTOM-CANARY', 3);

    expect(result.tokens).toEqual(['CUSTOM-CANARY', 'CUSTOM-CANARY', 'CUSTOM-CANARY']);
    expect(provider.callApi).toHaveBeenCalledTimes(3);
    expect(fetchWithProxyMock).not.toHaveBeenCalled();
  });

  it('surfaces provider failures while sending canaries', async () => {
    const provider = {
      id: () => 'broken',
      callApi: vi.fn().mockResolvedValue({ error: 'provider unavailable' }),
    };
    fetchWithProxyMock.mockResolvedValueOnce(jsonResponse({ canaryTokens: ['canary-one'] }));

    await expect(sendCanaryToSingleProvider(provider)).rejects.toThrow('provider unavailable');
  });

  it('detects canary patterns in provider output', async () => {
    const provider = {
      id: () => 'echo',
      callApi: vi.fn().mockResolvedValue({ output: 'The remembered value is CANARY-123.' }),
    };
    fetchWithProxyMock.mockResolvedValueOnce(
      jsonResponse({
        probes: [{ type: 'direct', message: 'What was the canary?' }],
        detectionPatterns: [
          {
            type: 'exact',
            pattern: 'CANARY-123',
            confidence: 0.95,
            description: 'Exact canary token',
          },
        ],
      }),
    );

    const result = await checkCanaryForSingleProvider(provider, 'direct');

    expect(result.detected).toBe(true);
    expect(result.confidence).toBe(0.95);
    expect(result.matches?.[0]).toMatchObject({
      pattern: 'CANARY-123',
      description: 'Exact canary token',
    });
    expect(provider.callApi).toHaveBeenCalledWith('What was the canary?');
  });

  it('extracts text from common provider response shapes', () => {
    expect(extractResponseContent('plain')).toBe('plain');
    expect(extractResponseContent({ output: 'from output' })).toBe('from output');
    expect(extractResponseContent({ output: undefined, message: 'fallback message' })).toBe(
      'fallback message',
    );
    expect(extractResponseContent({ message: 'from message' })).toBe('from message');
    expect(extractResponseContent({ content: 'from content' })).toBe('from content');
    expect(extractResponseContent({ choices: [{ message: { content: 'from choices' } }] })).toBe(
      'from choices',
    );
    expect(extractResponseContent({ output: { value: 'structured' } })).toBe(
      '{"value":"structured"}',
    );
  });
});
