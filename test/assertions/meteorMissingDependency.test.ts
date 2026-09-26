import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AssertionParams } from '../../src/types/index';

afterEach(() => {
  vi.doUnmock('natural/lib/natural/stemmers/index.js');
  vi.doUnmock('natural/lib/natural/wordnet/index.js');
  vi.resetModules();
});

describe('METEOR optional dependency', () => {
  it.each(['natural/lib/natural/stemmers/index.js', 'natural/lib/natural/wordnet/index.js'])(
    'explains how to install a missing %s',
    async (modulePath) => {
      vi.resetModules();
      vi.doMock(modulePath, () => {
        throw new Error(`Cannot find package '${modulePath}'`);
      });
      const { handleMeteorAssertion } = await import('../../src/assertions/meteor');
      await expect(
        handleMeteorAssertion({
          assertion: { type: 'meteor' },
          outputString: 'the cat sat',
          renderedValue: 'the cat sat',
          inverse: false,
        } as AssertionParams),
      ).rejects.toThrow(
        'The "natural" package is required for METEOR assertions. Install it with: npm install natural@^8.1.1',
      );
    },
  );
});
