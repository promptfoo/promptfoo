import { afterEach, describe, expect, it, vi } from 'vitest';

// Keep the failing dynamic import in its own module graph: randomized test order
// must not expose the cached failure to successful provider registry tests.
describe('getProviderFactories family load error wrapping', () => {
  afterEach(() => {
    vi.doUnmock('../../src/redteam/providers/registry');
    vi.resetModules();
  });

  it('wraps family factories() rejections with the requested provider path and preserves cause', async () => {
    // vi.doMock factory throws are caught by vitest and rewrapped with its
    // own diagnostic message, which would lose the cause identity the
    // wrapper is trying to preserve. Defining `redteamProviderFactories`
    // as a throwing getter lets the import succeed while the destructure
    // inside `family.factories()` triggers the throw — which is the
    // realistic failure shape (module loads, export access fails) and
    // round-trips cleanly through the async rejection.
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
