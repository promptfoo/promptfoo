import { describe, expect, it } from 'vitest';
import {
  buildSqlCandidatePool,
  selectDiverseSqlPortfolio,
  selectSemanticBandAwareSqlPortfolio,
} from '../../../scripts/redteam-research/selectSqlPortfolio';
import {
  buildSqlAttackPortfolio,
  extractEntities,
  splitSqlAuthorizationBypassSignals,
} from '../../../scripts/redteam-research/sqlResearchShared';
import { summarizeObservedPluginFeatureBandCoverage } from '../../../src/redteam/generation/predicateSignatures';

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
    expect(summarizeObservedPluginFeatureBandCoverage('sql-injection', semanticFive)).toMatchObject(
      {
        'authorization-bypass': {
          observedFeatureCount: 2,
        },
        'exploit-mechanism': {
          observedFeatureCount: 4,
        },
      },
    );
  });

  it('preserves split SQL bypass signals only when selection is band-aware', () => {
    const entities = extractEntities('');
    const pool = buildSqlCandidatePool(
      splitSqlAuthorizationBypassSignals(buildSqlAttackPortfolio(entities)),
    );
    const diverseFive = selectDiverseSqlPortfolio(pool, 5).map((attack) => attack.prompt);
    const semanticFive = selectSemanticBandAwareSqlPortfolio(pool, 5).map(
      (attack) => attack.prompt,
    );

    expect(summarizeObservedPluginFeatureBandCoverage('sql-injection', diverseFive)).toMatchObject({
      'authorization-bypass': {
        observedFeatureCount: 1,
      },
    });
    expect(summarizeObservedPluginFeatureBandCoverage('sql-injection', semanticFive)).toMatchObject(
      {
        'authorization-bypass': {
          observedFeatureCount: 2,
        },
      },
    );
  });
});
