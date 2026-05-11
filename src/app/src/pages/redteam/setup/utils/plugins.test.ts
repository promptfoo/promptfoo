import { describe, expect, it } from 'vitest';
import { countSelectedCustomIntents, countSelectedCustomPolicies } from './plugins';

import type { Config } from '../types';

function makeConfig(plugins: Config['plugins']): Config {
  return {
    description: '',
    prompts: [],
    target: { id: 'echo', config: {} },
    plugins,
    strategies: [],
    applicationDefinition: {} as Config['applicationDefinition'],
    entities: [],
  };
}

describe('countSelectedCustomIntents', () => {
  it('returns 0 when no intent plugin is configured', () => {
    expect(countSelectedCustomIntents(makeConfig([]))).toBe(0);
    expect(countSelectedCustomIntents(makeConfig(['harmful' as any]))).toBe(0);
  });

  it('returns 0 when intent plugin is present but config.intent is missing', () => {
    expect(countSelectedCustomIntents(makeConfig([{ id: 'intent', config: {} as any }]))).toBe(0);
  });

  it('returns 1 for a bare string intent (matches IntentPlugin runtime behavior)', () => {
    expect(
      countSelectedCustomIntents(
        makeConfig([{ id: 'intent', config: { intent: 'do thing one' } as any }]),
      ),
    ).toBe(1);
  });

  it('returns the array length for a list of single intents', () => {
    expect(
      countSelectedCustomIntents(
        makeConfig([{ id: 'intent', config: { intent: ['a', 'b', 'c'] } as any }]),
      ),
    ).toBe(3);
  });

  it('counts a multi-step intent as a single intent', () => {
    expect(
      countSelectedCustomIntents(
        makeConfig([{ id: 'intent', config: { intent: [['step1', 'step2', 'step3']] } as any }]),
      ),
    ).toBe(1);
  });

  it('counts mixed single and multi-step intents at the top level', () => {
    expect(
      countSelectedCustomIntents(
        makeConfig([
          {
            id: 'intent',
            config: { intent: ['single', ['s1', 's2'], 'another'] } as any,
          },
        ]),
      ),
    ).toBe(3);
  });
});

describe('countSelectedCustomPolicies', () => {
  it('counts policy plugins in the config', () => {
    expect(countSelectedCustomPolicies(makeConfig([]))).toBe(0);
    expect(
      countSelectedCustomPolicies(
        makeConfig([
          { id: 'policy', config: { policy: 'one' } as any },
          { id: 'policy', config: { policy: 'two' } as any },
          { id: 'intent', config: { intent: ['x'] } as any },
        ]),
      ),
    ).toBe(2);
  });
});
