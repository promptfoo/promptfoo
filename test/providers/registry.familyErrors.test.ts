import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/telemetry');

describe('getProviderFactories family load error wrapping', () => {
  afterEach(() => {
    vi.doUnmock('../../src/redteam/providers/registry');
    vi.resetModules();
  });

  it('wraps family factories() rejections with the requested provider path and preserves cause', async () => {
    const cause = new Error('simulated registry load failure');
    // Throw on export access so Vitest does not replace a mock-factory error.
    vi.doMock('../../src/redteam/providers/registry', () => ({
      get redteamProviderFactories() {
        throw cause;
      },
    }));
    vi.resetModules();
    const { getProviderFactories } = await import('../../src/providers/registry');

    let caught: unknown;
    try {
      await getProviderFactories('promptfoo:redteam:crescendo');
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
