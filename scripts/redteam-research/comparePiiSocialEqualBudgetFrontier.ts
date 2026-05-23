import { pathToFileURL } from 'node:url';

import {
  comparePiiSocialLowBudgetEfficiency,
  type PiiSocialLowBudgetEfficiencyRow,
} from './comparePiiSocialLowBudgetEfficiency';
import {
  comparePiiSocialLowBudgetWarmStart,
  type PiiSocialLowBudgetWarmStartRow,
} from './comparePiiSocialLowBudgetWarmStart';
import { renderMarkdownTable } from './reportRenderingShared';

type EqualBudgetStrategy = 'legacy-order' | 'semantic-full-sweep' | 'semantic-warm-start';

type NormalizedStrategyRow = {
  requestedCount: number;
  requestedPromptCount: number;
  selectedCoverage: string;
  strategy: EqualBudgetStrategy;
};

export type PiiSocialEqualBudgetFrontierRow = {
  budget: number;
  bestRowsByStrategy: Partial<Record<EqualBudgetStrategy, NormalizedStrategyRow>>;
};

function parseCoverage(coverage: string): number {
  const [observed, total] = coverage.split('/').map(Number);
  return total > 0 ? observed / total : 0;
}

function toNormalizedRows(
  lowBudgetRows: readonly PiiSocialLowBudgetEfficiencyRow[],
  warmStartRows: readonly PiiSocialLowBudgetWarmStartRow[],
): NormalizedStrategyRow[] {
  return [
    ...lowBudgetRows
      .filter((row) => row.strategy === 'legacy-order')
      .map((row) => ({
        requestedCount: row.requestedCount,
        requestedPromptCount: row.requestedPromptCount,
        selectedCoverage: row.selectedCoverage,
        strategy: 'legacy-order' as const,
      })),
    ...warmStartRows.map((row) => ({
      requestedCount: row.requestedCount,
      requestedPromptCount: row.requestedPromptCount,
      selectedCoverage: row.selectedCoverage,
      strategy: row.strategy,
    })),
  ];
}

function chooseBestRow(
  rows: readonly NormalizedStrategyRow[],
  strategy: EqualBudgetStrategy,
  budget: number,
): NormalizedStrategyRow | undefined {
  return rows
    .filter((row) => row.strategy === strategy && row.requestedPromptCount <= budget)
    .sort(
      (left, right) =>
        parseCoverage(right.selectedCoverage) - parseCoverage(left.selectedCoverage) ||
        right.requestedCount - left.requestedCount ||
        left.requestedPromptCount - right.requestedPromptCount,
    )[0];
}

export async function comparePiiSocialEqualBudgetFrontier(
  budgets: readonly number[] = [2, 4, 6, 8, 10, 12],
): Promise<PiiSocialEqualBudgetFrontierRow[]> {
  const requestedCounts = [1, 2, 3, 4, 5, 6];
  const [lowBudgetRows, warmStartRows] = await Promise.all([
    comparePiiSocialLowBudgetEfficiency(requestedCounts),
    comparePiiSocialLowBudgetWarmStart(requestedCounts),
  ]);
  const rows = toNormalizedRows(lowBudgetRows, warmStartRows);

  return budgets.map((budget) => ({
    bestRowsByStrategy: {
      'legacy-order': chooseBestRow(rows, 'legacy-order', budget),
      'semantic-full-sweep': chooseBestRow(rows, 'semantic-full-sweep', budget),
      'semantic-warm-start': chooseBestRow(rows, 'semantic-warm-start', budget),
    },
    budget,
  }));
}

function formatBestRow(row: NormalizedStrategyRow | undefined): string {
  if (!row) {
    return 'n/a';
  }

  return `${row.selectedCoverage} @ n=${row.requestedCount}`;
}

export function renderPiiSocialEqualBudgetFrontierMarkdown(
  rows: readonly PiiSocialEqualBudgetFrontierRow[],
): string {
  return [
    '# PII Social Equal-Budget Frontier',
    '',
    ...renderMarkdownTable(
      ['Prompt budget', 'Legacy order', 'Semantic warm start', 'Semantic full sweep'],
      rows.map((row) => ({
        cells: [
          String(row.budget),
          formatBestRow(row.bestRowsByStrategy['legacy-order']),
          formatBestRow(row.bestRowsByStrategy['semantic-warm-start']),
          formatBestRow(row.bestRowsByStrategy['semantic-full-sweep']),
        ],
      })),
    ),
    '',
    '## Reading',
    '',
    'Equal-budget normalization changes the interpretation of the earlier low-budget results. The warm start is strictly more efficient than the full semantic sweep, but the current scripted family inventory is already easy enough that legacy order reaches the full shared frontier by six generated prompts too. That means this benchmark is saturated for comparing warm start against legacy under equal spend; the next discriminative benchmark needs messier generic outputs or real generation artifacts, not only well-formed scripted families.',
  ].join('\n');
}

async function main() {
  console.log(
    renderPiiSocialEqualBudgetFrontierMarkdown(await comparePiiSocialEqualBudgetFrontier()),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
