import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AssertionParams } from '../../src/types/index';

const params = {
  assertion: { type: 'meteor' },
  outputString: 'running jumped tests',
  renderedValue: 'runs jumping test',
  inverse: false,
} as AssertionParams;

afterEach(() => {
  vi.doUnmock('natural/package.json');
  vi.resetModules();
});

describe('METEOR optional dependency compatibility', () => {
  it.each(['7.1.0', '8.1.0', '9.0.0', 'invalid'])(
    'rejects unsupported Natural %s only when METEOR is used',
    async (version) => {
      vi.resetModules();
      vi.doMock('natural/package.json', () => ({ default: { version } }));
      const { handleMeteorAssertion } = await import('../../src/assertions/meteor');
      await expect(handleMeteorAssertion(params)).rejects.toThrow(
        `METEOR requires natural@^8.1.1; found ${version}.`,
      );
    },
  );

  it.each(['8.1.1', '8.2.0'])('loads compatible Natural %s', async (version) => {
    vi.resetModules();
    vi.doMock('natural/package.json', () => ({ default: { version } }));
    const { handleMeteorAssertion } = await import('../../src/assertions/meteor');
    await expect(handleMeteorAssertion(params)).resolves.toMatchObject({
      pass: true,
      score: 0.9814814814814815,
    });
  });
});
