import { pathToFileURL } from 'node:url';
import fs from 'fs/promises';

import yaml from 'js-yaml';
import { extractPiiSocialFeatures } from '../../src/redteam/generation/predicateSignatures';
import { summarizeCoverageDimensions } from './analyzeGeneratedAttacks';
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

export type PiiSocialCorpusResidualRow = {
  authorizationStoryIds: string[];
  featureIds: string[];
  occurrenceCount: number;
  prompt: string;
  relationshipIds: string[];
  sensitiveFieldIds: string[];
};

export type PiiSocialCorpusResidualAudit = {
  featurefulPromptCount: number;
  featurefulRowCount: number;
  rows: PiiSocialCorpusResidualRow[];
  totalPromptCount: number;
  uniquePromptCount: number;
  zeroFeaturePromptCount: number;
  zeroFeatureRowCount: number;
};

export async function auditPiiSocialCorpusResiduals(
  inputPath = 'examples/redteam-medical-agent/redteam.yaml',
): Promise<PiiSocialCorpusResidualAudit> {
  const raw = await fs.readFile(inputPath, 'utf8');
  const parsed = yaml.load(raw) as RedteamFile;
  const prompts = (parsed.tests ?? [])
    .filter((test) => test.metadata?.pluginId === 'pii:social')
    .map((test) => test.vars?.prompt)
    .filter((prompt): prompt is string => typeof prompt === 'string' && prompt.length > 0);
  const occurrencesByPrompt = new Map<string, number>();

  for (const prompt of prompts) {
    occurrencesByPrompt.set(prompt, (occurrencesByPrompt.get(prompt) ?? 0) + 1);
  }

  const rows = [...occurrencesByPrompt.entries()].map(([prompt, occurrenceCount]) => {
    const coverage = summarizeCoverageDimensions('pii:social', [prompt]);

    return {
      authorizationStoryIds: coverage['authorization-story'] ?? [],
      featureIds: extractPiiSocialFeatures(prompt),
      occurrenceCount,
      prompt,
      relationshipIds: coverage.relationship ?? [],
      sensitiveFieldIds: coverage['sensitive-field'] ?? [],
    };
  });
  const featurefulRows = rows.filter((row) => row.featureIds.length > 0);
  const zeroFeatureRows = rows.filter((row) => row.featureIds.length === 0);

  return {
    featurefulPromptCount: featurefulRows.length,
    featurefulRowCount: featurefulRows.reduce((sum, row) => sum + row.occurrenceCount, 0),
    rows,
    totalPromptCount: prompts.length,
    uniquePromptCount: rows.length,
    zeroFeaturePromptCount: zeroFeatureRows.length,
    zeroFeatureRowCount: zeroFeatureRows.reduce((sum, row) => sum + row.occurrenceCount, 0),
  };
}

function formatList(values: readonly string[]): string {
  return values.length === 0 ? 'none' : values.join(', ');
}

export function renderPiiSocialCorpusResidualAuditMarkdown(
  audit: PiiSocialCorpusResidualAudit,
): string {
  return [
    '# PII Social Corpus Residual Audit',
    '',
    ...renderMarkdownTable(
      ['Total rows', 'Unique prompts', 'Featureful rows', 'Featureless rows'],
      [
        {
          cells: [
            String(audit.totalPromptCount),
            String(audit.uniquePromptCount),
            `${audit.featurefulRowCount}/${audit.totalPromptCount}`,
            `${audit.zeroFeatureRowCount}/${audit.totalPromptCount}`,
          ],
        },
      ],
    ),
    '',
    ...renderMarkdownTable(
      [
        'Occurrences',
        'Shared features',
        'Relationship',
        'Authorization story',
        'Sensitive field',
      ],
      audit.rows.map((row) => ({
        cells: [
          String(row.occurrenceCount),
          formatList(row.featureIds),
          formatList(row.relationshipIds),
          formatList(row.authorizationStoryIds),
          formatList(row.sensitiveFieldIds),
        ],
      })),
    ),
    '',
    '## Residual Examples',
    '',
    ...audit.rows
      .filter((row) => row.featureIds.length === 0)
      .map((row, index) => `${index + 1}. ${row.prompt}`),
    '',
    '## Reading',
    '',
    'The real medical-agent benchmark slice tells a more awkward story than the curated portfolio: `pii:social` has 35 rows but only five unique prompts, and four of those five prompts remain invisible to the expanded shared extractor. The residual set is dominated by direct requests or weak operational framing rather than explicit social claims, which means the next decision is partly taxonomic: either broaden the shared vocabulary to cover those legacy prompts or acknowledge that the historical `pii:social` corpus is mostly not social in the stronger sense the new frontier is trying to model.',
  ].join('\n');
}

async function main() {
  console.log(renderPiiSocialCorpusResidualAuditMarkdown(await auditPiiSocialCorpusResiduals()));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
