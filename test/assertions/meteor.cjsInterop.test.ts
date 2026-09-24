import { describe, expect, it, vi } from 'vitest';

vi.mock('natural', async () => {
  const actual = await vi.importActual<typeof import('natural')>('natural');
  return { default: actual };
});

import { handleMeteorAssertion } from '../../src/assertions/meteor';

import type { AssertionParams } from '../../src/types/index';

describe('METEOR CommonJS interop', () => {
  it('loads natural when it is exposed only as a default export', async () => {
    const result = await handleMeteorAssertion({
      assertion: { type: 'meteor' },
      renderedValue: 'the cat sat on the mat',
      outputString: 'the  cat   sat on the mat',
      inverse: false,
    } as AssertionParams);

    expect(result.pass).toBe(true);
    expect(result.score).toBeGreaterThan(0.9);
  });
});
