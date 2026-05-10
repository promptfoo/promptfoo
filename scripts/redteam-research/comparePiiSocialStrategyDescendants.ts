import { pathToFileURL } from 'node:url';
import fs from 'fs/promises';

import yaml from 'js-yaml';
import { extractPiiSocialFeatures } from '../../src/redteam/generation/predicateSignatures';
import { buildPiiPortfolio, loadPiiContext } from './piiResearchShared';
import { renderMarkdownTable } from './reportRenderingShared';

type TestCase = {
  metadata?: {
    originalText?: unknown;
    pluginId?: unknown;
    strategyId?: unknown;
  };
  vars?: {
    prompt?: unknown;
  };
};

type RedteamFile = {
  tests?: TestCase[];
};

export type PiiSocialStrategyDescendantSummary = {
  ancestorCount: number;
  featurefulAncestorCount: number;
  rowCount: number;
  strategyId: string;
};

export type PiiSocialStrategyDescendantComparison = {
  legacy: PiiSocialStrategyDescendantSummary[];
  refreshedPrototype: PiiSocialStrategyDescendantSummary[];
};

function getPrompt(test: TestCase): string | undefined {
  return typeof test.vars?.prompt === 'string' && test.vars.prompt.length > 0
    ? test.vars.prompt
    : undefined;
}

function getAncestorPrompt(test: TestCase): string | undefined {
  return typeof test.metadata?.originalText === 'string' && test.metadata.originalText.length > 0
    ? test.metadata.originalText
    : getPrompt(test);
}

async function summarizeLegacyDescendants(
  inputPath: string,
): Promise<PiiSocialStrategyDescendantSummary[]> {
  const raw = await fs.readFile(inputPath, 'utf8');
  const parsed = yaml.load(raw) as RedteamFile;
  const grouped = new Map<string, TestCase[]>();

  for (const test of parsed.tests ?? []) {
    if (test.metadata?.pluginId !== 'pii:social') {
      continue;
    }

    const strategyId =
      typeof test.metadata?.strategyId === 'string' ? test.metadata.strategyId : 'base';
    const rows = grouped.get(strategyId) ?? [];
    rows.push(test);
    grouped.set(strategyId, rows);
  }

  return [...grouped.entries()]
    .map(([strategyId, rows]) => {
      const ancestorPrompts = [
        ...new Set(rows.map(getAncestorPrompt).filter((prompt): prompt is string => Boolean(prompt))),
      ];

      return {
        ancestorCount: ancestorPrompts.length,
        featurefulAncestorCount: ancestorPrompts.filter(
          (prompt) => extractPiiSocialFeatures(prompt).length > 0,
        ).length,
        rowCount: rows.length,
        strategyId,
      };
    })
    .sort((a, b) => a.strategyId.localeCompare(b.strategyId));
}

function summarizeRefreshedPrototype(
  strategyIds: readonly string[],
  prompts: readonly string[],
): PiiSocialStrategyDescendantSummary[] {
  const featurefulAncestorCount = prompts.filter(
    (prompt) => extractPiiSocialFeatures(prompt).length > 0,
  ).length;

  return strategyIds.map((strategyId) => ({
    ancestorCount: prompts.length,
    featurefulAncestorCount,
    rowCount: prompts.length,
    strategyId,
  }));
}

export async function comparePiiSocialStrategyDescendants(
  inputPath = 'examples/redteam-medical-agent/redteam.yaml',
): Promise<PiiSocialStrategyDescendantComparison> {
  const legacy = await summarizeLegacyDescendants(inputPath);
  const { entities } = await loadPiiContext(inputPath);
  const refreshedPrompts = buildPiiPortfolio(entities, 'pii:social').map((attack) => attack.prompt);

  return {
    legacy,
    refreshedPrototype: summarizeRefreshedPrototype(
      legacy.map((summary) => summary.strategyId),
      refreshedPrompts,
    ),
  };
}

export function renderPiiSocialStrategyDescendantComparisonMarkdown(
  comparison: PiiSocialStrategyDescendantComparison,
): string {
  return [
    '# PII Social Strategy Descendant Comparison',
    '',
    ...renderMarkdownTable(
      ['Strategy', 'Legacy rows', 'Legacy ancestors', 'Legacy featureful ancestors'],
      comparison.legacy.map((summary) => ({
        cells: [
          summary.strategyId,
          String(summary.rowCount),
          String(summary.ancestorCount),
          `${summary.featurefulAncestorCount}/${summary.ancestorCount}`,
        ],
      })),
    ),
    '',
    ...renderMarkdownTable(
      [
        'Strategy',
        'Refreshed rows',
        'Refreshed ancestors',
        'Refreshed featureful ancestors',
      ],
      comparison.refreshedPrototype.map((summary) => ({
        cells: [
          summary.strategyId,
          String(summary.rowCount),
          String(summary.ancestorCount),
          `${summary.featurefulAncestorCount}/${summary.ancestorCount}`,
        ],
      })),
    ),
    '',
    '## Reading',
    '',
    'Every current strategy context preserves the same five legacy ancestors, and only one of those five ancestors carries shared social evidence. Replacing the base slice with the six-prompt refreshed prototype would therefore improve every descendant context at once: each strategy would inherit six distinct ancestors and all six would stay visible to the shared social layer.',
  ].join('\n');
}

async function main() {
  console.log(
    renderPiiSocialStrategyDescendantComparisonMarkdown(
      await comparePiiSocialStrategyDescendants(),
    ),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
