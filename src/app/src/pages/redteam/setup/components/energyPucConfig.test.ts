import { describe, expect, it } from 'vitest';
import {
  isValidEnergyPucConfig,
  mergeEnergyPucMarketSelections,
  normalizeEnergyPucMarketSelections,
} from './energyPucConfig';

describe('energyPucConfig', () => {
  it('preserves jurisdiction-specific actor defaults for multi-market materialization', () => {
    expect(
      normalizeEnergyPucMarketSelections('energy:puc-payment-plan-service-restoration-integrity', {
        markets: ['ca-cpuc', 'tx-puct'],
      }),
    ).toEqual([
      { market: 'ca-cpuc', marketActorType: 'utility' },
      { market: 'tx-puct', marketActorType: 'rep' },
    ]);
  });

  it('merges materialized markets without collapsing distinct actor types', () => {
    expect(
      mergeEnergyPucMarketSelections(
        [{ market: 'ca-cpuc', marketActorType: 'utility' }],
        [{ market: 'tx-puct', marketActorType: 'rep' }],
      ),
    ).toEqual([
      { market: 'ca-cpuc', marketActorType: 'utility' },
      { market: 'tx-puct', marketActorType: 'rep' },
    ]);
  });

  it('rejects actor selections that do not exist for a plugin-market pair', () => {
    expect(
      isValidEnergyPucConfig('energy:puc-payment-plan-service-restoration-integrity', {
        marketSelections: [{ market: 'tx-puct', marketActorType: 'utility' }],
      }),
    ).toBe(false);
  });
});
