import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runAssertion } from '../../src/assertions/index';
import { handleMeteorAssertion } from '../../src/assertions/meteor.js';

import type { Assertion, AtomicTestCase } from '../../src/types/index';

// The meteor handler lazily imports its implementation so the optional `natural`
// dependency is only loaded when a METEOR assertion actually runs. Simulate the
// real failure mode: the implementation rejecting because `natural` is missing.
vi.mock('../../src/assertions/meteor.js', () => ({
  handleMeteorAssertion: vi.fn(),
}));

function buildParams(test: AtomicTestCase, assertion: Assertion) {
  return {
    assertion,
    assertionType: assertion.type,
    container: {} as never,
    test,
    providerResponse: { output: 'the quick brown fox', tokenUsage: undefined },
    latencyMs: 0,
    prompt: 'test prompt',
    provider: undefined,
    promptProvider: undefined,
    renderedValue: 'the quick brown fox',
  } as unknown as Parameters<typeof runAssertion>[0];
}

describe('meteor assertion optional-dependency handling', () => {
  beforeEach(() => {
    // Module-scope vi.fn() defaults must be reset per test; vi.restoreAllMocks()
    // does not clear persistent mockReturnValue/mockRejectedValue.
    vi.mocked(handleMeteorAssertion).mockReset();
  });

  it('returns a graded failure instead of throwing when the natural package is missing', async () => {
    vi.mocked(handleMeteorAssertion).mockRejectedValue(
      new Error(
        'The "natural" package is required for METEOR assertions. Install it with: npm install natural@^8.1.0',
      ),
    );

    const result = await runAssertion(
      buildParams({ vars: {} } as AtomicTestCase, { type: 'meteor' } as Assertion),
    );

    // A missing optional dependency should be reported as a failed assertion with
    // an actionable reason, not surfaced as a rejected promise / row-level error.
    expect(result.pass).toBe(false);
    expect(result.score).toBe(0);
    expect(result.reason).toMatch(/natural/i);
    expect(result.reason).toMatch(/install/i);
  });

  it('propagates errors that are not about the missing dependency', async () => {
    vi.mocked(handleMeteorAssertion).mockRejectedValue(new Error('some other failure'));

    await expect(
      runAssertion(buildParams({ vars: {} } as AtomicTestCase, { type: 'meteor' } as Assertion)),
    ).rejects.toThrow('some other failure');
  });
});
