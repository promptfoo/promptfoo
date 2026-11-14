import { expect, it, vi } from 'vitest';
import RedteamGoatProvider from '../../../src/redteam/providers/goat';
import { fetchWithProxy } from '../../../src/util/fetch/index';

vi.mock('../../../src/redteam/graders', () => ({ getGraderById: vi.fn() }));
vi.mock('../../../src/util/fetch/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/util/fetch/index')>()),
  fetchWithProxy: vi.fn(),
}));
vi.mock('../../../src/redteam/remoteGeneration', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/redteam/remoteGeneration')>()),
  neverGenerateRemote: () => false,
}));

it('reports a message limit error and stops before dispatching to the target', async () => {
  const provider = new RedteamGoatProvider({
    injectVar: 'goal',
    maxCharsPerMessage: 5,
    maxTurns: 2,
    stateful: true,
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
});
