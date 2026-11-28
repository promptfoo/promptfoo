import { describe, expect, it } from 'vitest';
import { addCustom } from '../../../src/redteam/strategies/custom';
import { addHydra } from '../../../src/redteam/strategies/hydra';

import type { ProviderOptions, TestCase } from '../../../src/types/index';

const tests: TestCase[] = [{ vars: { query: 'first' } }, { vars: { query: 'second' } }];

describe.each([
  [
    'custom',
    (cases: TestCase[], config: Record<string, unknown>) =>
      addCustom(cases, 'query', config, 'custom:fixture'),
  ],
  [
    'hydra',
    (cases: TestCase[], config: Record<string, unknown>) => addHydra(cases, 'query', config),
  ],
] as const)('%s config evaluation', (_name, add) => {
  it('reads config accessors once for each generated test', () => {
    let reads = 0;
    const config = {
      get maxTurns() {
        return ++reads;
      },
      variant: 'override',
      scanId: 'override',
    };
    const result = add(tests, config);
    expect(result.map((test) => (test.provider as ProviderOptions).config?.maxTurns)).toEqual([
      1, 2,
    ]);
    expect(result.map((test) => (test.provider as ProviderOptions).config)).toEqual([
      expect.objectContaining({ variant: 'override', scanId: 'override' }),
      expect.objectContaining({ variant: 'override', scanId: 'override' }),
    ]);
    expect(reads).toBe(2);
  });

  it('does not evaluate config accessors when no tests are generated', () => {
    const config = {
      get maxTurns() {
        throw new Error('unused configuration was evaluated');
      },
    };
    expect(add([], config)).toEqual([]);
  });
});

it('reads custom strategy metadata once without forwarding plugin inputs', () => {
  let reads = 0;
  const pluginConfig = { inputs: { query: 'input' } };
  const metadata = {
    get pluginConfig() {
      reads++;
      return pluginConfig;
    },
  };
  const [result] = addCustom([{ ...tests[0], metadata }], 'query', {});
  expect(reads).toBe(1);
  expect(result.metadata?.pluginConfig).toBe(pluginConfig);
  expect((result.provider as ProviderOptions).config).not.toHaveProperty('inputs');
});
