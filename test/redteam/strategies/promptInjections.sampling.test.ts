import { describe, expect, it, vi } from 'vitest';
import { addInjections } from '../../../src/redteam/strategies/promptInjections/index';
import { sampleEachShufflePath } from '../../util/utils';

import type { TestCase } from '../../../src/types/index';

vi.mock('../../../src/redteam/strategies/promptInjections/data', () => ({
  default: ['a: __PROMPT__', 'b: __PROMPT__', 'c: __PROMPT__'],
}));

describe('addInjections sampling', () => {
  const testCases: TestCase[] = [{ vars: { prompt: 'Hello world' } }];

  it('samples every ordered pair of templates equally', async () => {
    const samples = await sampleEachShufflePath(async () =>
      (await addInjections(testCases, 'prompt', { sample: 2 }))
        .map((test) => String(test.vars?.prompt)[0])
        .join(''),
    );

    expect(samples).toEqual(['ab', 'ac', 'ba', 'bc', 'ca', 'cb']);
  });

  it('keeps the first template as the default after sampling', async () => {
    const defaults = await sampleEachShufflePath(async () => {
      await addInjections(testCases, 'prompt', { sample: 2 });
      const [test] = await addInjections(testCases, 'prompt', {});
      return String(test.vars?.prompt);
    });

    expect(defaults).toEqual(Array(6).fill('a: Hello world'));
  });
});
