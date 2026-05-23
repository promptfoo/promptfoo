import { pathToFileURL } from 'node:url';

import {
  extractPiiDirectFeatures,
  summarizeObservedPluginFeatureCoverage,
} from '../../src/redteam/generation/predicateSignatures';
import { buildPiiPortfolio, loadPiiContext } from './piiResearchShared';
import { renderMarkdownTable } from './reportRenderingShared';

export type PiiDirectQualityProxyRow = {
  featureIds: string[];
  prompt: string;
  sensitiveField: string;
};

export type PiiDirectQualityProxyAudit = {
  observedCoverage: ReturnType<typeof summarizeObservedPluginFeatureCoverage>;
  recommendation: 'stage-2 ready' | 'needs stronger proxy';
  rows: PiiDirectQualityProxyRow[];
  visiblePromptCount: number;
  zeroSignalPromptCount: number;
};

export async function auditPiiDirectQualityProxy(
  inputPath = 'examples/redteam-medical-agent/redteam.yaml',
): Promise<PiiDirectQualityProxyAudit> {
  const { entities } = await loadPiiContext(inputPath);
  const rows = buildPiiPortfolio(entities, 'pii:direct').map((attack) => ({
    featureIds: extractPiiDirectFeatures(attack.prompt),
    prompt: attack.prompt,
    sensitiveField: attack.sensitiveField,
  }));
  const visiblePromptCount = rows.filter((row) => row.featureIds.length > 0).length;
  const observedCoverage = summarizeObservedPluginFeatureCoverage(
    'pii:direct',
    rows.map((row) => row.prompt),
  );
  const zeroSignalPromptCount = rows.length - visiblePromptCount;

  return {
    observedCoverage,
    recommendation:
      visiblePromptCount === rows.length &&
      observedCoverage.observedFeatureCount === observedCoverage.featureCount
        ? 'stage-2 ready'
        : 'needs stronger proxy',
    rows,
    visiblePromptCount,
    zeroSignalPromptCount,
  };
}

function formatFeatures(features: readonly string[]): string {
  return features.length === 0 ? 'none' : features.join(', ');
}

export function renderPiiDirectQualityProxyMarkdown(audit: PiiDirectQualityProxyAudit): string {
  return [
    '# PII Direct Quality Proxy',
    '',
    ...renderMarkdownTable(
      [
        'Field-visible prompts',
        'Observed sensitive-field coverage',
        'Zero-signal prompts',
        'Recommendation',
      ],
      [
        {
          cells: [
            `${audit.visiblePromptCount}/${audit.rows.length}`,
            `${audit.observedCoverage.observedFeatureCount}/${audit.observedCoverage.featureCount}`,
            String(audit.zeroSignalPromptCount),
            audit.recommendation,
          ],
        },
      ],
    ),
    '',
    ...renderMarkdownTable(
      ['Sensitive field', 'Shared predicates', 'Prompt'],
      audit.rows.map((row) => ({
        cells: [row.sensitiveField, formatFeatures(row.featureIds), row.prompt],
      })),
    ),
    '',
    '## Reading',
    '',
    '`pii:direct` does not need a novel stage-2 proxy. For this plugin, the attack shape is the explicit request for sensitive data, so prompt-level sensitive-field visibility is itself the right target-independent quality check. The current six-prompt portfolio is fully visible and covers the complete shared sensitive-field frontier before any target replay is involved.',
  ].join('\n');
}

async function main() {
  console.log(renderPiiDirectQualityProxyMarkdown(await auditPiiDirectQualityProxy()));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
