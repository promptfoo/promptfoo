import { pathToFileURL } from 'node:url';
import fs from 'fs/promises';

import yaml from 'js-yaml';
import {
  getAnalyzerSemanticAlignment,
} from './analyzeGeneratedAttacks';
import {
  buildPiiCandidatePool,
  buildPiiPortfolio,
  selectDiversePiiPortfolio,
  selectSemanticFeatureAwarePiiDirectPortfolio,
} from './piiResearchShared';
import { renderMarkdownTable } from './reportRenderingShared';
import { extractEntities, loadPurpose } from './sqlResearchShared';
import {
  summarizeObservedPluginFeatureCoverage,
  type ObservedPluginFeatureCoverageSummary,
} from '../../src/redteam/generation/predicateSignatures';

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

export type SemanticFrontierCandidateComparison = {
  exactProjectionDimensionCount: number;
  firstFiveCoverage?: ObservedPluginFeatureCoverageSummary;
  currentFiveCoverage: ObservedPluginFeatureCoverageSummary;
  pluginId: 'pii:direct' | 'excessive-agency';
  recommendedNextTarget: boolean;
  semanticAwareFiveCoverage?: ObservedPluginFeatureCoverageSummary;
  separateConceptDimensionCount: number;
};

async function loadUniquePrompts(inputPath: string, pluginId: string): Promise<string[]> {
  const raw = await fs.readFile(inputPath, 'utf8');
  const parsed = yaml.load(raw) as RedteamFile;

  return [
    ...new Set(
      (parsed.tests ?? [])
        .filter((test) => test.metadata?.pluginId === pluginId)
        .map((test) => test.vars?.prompt)
        .filter((prompt): prompt is string => typeof prompt === 'string' && prompt.length > 0),
    ),
  ];
}

function summarizeAlignment(pluginId: 'pii:direct' | 'excessive-agency') {
  const alignment = getAnalyzerSemanticAlignment(pluginId);
  return {
    exactProjectionDimensionCount: alignment.filter(
      (dimension) => dimension.kind === 'exact-projection',
    ).length,
    separateConceptDimensionCount: alignment.filter(
      (dimension) => dimension.kind === 'separate-concept',
    ).length,
  };
}

export async function compareNextSemanticFrontierCandidates(
  inputPath = 'examples/redteam-medical-agent/redteam.yaml',
): Promise<SemanticFrontierCandidateComparison[]> {
  const purpose = await loadPurpose(inputPath);
  const entities = extractEntities(purpose);
  const directPiiPool = buildPiiCandidatePool(buildPiiPortfolio(entities, 'pii:direct'));
  const directPiiFirstFive = directPiiPool.slice(0, 5);
  const directPiiDiverseFive = selectDiversePiiPortfolio(directPiiPool, 5);
  const directPiiSemanticFive = selectSemanticFeatureAwarePiiDirectPortfolio(directPiiPool, 5);
  const excessiveAgencyBaseline = await loadUniquePrompts(inputPath, 'excessive-agency');

  return [
    {
      ...summarizeAlignment('pii:direct'),
      currentFiveCoverage: summarizeObservedPluginFeatureCoverage(
        'pii:direct',
        directPiiDiverseFive.map((attack) => attack.prompt),
      ),
      firstFiveCoverage: summarizeObservedPluginFeatureCoverage(
        'pii:direct',
        directPiiFirstFive.map((attack) => attack.prompt),
      ),
      pluginId: 'pii:direct',
      recommendedNextTarget: true,
      semanticAwareFiveCoverage: summarizeObservedPluginFeatureCoverage(
        'pii:direct',
        directPiiSemanticFive.map((attack) => attack.prompt),
      ),
    },
    {
      ...summarizeAlignment('excessive-agency'),
      currentFiveCoverage: summarizeObservedPluginFeatureCoverage(
        'excessive-agency',
        excessiveAgencyBaseline,
      ),
      pluginId: 'excessive-agency',
      recommendedNextTarget: false,
    },
  ];
}

function formatCoverage(summary: ObservedPluginFeatureCoverageSummary | undefined): string {
  return summary ? `${summary.observedFeatureCount}/${summary.featureCount}` : 'n/a';
}

export function renderNextSemanticFrontierCandidateComparisonMarkdown(
  comparisons: readonly SemanticFrontierCandidateComparison[],
): string {
  return [
    '# Next Semantic Frontier Candidate',
    '',
    ...renderMarkdownTable(
      [
        'Plugin',
        'Exact shared dims',
        'Separate dims',
        'First five',
        'Current five',
        'Semantic-aware five',
        'Recommendation',
      ],
      comparisons.map((comparison) => ({
        cells: [
          comparison.pluginId,
          String(comparison.exactProjectionDimensionCount),
          String(comparison.separateConceptDimensionCount),
          formatCoverage(comparison.firstFiveCoverage),
          formatCoverage(comparison.currentFiveCoverage),
          formatCoverage(comparison.semanticAwareFiveCoverage),
          comparison.recommendedNextTarget ? 'next target' : 'defer',
        ],
      })),
    ),
    '',
    '## Reading',
    '',
    '`pii:direct` is the stronger next frontier candidate: it already has one exact shared axis plus a separate analyzer concept, naive truncation falls to `3/6`, the current diversity selector reaches only `5/6`, and a semantic-aware five-prompt selector can recover the full `6/6` sensitive-field frontier. `excessive-agency` is already a clean single-axis `5/5` projection on its five unique baseline prompts, so it is less likely to benefit from the next round of frontier work.',
  ].join('\n');
}

async function main() {
  console.log(
    renderNextSemanticFrontierCandidateComparisonMarkdown(
      await compareNextSemanticFrontierCandidates(process.argv[2]),
    ),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
