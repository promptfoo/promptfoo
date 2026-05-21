import { describe, expect, it } from 'vitest';
import {
  getAllowedEnergyPucActorTypes,
  getEnergyPucActorTypeLabel,
  getEnergyPucMarketSelections,
  getEnergyPucMarkets,
  isEnergyPucPlugin,
  isValidEnergyPucConfig,
  mergeEnergyPucMarketSelections,
  normalizeEnergyPucMarketSelections,
} from './energyPucConfig';

describe('energyPucConfig', () => {
  it('identifies PUC plugins and renders market actor labels', () => {
    expect(isEnergyPucPlugin('energy:puc-product-scope-integrity')).toBe(true);
    expect(isEnergyPucPlugin('energy:market-risk')).toBe(false);
    expect(getEnergyPucActorTypeLabel('esco')).toBe('ESCO');
    expect(getEnergyPucActorTypeLabel('unlisted' as 'esco')).toBe('unlisted');
  });

  it('maps each plugin market to its supported actor types', () => {
    expect(getAllowedEnergyPucActorTypes('energy:puc-fixed-rate-benchmark-cap', 'ny-dps')).toEqual([
      'esco',
      'supplier',
    ]);
    expect(getAllowedEnergyPucActorTypes('energy:puc-product-scope-integrity', 'ca-cpuc')).toEqual(
      [],
    );
    expect(
      getAllowedEnergyPucActorTypes('energy:puc-medical-baseline-integrity', 'ca-cpuc'),
    ).toEqual(['utility']);
    expect(
      getAllowedEnergyPucActorTypes('energy:puc-medical-baseline-integrity', 'ny-dps'),
    ).toEqual([]);
    expect(getAllowedEnergyPucActorTypes('energy:puc-offer-eligibility-gate', 'pa-puc')).toEqual([
      'esco',
      'supplier',
    ]);
    expect(getAllowedEnergyPucActorTypes('energy:puc-offer-eligibility-gate', 'md-psc')).toEqual([
      'supplier',
    ]);
    expect(getAllowedEnergyPucActorTypes('energy:puc-offer-eligibility-gate', 'ca-cpuc')).toEqual(
      [],
    );
    expect(
      getAllowedEnergyPucActorTypes(
        'energy:puc-payment-plan-service-restoration-integrity',
        'tx-puct',
      ),
    ).toEqual(['rep']);
    expect(
      getAllowedEnergyPucActorTypes(
        'energy:puc-payment-plan-service-restoration-integrity',
        'dc-psc',
      ),
    ).toEqual(['utility', 'supplier']);
    expect(
      getAllowedEnergyPucActorTypes(
        'energy:puc-payment-plan-service-restoration-integrity',
        'ca-cpuc',
      ),
    ).toEqual(['utility']);
    expect(
      getAllowedEnergyPucActorTypes(
        'energy:puc-payment-plan-service-restoration-integrity',
        'md-psc',
      ),
    ).toEqual([]);
    expect(
      getAllowedEnergyPucActorTypes('energy:puc-variable-rate-savings-protection', 'ny-dps'),
    ).toEqual(['esco', 'supplier']);
    expect(
      getAllowedEnergyPucActorTypes('energy:puc-variable-rate-savings-protection', 'pa-puc'),
    ).toEqual([]);
  });

  it('normalizes market selections from current and legacy configs', () => {
    expect(
      getEnergyPucMarketSelections({
        marketSelections: [
          { market: 'ny-dps', marketActorType: 'esco' },
          { market: 'pa-puc', marketActorType: 'unknown' },
          { market: '', marketActorType: 'supplier' },
          { market: 1, marketActorType: 'supplier' },
          null,
        ],
      }),
    ).toEqual([
      { market: 'ny-dps', marketActorType: 'esco' },
      { market: 'pa-puc', marketActorType: undefined },
    ]);
    expect(
      getEnergyPucMarketSelections({
        marketSelections: [],
        markets: ['tx-puct', '', 1],
        marketActorType: 'rep',
      }),
    ).toEqual([{ market: 'tx-puct', marketActorType: 'rep' }]);
    expect(getEnergyPucMarketSelections({ market: 'ca-cpuc', marketActorType: 'utility' })).toEqual(
      [{ market: 'ca-cpuc', marketActorType: 'utility' }],
    );
    expect(getEnergyPucMarkets()).toEqual([]);
  });

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

  it('accepts defaults only when every market supports an actor type', () => {
    expect(
      isValidEnergyPucConfig('energy:puc-payment-plan-service-restoration-integrity', {
        markets: ['ca-cpuc', 'tx-puct'],
      }),
    ).toBe(true);
    expect(isValidEnergyPucConfig('energy:puc-product-scope-integrity')).toBe(false);
  });
});
