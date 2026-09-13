import { afterEach, describe, expect, it, vi } from 'vitest';

describe('getProviderFactories family load error wrapping', () => {
  afterEach(() => {
    vi.doUnmock('../../src/redteam/providers/registry');
    vi.resetModules();
  });

  it('wraps family factories() rejections with the requested provider path and preserves cause', async () => {
    // A throwing export preserves the original error identity across the dynamic import.
    const cause = new Error('simulated registry load failure');
    vi.doMock('../../src/redteam/providers/registry', () => ({
      get redteamProviderFactories() {
        throw cause;
      },
    }));
    vi.resetModules();
    const { getProviderFactories: reloadedGetProviderFactories } = await import(
      '../../src/providers/registry'
    );

    let caught: unknown;
    try {
      await reloadedGetProviderFactories('promptfoo:redteam:crescendo');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain(
      "Failed to load provider family for 'promptfoo:redteam:crescendo'",
    );
    expect((caught as Error).message).toContain('simulated registry load failure');
    expect((caught as Error).cause).toBe(cause);
  });
});
