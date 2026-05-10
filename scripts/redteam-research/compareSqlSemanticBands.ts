import { pathToFileURL } from 'node:url';
import fs from 'fs/promises';

import yaml from 'js-yaml';
import {
  type ObservedPluginFeatureBandCoverageSummary,
  type ObservedPluginFeatureCoverageSummary,
  summarizeObservedPluginFeatureBandCoverage,
  summarizeObservedPluginFeatureCoverage,
} from '../../src/redteam/generation/predicateSignatures';
import {
  buildSqlCandidatePool,
  selectDiverseSqlPortfolio,
  selectSemanticBandAwareSqlPortfolio,
} from './selectSqlPortfolio';
import { buildSqlAttackPortfolio, extractEntities, loadPurpose } from './sqlResearchShared';

type TestCase = {
  metadata?: {
    pluginId?: unknown;
  };
  vars?: {
    prompt?: unknown;
  };
};

type RedteamFile = {
  tests?: TestCase[];
};

export type SqlSemanticBandSummary = {
  bandCoverage: ObservedPluginFeatureBandCoverageSummary;
  promptCount: number;
  semanticFeatureCoverage: ObservedPluginFeatureCoverageSummary;
};

export type SqlSemanticBandComparison = {
  baselineUniquePrompts: SqlSemanticBandSummary;
  curatedPortfolio: SqlSemanticBandSummary;
  diverseFivePortfolio: SqlSemanticBandSummary;
  firstFivePortfolio: SqlSemanticBandSummary;
  semanticBandAwareFivePortfolio: SqlSemanticBandSummary;
};

export function summarizeSqlSemanticBandComparison(
  baselinePrompts: readonly string[],
  curatedPrompts: readonly string[],
  firstFivePrompts: readonly string[],
  diverseFivePrompts: readonly string[],
  semanticBandAwareFivePrompts: readonly string[],
): SqlSemanticBandComparison {
  return {
    baselineUniquePrompts: summarizePromptSet(baselinePrompts),
    curatedPortfolio: summarizePromptSet(curatedPrompts),
    diverseFivePortfolio: summarizePromptSet(diverseFivePrompts),
    firstFivePortfolio: summarizePromptSet(firstFivePrompts),
    semanticBandAwareFivePortfolio: summarizePromptSet(semanticBandAwareFivePrompts),
  };
}

async function loadUniqueSqlPrompts(inputPath: string): Promise<string[]> {
  const raw = await fs.readFile(inputPath, 'utf8');
  const parsed = yaml.load(raw) as RedteamFile;

  return [
    ...new Set(
      (parsed.tests ?? [])
        .filter((test) => test.metadata?.pluginId === 'sql-injection')
        .map((test) => test.vars?.prompt)
        .filter((prompt): prompt is string => typeof prompt === 'string' && prompt.length > 0),
    ),
  ];
}

function summarizePromptSet(prompts: readonly string[]): SqlSemanticBandSummary {
  return {
    bandCoverage: summarizeObservedPluginFeatureBandCoverage('sql-injection', prompts),
    promptCount: prompts.length,
    semanticFeatureCoverage: summarizeObservedPluginFeatureCoverage('sql-injection', prompts),
  };
}

async function main() {
  const [inputPath] = process.argv.slice(2);
  if (!inputPath) {
    throw new Error(
      'Usage: tsx scripts/redteam-research/compareSqlSemanticBands.ts <redteam.yaml>',
    );
  }

  const baselinePrompts = await loadUniqueSqlPrompts(inputPath);
  const entities = extractEntities(await loadPurpose(inputPath));
  const curatedPortfolio = buildSqlAttackPortfolio(entities);
  const candidatePool = buildSqlCandidatePool(curatedPortfolio);
  const firstFivePortfolio = candidatePool.slice(0, 5);
  const diverseFivePortfolio = selectDiverseSqlPortfolio(candidatePool, 5);
  const semanticBandAwareFivePortfolio = selectSemanticBandAwareSqlPortfolio(candidatePool, 5);

  console.log(
    JSON.stringify(
      summarizeSqlSemanticBandComparison(
        baselinePrompts,
        curatedPortfolio.map((attack) => attack.prompt),
        firstFivePortfolio.map((attack) => attack.prompt),
        diverseFivePortfolio.map((attack) => attack.prompt),
        semanticBandAwareFivePortfolio.map((attack) => attack.prompt),
      ),
      null,
      2,
    ),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
