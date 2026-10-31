import { describe, expect, it } from 'vitest';
import data from '../../../src/redteam/strategies/promptInjections/data';
import { addInjections } from '../../../src/redteam/strategies/promptInjections/index';

import type { TestCase } from '../../../src/types/index';

describe('jailbreak templates', () => {
  it('should include the attack prompt in every template', async () => {
    const testCases: TestCase[] = [{ vars: { prompt: 'Hello world' } }];

    const result = await addInjections(testCases, 'prompt', { sample: data.length });

    expect(result).toHaveLength(data.length);
    expect(
      result
        .map((testCase) => String(testCase.vars?.prompt))
        .filter((prompt) => !prompt.includes('Hello world')),
    ).toEqual([]);
  });
});
