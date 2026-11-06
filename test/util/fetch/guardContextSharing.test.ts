import { describe, expect, it, vi } from 'vitest';

// Regression test for the duplicate-bundle guard bypass: the packaged server
// and the public ESM/CJS entry points can load separate copies of
// guardContext.ts. A server route enters the guard context in its copy, but a
// provider bundled with the library copy performs the fetch. The guard
// decision must be visible across both copies.
describe('private-range guard context across module copies', () => {
  it('shares the guard context between two separately loaded copies', async () => {
    const copyA = await import('../../../src/util/fetch/guardContext');
    // Drop the module registry so the next import evaluates a fresh copy,
    // the way a separate bundle would. globalThis is still shared.
    vi.resetModules();
    const copyB = await import('../../../src/util/fetch/guardContext');

    // The two copies must observe the same shared storage, so a guard
    // entered in the server copy is visible to the library copy.
    await copyA.withPrivateRangeGuard(async () => {
      expect(copyB.isPrivateRangeGuardContextActive()).toBe(true);
      expect(copyA.isPrivateRangeGuardContextActive()).toBe(true);
    });

    expect(copyA.isPrivateRangeGuardContextActive()).toBe(false);
    expect(copyB.isPrivateRangeGuardContextActive()).toBe(false);
  });
});
