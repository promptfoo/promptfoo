import { pathToFileURL } from 'node:url';

import { comparePiiSocialStrategyDescendants } from './comparePiiSocialStrategyDescendants';
import { renderMarkdownTable } from './reportRenderingShared';

export type PiiSocialBenchmarkMigrationPlan = {
  refreshedTotalRows: number;
  strategyRows: {
    action: string;
    legacyRows: number;
    refreshedRows: number;
    strategyId: string;
  }[];
  totalLegacyRows: number;
};

export async function planPiiSocialBenchmarkMigration(): Promise<PiiSocialBenchmarkMigrationPlan> {
  const comparison = await comparePiiSocialStrategyDescendants();
  const legacyByStrategy = new Map(
    comparison.legacy.map((summary) => [summary.strategyId, summary]),
  );

  const strategyRows = comparison.refreshedPrototype.map((summary) => {
    const legacy = legacyByStrategy.get(summary.strategyId);
    if (!legacy) {
      throw new Error(`Missing legacy strategy summary for ${summary.strategyId}`);
    }

    return {
      action:
        summary.strategyId === 'jailbreak'
          ? 'collapse duplicate iterative descendants to one row per refreshed ancestor'
          : 'replace legacy ancestors with refreshed ancestors',
      legacyRows: legacy.rowCount,
      refreshedRows: summary.rowCount,
      strategyId: summary.strategyId,
    };
  });

  return {
    refreshedTotalRows: strategyRows.reduce((sum, row) => sum + row.refreshedRows, 0),
    strategyRows,
    totalLegacyRows: strategyRows.reduce((sum, row) => sum + row.legacyRows, 0),
  };
}

export function renderPiiSocialBenchmarkMigrationMarkdown(
  plan: PiiSocialBenchmarkMigrationPlan,
): string {
  return [
    '# PII Social Benchmark Migration Sketch',
    '',
    ...renderMarkdownTable(
      ['Strategy', 'Legacy rows', 'Refreshed rows', 'Action'],
      plan.strategyRows.map((row) => ({
        cells: [
          row.strategyId,
          String(row.legacyRows),
          String(row.refreshedRows),
          row.action,
        ],
      })),
    ),
    '',
    '## Totals',
    '',
    `- legacy rows: ${plan.totalLegacyRows}`,
    `- refreshed rows: ${plan.refreshedTotalRows}`,
    `- net row change: ${plan.refreshedTotalRows - plan.totalLegacyRows}`,
    '',
    '## Replacement Rule',
    '',
    'Do not map the five legacy ancestors one-for-one onto the six refreshed families. The evidence says they represent different concepts. Replace the benchmark slice wholesale with the six positive-claim families, and keep the four featureless legacy ancestors only in the compatibility report.',
    '',
    '## Jailbreak Decision',
    '',
    'Collapse the `jailbreak` branch from fifteen rows to six. The current threefold multiplicity is literal duplication: each ancestor repeats with the same prompt, provider, metric, and config. There is no strategy-level diversity to preserve.',
    '',
    '## Reading',
    '',
    'The migration can improve semantic quality while shrinking the stored benchmark from 35 rows to 30. Most strategies move from five legacy ancestors to six refreshed ancestors, and the one oversized branch becomes simpler rather than larger because the old extra rows were duplicated iterative copies.',
  ].join('\n');
}

async function main() {
  console.log(renderPiiSocialBenchmarkMigrationMarkdown(await planPiiSocialBenchmarkMigration()));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
