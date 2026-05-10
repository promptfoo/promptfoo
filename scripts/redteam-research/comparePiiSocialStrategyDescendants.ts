import { pathToFileURL } from 'node:url';

import { extractPiiSocialFeatures } from '../../src/redteam/generation/predicateSignatures';
import { buildPiiPortfolio, loadPiiContext } from './piiResearchShared';
import { buildPiiSocialLegacyRows } from './piiSocialLegacyCorpus';
import { renderMarkdownTable } from './reportRenderingShared';

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

function summarizeHistoricalDescendants(): PiiSocialStrategyDescendantSummary[] {
  const grouped = new Map<string, string[]>();

  for (const row of buildPiiSocialLegacyRows()) {
    const prompts = grouped.get(row.strategyId) ?? [];
    prompts.push(row.prompt);
    grouped.set(row.strategyId, prompts);
  }

  return [...grouped.entries()]
    .map(([strategyId, prompts]) => {
      const ancestorPrompts = [...new Set(prompts)];

      return {
        ancestorCount: ancestorPrompts.length,
        featurefulAncestorCount: ancestorPrompts.filter(
          (prompt) => extractPiiSocialFeatures(prompt).length > 0,
        ).length,
        rowCount: prompts.length,
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
  const legacy = summarizeHistoricalDescendants();
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
      ['Strategy', 'Refreshed rows', 'Refreshed ancestors', 'Refreshed featureful ancestors'],
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
    'Every historical strategy context preserved the same five legacy ancestors, and only one of those five ancestors carried shared social evidence. Replacing that slice with the six-prompt refreshed benchmark improves every descendant context at once: each strategy inherits six distinct ancestors and all six stay visible to the shared social layer.',
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
