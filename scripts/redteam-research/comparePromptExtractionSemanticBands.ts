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
  buildPromptExtractionCandidatePool,
  buildPromptExtractionPortfolio,
  loadPromptExtractionContext,
  selectDiversePromptExtractionPortfolio,
  selectSemanticBandAwarePromptExtractionPortfolio,
} from './promptExtractionResearchShared';

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

export type PromptExtractionSemanticBandSummary = {
  bandCoverage: ObservedPluginFeatureBandCoverageSummary;
  promptCount: number;
  semanticFeatureCoverage: ObservedPluginFeatureCoverageSummary;
};

export type PromptExtractionSemanticBandComparison = {
  baselineUniquePrompts: PromptExtractionSemanticBandSummary;
  diverseFivePortfolio: PromptExtractionSemanticBandSummary;
  fullCuratedPortfolio: PromptExtractionSemanticBandSummary;
  semanticBandAwareFivePortfolio: PromptExtractionSemanticBandSummary;
};

export function summarizePromptExtractionSemanticBandComparison(
  baselinePrompts: readonly string[],
  fullPortfolioPrompts: readonly string[],
  diverseFivePrompts: readonly string[],
  semanticBandAwareFivePrompts: readonly string[],
): PromptExtractionSemanticBandComparison {
  return {
    baselineUniquePrompts: summarizePromptSet(baselinePrompts),
    diverseFivePortfolio: summarizePromptSet(diverseFivePrompts),
    fullCuratedPortfolio: summarizePromptSet(fullPortfolioPrompts),
    semanticBandAwareFivePortfolio: summarizePromptSet(semanticBandAwareFivePrompts),
  };
}

async function loadUniquePromptExtractionPrompts(inputPath: string): Promise<string[]> {
  const raw = await fs.readFile(inputPath, 'utf8');
  const parsed = yaml.load(raw) as RedteamFile;

  return [
    ...new Set(
      (parsed.tests ?? [])
        .filter((test) => test.metadata?.pluginId === 'prompt-extraction')
        .map((test) => test.vars?.prompt)
        .filter((prompt): prompt is string => typeof prompt === 'string' && prompt.length > 0),
    ),
  ];
}

function summarizePromptSet(prompts: readonly string[]): PromptExtractionSemanticBandSummary {
  return {
    bandCoverage: summarizeObservedPluginFeatureBandCoverage('prompt-extraction', prompts),
    promptCount: prompts.length,
    semanticFeatureCoverage: summarizeObservedPluginFeatureCoverage('prompt-extraction', prompts),
  };
}

async function main() {
  const [inputPath] = process.argv.slice(2);
  if (!inputPath) {
    throw new Error(
      'Usage: tsx scripts/redteam-research/comparePromptExtractionSemanticBands.ts <redteam.yaml>',
    );
  }

  const baselinePrompts = await loadUniquePromptExtractionPrompts(inputPath);
  const { entities } = await loadPromptExtractionContext(inputPath);
  const fullPortfolio = buildPromptExtractionPortfolio(entities);
  const diverseFivePortfolio = selectDiversePromptExtractionPortfolio(
    buildPromptExtractionCandidatePool(fullPortfolio),
    5,
  );
  const semanticBandAwareFivePortfolio = selectSemanticBandAwarePromptExtractionPortfolio(
    buildPromptExtractionCandidatePool(fullPortfolio),
    5,
  );

  console.log(
    JSON.stringify(
      summarizePromptExtractionSemanticBandComparison(
        baselinePrompts,
        fullPortfolio.map((attack) => attack.prompt),
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
