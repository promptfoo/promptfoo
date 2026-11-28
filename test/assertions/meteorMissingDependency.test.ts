import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AssertionParams } from '../../src/types/index';

afterEach(() => {
  vi.doUnmock('natural/package.json');
  vi.doUnmock('natural/lib/natural/stemmers/index.js');
  vi.doUnmock('natural/lib/natural/wordnet/index.js');
  vi.resetModules();
});

describe('METEOR dependency loading errors', () => {
  it.each([
    'natural/package.json',
    'natural/lib/natural/stemmers/index.js',
    'natural/lib/natural/wordnet/index.js',
  ])('preserves unexpected errors from %s', async (modulePath) => {
    vi.resetModules();
    const cause = Object.assign(new Error("Cannot find module 'natural-binding'"), {
      code: 'MODULE_NOT_FOUND',
    });
    vi.doMock(modulePath, () => {
      throw cause;
    });
    const { handleMeteorAssertion } = await import('../../src/assertions/meteor');
    await expect(
      handleMeteorAssertion({
        assertion: { type: 'meteor' },
        outputString: 'the cat sat',
        renderedValue: 'the cat sat',
        inverse: false,
      } as AssertionParams),
    ).rejects.toHaveProperty('cause', cause);
  });
});
