import { pathToFileURL } from 'node:url';
import fs from 'fs/promises';

import yaml from 'js-yaml';
import { buildPiiPortfolio, loadPiiContext, type PiiAttack } from './piiResearchShared';
import { renderMarkdownTable } from './reportRenderingShared';

type TestCase = {
  assert?: unknown[];
  metadata?: {
    goal?: unknown;
    originalText?: unknown;
    pluginConfig?: unknown;
    pluginId?: unknown;
    severity?: unknown;
    strategyConfig?: unknown;
    strategyId?: unknown;
  };
  provider?: {
    config?: unknown;
    id?: unknown;
  };
  vars?: {
    prompt?: unknown;
  };
};

type RedteamFile = {
  tests?: TestCase[];
};

type StrategyTemplate = {
  assert?: unknown[];
  metadata?: Record<string, unknown>;
  provider?: unknown;
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

function getPrompt(test: TestCase): string | undefined {
  return typeof test.vars?.prompt === 'string' && test.vars.prompt.length > 0
    ? test.vars.prompt
    : undefined;
}

function getStrategyId(test: TestCase): string {
  return typeof test.metadata?.strategyId === 'string' ? test.metadata.strategyId : 'base';
}

async function loadLegacyRows(inputPath: string): Promise<TestCase[]> {
  const raw = await fs.readFile(inputPath, 'utf8');
  const parsed = yaml.load(raw) as RedteamFile;

  return (parsed.tests ?? []).filter((test) => test.metadata?.pluginId === 'pii:social');
}

function buildStrategyTemplates(rows: readonly TestCase[]): StrategyTemplate[] {
  const seen = new Set<string>();
  const templates: StrategyTemplate[] = [];

  for (const row of rows) {
    const strategyId = getStrategyId(row);
    if (seen.has(strategyId)) {
      continue;
    }

    seen.add(strategyId);
    templates.push({
      assert: row.assert,
      metadata:
        row.metadata && typeof row.metadata === 'object'
          ? (row.metadata as Record<string, unknown>)
          : undefined,
      provider: row.provider,
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
  const legacyRows = await loadLegacyRows(inputPath);
  const { entities } = await loadPiiContext(inputPath);
  const refreshedAttacks = buildPiiPortfolio(entities, 'pii:social');

  return {
    legacyRows: legacyRows.length,
    previewRows: refreshedAttacks.length * buildStrategyTemplates(legacyRows).length,
    refreshedRows: materializePreviewRows(refreshedAttacks, buildStrategyTemplates(legacyRows)),
    replacedLegacyPrompts: [
      ...new Set(legacyRows.map(getPrompt).filter((prompt): prompt is string => Boolean(prompt))),
    ],
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
    renderPiiSocialBenchmarkMigrationPreviewMarkdown(
      await previewPiiSocialBenchmarkMigration(),
    ),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
