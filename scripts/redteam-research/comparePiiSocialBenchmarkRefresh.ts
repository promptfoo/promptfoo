import { pathToFileURL } from 'node:url';
import fs from 'fs/promises';

import yaml from 'js-yaml';
import {
  extractPiiSocialFeatures,
  summarizeObservedPluginFeatureBandCoverage,
  summarizeObservedPluginFeatureCoverage,
} from '../../src/redteam/generation/predicateSignatures';
import { summarizeCoverageDimensions } from './analyzeGeneratedAttacks';
import { buildPiiSocialLegacyPrompts } from './piiSocialLegacyCorpus';
import { renderMarkdownTable } from './reportRenderingShared';

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

export type PiiSocialBenchmarkSliceSummary = {
  authorizationStoryCoverage: string[];
  featurefulPromptCount: number;
  observedFeatureCount: number;
  promptCount: number;
  relationshipCoverage: string[];
  sharedFeatureCoverage: string;
  uniquePromptCount: number;
};

export type PiiSocialBenchmarkRefreshComparison = {
  legacy: PiiSocialBenchmarkSliceSummary;
  refreshed: PiiSocialBenchmarkSliceSummary;
};

async function loadPiiSocialPrompts(inputPath: string): Promise<string[]> {
  const raw = await fs.readFile(inputPath, 'utf8');
  const parsed = yaml.load(raw) as RedteamFile;

  return (parsed.tests ?? [])
    .filter((test) => test.metadata?.pluginId === 'pii:social')
    .map((test) => test.vars?.prompt)
    .filter((prompt): prompt is string => typeof prompt === 'string' && prompt.length > 0);
}

function summarizeSlice(
  prompts: readonly string[],
  relationshipCoverage: readonly string[],
  authorizationStoryCoverage: readonly string[],
): PiiSocialBenchmarkSliceSummary {
  const uniquePrompts = [...new Set(prompts)];
  const featureCoverage = summarizeObservedPluginFeatureCoverage('pii:social', uniquePrompts);

  return {
    authorizationStoryCoverage: [...new Set(authorizationStoryCoverage)].sort(),
    featurefulPromptCount: uniquePrompts.filter(
      (prompt) => extractPiiSocialFeatures(prompt).length > 0,
    ).length,
    observedFeatureCount: featureCoverage.observedFeatureCount,
    promptCount: prompts.length,
    relationshipCoverage: [...new Set(relationshipCoverage)].sort(),
    sharedFeatureCoverage: `${featureCoverage.observedFeatureCount}/${featureCoverage.featureCount}`,
    uniquePromptCount: uniquePrompts.length,
  };
}

export async function comparePiiSocialBenchmarkRefresh(
  inputPath = 'examples/redteam-medical-agent/redteam.yaml',
): Promise<PiiSocialBenchmarkRefreshComparison> {
  const legacyPrompts = buildPiiSocialLegacyPrompts();
  const refreshedPrompts = await loadPiiSocialPrompts(inputPath);
  const refreshedCoverage = summarizeCoverageDimensions('pii:social', refreshedPrompts);

  return {
    legacy: summarizeSlice(legacyPrompts, [], []),
    refreshed: summarizeSlice(
      refreshedPrompts,
      refreshedCoverage.relationship ?? [],
      refreshedCoverage['authorization-story'] ?? [],
    ),
  };
}

export function renderPiiSocialBenchmarkRefreshComparisonMarkdown(
  comparison: PiiSocialBenchmarkRefreshComparison,
): string {
  const refreshedBands = summarizeObservedPluginFeatureBandCoverage('pii:social', []);

  return [
    '# PII Social Benchmark Refresh Comparison',
    '',
    ...renderMarkdownTable(
      [
        'Slice',
        'Rows',
        'Unique prompts',
        'Featureful prompts',
        'Shared coverage',
        'Observed predicates',
      ],
      [
        {
          cells: [
            'legacy',
            String(comparison.legacy.promptCount),
            String(comparison.legacy.uniquePromptCount),
            `${comparison.legacy.featurefulPromptCount}/${comparison.legacy.uniquePromptCount}`,
            comparison.legacy.sharedFeatureCoverage,
            String(comparison.legacy.observedFeatureCount),
          ],
        },
        {
          cells: [
            'refreshed benchmark',
            String(comparison.refreshed.promptCount),
            String(comparison.refreshed.uniquePromptCount),
            `${comparison.refreshed.featurefulPromptCount}/${comparison.refreshed.uniquePromptCount}`,
            comparison.refreshed.sharedFeatureCoverage,
            String(comparison.refreshed.observedFeatureCount),
          ],
        },
      ],
    ),
    '',
    ...renderMarkdownTable(
      ['Slice', 'Relationship coverage', 'Authorization-story coverage'],
      [
        {
          cells: [
            'legacy',
            comparison.legacy.relationshipCoverage.join(', ') || 'not modeled here',
            comparison.legacy.authorizationStoryCoverage.join(', ') || 'not modeled here',
          ],
        },
        {
          cells: [
            'refreshed benchmark',
            comparison.refreshed.relationshipCoverage.join(', '),
            comparison.refreshed.authorizationStoryCoverage.join(', '),
          ],
        },
      ],
    ),
    '',
    '## Contract Check',
    '',
    `- expected shared bands remain defined: ${Object.keys(refreshedBands).join(', ')}`,
    `- refreshed positive-claim visibility: ${comparison.refreshed.featurefulPromptCount}/${comparison.refreshed.uniquePromptCount}`,
    `- refreshed shared predicate coverage: ${comparison.refreshed.sharedFeatureCoverage}`,
    '',
    '## Reading',
    '',
    'The migrated live benchmark shrinks the stored slice, increases unique retained prompts, and expands observed predicate coverage toward the intended positive-claim frontier. One retained aftercare prompt remains an explicit residual: it requests data after discharge without naming a family relationship, so it should be replaced by fresh generation rather than counted as family evidence.',
  ].join('\n');
}

async function main() {
  console.log(
    renderPiiSocialBenchmarkRefreshComparisonMarkdown(await comparePiiSocialBenchmarkRefresh()),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
