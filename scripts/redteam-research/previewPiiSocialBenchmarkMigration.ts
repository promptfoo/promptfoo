import { pathToFileURL } from 'node:url';

import { buildPiiPortfolio, loadPiiContext, type PiiAttack } from './piiResearchShared';
import { buildPiiSocialLegacyRows } from './piiSocialLegacyCorpus';
import { renderMarkdownTable } from './reportRenderingShared';

type StrategyTemplate = {
  strategyId: string;
};

export type PiiSocialBenchmarkMigrationPreview = {
  legacyRows: number;
  previewRows: number;
  refreshedRows: {
    prompt: string;
    strategyId: string;
  }[];
  replacedLegacyPrompts: string[];
};

function buildStrategyTemplates(): StrategyTemplate[] {
  const seen = new Set<string>();
  const templates: StrategyTemplate[] = [];

  for (const row of buildPiiSocialLegacyRows()) {
    const strategyId = row.strategyId;
    if (seen.has(strategyId)) {
      continue;
    }

    seen.add(strategyId);
    templates.push({
      strategyId,
    });
  }

  return templates.sort((a, b) => a.strategyId.localeCompare(b.strategyId));
}

function materializePreviewRows(
  attacks: readonly PiiAttack[],
  templates: readonly StrategyTemplate[],
): PiiSocialBenchmarkMigrationPreview['refreshedRows'] {
  return templates.flatMap((template) =>
    attacks.map((attack) => ({
      prompt: attack.prompt,
      strategyId: template.strategyId,
    })),
  );
}

export async function previewPiiSocialBenchmarkMigration(
  inputPath = 'examples/redteam-medical-agent/redteam.yaml',
): Promise<PiiSocialBenchmarkMigrationPreview> {
  const legacyRows = buildPiiSocialLegacyRows();
  const { entities } = await loadPiiContext(inputPath);
  const refreshedAttacks = buildPiiPortfolio(entities, 'pii:social');
  const templates = buildStrategyTemplates();

  return {
    legacyRows: legacyRows.length,
    previewRows: refreshedAttacks.length * templates.length,
    refreshedRows: materializePreviewRows(refreshedAttacks, templates),
    replacedLegacyPrompts: [...new Set(legacyRows.map((row) => row.prompt))],
  };
}

export function renderPiiSocialBenchmarkMigrationPreviewMarkdown(
  preview: PiiSocialBenchmarkMigrationPreview,
): string {
  const rowsByStrategy = new Map<string, number>();

  for (const row of preview.refreshedRows) {
    rowsByStrategy.set(row.strategyId, (rowsByStrategy.get(row.strategyId) ?? 0) + 1);
  }

  return [
    '# PII Social Benchmark Migration Preview',
    '',
    ...renderMarkdownTable(
      ['Legacy rows replaced', 'Preview rows emitted', 'Net row change'],
      [
        {
          cells: [
            String(preview.legacyRows),
            String(preview.previewRows),
            String(preview.previewRows - preview.legacyRows),
          ],
        },
      ],
    ),
    '',
    ...renderMarkdownTable(
      ['Strategy', 'Preview rows'],
      [...rowsByStrategy.entries()].map(([strategyId, rowCount]) => ({
        cells: [strategyId, String(rowCount)],
      })),
    ),
    '',
    '## Refreshed Ancestors',
    '',
    ...[...new Set(preview.refreshedRows.map((row) => row.prompt))].map(
      (prompt, index) => `${index + 1}. ${prompt}`,
    ),
    '',
    '## Legacy Prompts Replaced',
    '',
    ...preview.replacedLegacyPrompts.map((prompt, index) => `${index + 1}. ${prompt}`),
    '',
    '## Reading',
    '',
    'The preview is executable as a file-level migration: it replaces the 35 stored `pii:social` rows with 30 refreshed rows, preserves one row per refreshed ancestor in each strategy context, and leaves the five historical prompt texts visible only as the compatibility set to review during rollout.',
  ].join('\n');
}

async function main() {
  console.log(
    renderPiiSocialBenchmarkMigrationPreviewMarkdown(await previewPiiSocialBenchmarkMigration()),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
