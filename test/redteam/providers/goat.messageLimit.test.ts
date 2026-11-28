import { afterEach, expect, it, vi } from 'vitest';
import RedteamGoatProvider from '../../../src/redteam/providers/goat';
import { fetchWithProxy } from '../../../src/util/fetch/index';

import type { AtomicTestCase } from '../../../src/types/index';

const mockGraderGetResult = vi.hoisted(() => vi.fn());
const mockGetGraderById = vi.hoisted(() => vi.fn());

vi.mock('../../../src/redteam/graders', () => ({ getGraderById: mockGetGraderById }));
vi.mock('../../../src/util/fetch/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/util/fetch/index')>()),
  fetchWithProxy: vi.fn(),
}));
vi.mock('../../../src/redteam/remoteGeneration', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/redteam/remoteGeneration')>()),
  neverGenerateRemote: () => false,
}));

afterEach(() => {
  vi.resetAllMocks();
});

it.each([true, false])(
  'reports a message limit error before dispatch (stateful=%s)',
  async (stateful) => {
    const provider = new RedteamGoatProvider({
      injectVar: 'goal',
      maxCharsPerMessage: 5,
      maxTurns: 2,
      stateful,
    });
    vi.mocked(fetchWithProxy).mockImplementation(async () =>
      Response.json({
        message: { role: 'assistant', content: 'too long' },
        tokenUsage: { total: 7, prompt: 5, completion: 2 },
      }),
    );
    const target = { id: () => 'local-target', callApi: vi.fn() };
    const result = await provider.callApi('test prompt', {
      originalProvider: target,
      vars: { goal: 'hi' },
      prompt: { raw: '{{goal}}', label: 'test' },
    });

    expect(result.error).toContain('maxCharsPerMessage=5');
    expect(result.metadata.stopReason).toBe('Message length limit exceeded');
    expect(result.tokenUsage?.numRequests).toBe(0);
    expect(result.tokenUsage?.attacker?.total).toBe(7);
    expect(fetchWithProxy).toHaveBeenCalledTimes(1);
    expect(target.callApi).not.toHaveBeenCalled();
  },
);

it('preserves a confirmed finding when a later turn exceeds the message limit', async () => {
  const provider = new RedteamGoatProvider({
    injectVar: 'goal',
    maxCharsPerMessage: 5,
    maxTurns: 2,
    stateful: true,
    continueAfterSuccess: true,
  });
  mockGetGraderById.mockReturnValue({
    id: 'contains',
    getResult: mockGraderGetResult,
  });
  mockGraderGetResult.mockResolvedValue({ grade: { pass: false } });
  vi.mocked(fetchWithProxy)
    .mockImplementationOnce(async () =>
      Response.json({
        message: { role: 'assistant', content: 'ok' },
        tokenUsage: { total: 7, prompt: 5, completion: 2 },
      }),
    )
    .mockImplementation(async () =>
      Response.json({
        message: { role: 'assistant', content: 'too long' },
        tokenUsage: { total: 7, prompt: 5, completion: 2 },
      }),
    );
  const target = {
    id: () => 'local-target',
    callApi: vi.fn().mockResolvedValue({
      output: 'vuln output',
      tokenUsage: { total: 3, prompt: 2, completion: 1 },
    }),
  };
  const test = {
    vars: {},
    assert: [{ type: 'contains', value: 'expected content' }],
    metadata: { pluginId: 'contains' },
  } as AtomicTestCase;
  const result = await provider.callApi('test prompt', {
    originalProvider: target,
    vars: { goal: 'hi' },
    prompt: { raw: '{{goal}}', label: 'test' },
    test,
  });

  expect(result.error).toBeUndefined();
  expect(result.output).toBe('vuln output');
  expect(result.metadata?.stopReason).toBe('Message length limit exceeded');
  expect(result.metadata?.storedGraderResult?.pass).toBe(false);
  expect(result.metadata.messages).toEqual([
    { role: 'user', content: 'ok' },
    { role: 'assistant', content: 'vuln output' },
  ]);
  expect(fetchWithProxy).toHaveBeenCalledTimes(2);
  expect(target.callApi).toHaveBeenCalledTimes(1);
});
