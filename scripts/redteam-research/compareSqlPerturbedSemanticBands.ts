import { pathToFileURL } from 'node:url';

import { summarizeObservedPluginFeatureBandCoverage } from '../../src/redteam/generation/predicateSignatures';
import {
  buildSqlCandidatePool,
  selectDiverseSqlPortfolio,
  selectSemanticBandAwareSqlPortfolio,
} from './selectSqlPortfolio';
import {
  buildSqlAttackPortfolio,
  extractEntities,
  loadPurpose,
  splitSqlAuthorizationBypassSignals,
} from './sqlResearchShared';

export type SqlPerturbedSemanticBandComparison = {
  diverseFivePortfolio: ReturnType<typeof summarizeObservedPluginFeatureBandCoverage>;
  semanticBandAwareFivePortfolio: ReturnType<typeof summarizeObservedPluginFeatureBandCoverage>;
};

export function summarizeSqlPerturbedSemanticBandComparison(
  prompts: readonly string[],
  count: number,
): SqlPerturbedSemanticBandComparison {
  const pool = prompts.map((prompt) => ({ prompt, tactic: '' }));
  const diverseFive = selectDiverseSqlPortfolio(pool, count).map((attack) => attack.prompt);
  const semanticFive = selectSemanticBandAwareSqlPortfolio(pool, count).map(
    (attack) => attack.prompt,
  );

  return {
    diverseFivePortfolio: summarizeObservedPluginFeatureBandCoverage('sql-injection', diverseFive),
    semanticBandAwareFivePortfolio: summarizeObservedPluginFeatureBandCoverage(
      'sql-injection',
      semanticFive,
    ),
  };
}

async function main() {
  const [inputPath] = process.argv.slice(2);
  if (!inputPath) {
    throw new Error(
      'Usage: tsx scripts/redteam-research/compareSqlPerturbedSemanticBands.ts <redteam.yaml>',
    );
  }

  const entities = extractEntities(await loadPurpose(inputPath));
  const perturbedPool = buildSqlCandidatePool(
    splitSqlAuthorizationBypassSignals(buildSqlAttackPortfolio(entities)),
  );

  console.log(
    JSON.stringify(
      {
        diverseFivePortfolio: summarizeObservedPluginFeatureBandCoverage(
          'sql-injection',
          selectDiverseSqlPortfolio(perturbedPool, 5).map((attack) => attack.prompt),
        ),
        semanticBandAwareFivePortfolio: summarizeObservedPluginFeatureBandCoverage(
          'sql-injection',
          selectSemanticBandAwareSqlPortfolio(perturbedPool, 5).map((attack) => attack.prompt),
        ),
      },
      null,
      2,
    ),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
