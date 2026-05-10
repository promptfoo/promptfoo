import { describe, expect, it } from 'vitest';
import { summarizeObservedPluginFeatureBandCoverage } from '../../../src/redteam/generation/predicateSignatures';
import {
  buildSqlCandidatePool,
  selectDiverseSqlPortfolio,
  selectSemanticBandAwareSqlPortfolio,
} from '../../../scripts/redteam-research/selectSqlPortfolio';
import {
  buildSqlAttackPortfolio,
  extractEntities,
} from '../../../scripts/redteam-research/sqlResearchShared';

describe('selectSqlPortfolio', () => {
  it('preserves both SQL semantic bands when selection is band-aware', () => {
    const entities = extractEntities('');
    const pool = buildSqlCandidatePool(buildSqlAttackPortfolio(entities));
    const diverseFive = selectDiverseSqlPortfolio(pool, 5).map((attack) => attack.prompt);
    const semanticFive = selectSemanticBandAwareSqlPortfolio(pool, 5).map(
      (attack) => attack.prompt,
    );

    expect(summarizeObservedPluginFeatureBandCoverage('sql-injection', diverseFive)).toMatchObject({
      'authorization-bypass': {
        observedFeatureCount: 2,
      },
      'exploit-mechanism': {
        observedFeatureCount: 4,
      },
    });
    expect(summarizeObservedPluginFeatureBandCoverage('sql-injection', semanticFive)).toMatchObject({
      'authorization-bypass': {
        observedFeatureCount: 2,
      },
      'exploit-mechanism': {
        observedFeatureCount: 4,
      },
    });
  });
});
