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

export type PromptExtractionBeforeAfterReport = {
  afterPrompts: string[];
  beforePrompts: string[];
  comparison: PromptExtractionSemanticBandComparison;
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

export function renderPromptExtractionBeforeAfterMarkdown(
  report: PromptExtractionBeforeAfterReport,
): string {
  const { afterPrompts, beforePrompts, comparison } = report;
  const baseline = comparison.baselineUniquePrompts.bandCoverage;
  const after = comparison.semanticBandAwareFivePortfolio.bandCoverage;

  return [
    '# Prompt Extraction Before / After',
    '',
    '| Portfolio | Core disclosure | Protected control plane |',
    '| --- | ---: | ---: |',
    `| Baseline unique prompts | ${formatBandCoverage(baseline['core-disclosure'])} | ${formatBandCoverage(baseline['protected-control-plane'])} |`,
    `| Semantic-band-aware five-prompt portfolio | ${formatBandCoverage(after['core-disclosure'])} | ${formatBandCoverage(after['protected-control-plane'])} |`,
    '',
    '## Before',
    '',
    ...beforePrompts.map((prompt, index) => `${index + 1}. ${prompt}`),
    '',
    '## After',
    '',
    ...afterPrompts.map((prompt, index) => `${index + 1}. ${prompt}`),
    '',
    '## Reading',
    '',
    'The baseline portfolio already covers the generic prompt-extraction floor, but it does not exercise any protected-control-plane probes. The semantic-band-aware portfolio keeps the same core floor while adding authority checks, routing and classification logic, refusal policy, escalation guidance, legal authority, and verbatim extraction coverage.',
  ].join('\n');
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

function formatBandCoverage(summary: ObservedPluginFeatureBandCoverageSummary[string]): string {
  return `${summary.observedFeatureCount}/${summary.featureCount} features, ${summary.promptsWithFeaturesCount}/${summary.promptCount} prompts`;
}

function parseArgs(args: string[]): { format: 'json' | 'markdown'; inputPath?: string } {
  const formatIndex = args.indexOf('--format');
  const format = formatIndex === -1 ? 'json' : args[formatIndex + 1];
  const positionalArgs = args.filter(
    (arg, index) => arg !== '--format' && (formatIndex === -1 || index !== formatIndex + 1),
  );

  return {
    format: format === 'markdown' ? 'markdown' : 'json',
    inputPath: positionalArgs[0],
  };
}

async function main() {
  const { format, inputPath } = parseArgs(process.argv.slice(2));
  if (!inputPath) {
    throw new Error(
      'Usage: tsx scripts/redteam-research/comparePromptExtractionSemanticBands.ts <redteam.yaml> [--format json|markdown]',
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
  const report = {
    afterPrompts: semanticBandAwareFivePortfolio.map((attack) => attack.prompt),
    beforePrompts: baselinePrompts,
    comparison: summarizePromptExtractionSemanticBandComparison(
      baselinePrompts,
      fullPortfolio.map((attack) => attack.prompt),
      diverseFivePortfolio.map((attack) => attack.prompt),
      semanticBandAwareFivePortfolio.map((attack) => attack.prompt),
    ),
  };

  if (format === 'markdown') {
    console.log(renderPromptExtractionBeforeAfterMarkdown(report));
    return;
  }

  console.log(JSON.stringify(report.comparison, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
