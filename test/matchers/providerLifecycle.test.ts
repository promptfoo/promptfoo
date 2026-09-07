import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getGradingProvider } from '../../src/matchers/providers';
import { providerRegistry } from '../../src/providers/providerRegistry';

const loadApiProvider = vi.hoisted(() => vi.fn());
vi.mock('../../src/providers/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/providers/index')>()),
  loadApiProvider,
}));

beforeEach(() => loadApiProvider.mockReset());
afterEach(async () => {
  await providerRegistry.shutdownAll();
  vi.restoreAllMocks();
});

describe('lazy grading-provider ownership', () => {
  it('releases a provider instantiated from a typed grading config', async () => {
    const cleanup = vi.fn();
    const grader = { id: () => 'opencode:sdk', callApi: vi.fn(), cleanup };
    loadApiProvider.mockResolvedValue(grader);

    const resolved = await providerRegistry.withScope([], () =>
      getGradingProvider('text', { text: { id: 'opencode:sdk' } }, null),
    );

    expect(resolved).toBe(grader);
    expect(loadApiProvider).toHaveBeenCalledOnce();
    expect(cleanup).toHaveBeenCalledOnce();
  });
});
