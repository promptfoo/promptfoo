import { pathToFileURL } from 'node:url';

import { renderMarkdownTable } from './reportRenderingShared';

export type OperatorReportTransferRow = {
  availableAxes: string[];
  missingAxes: string[];
  pluginId: 'pii:direct' | 'pii:social';
  reusableSections: string[];
  transferStatus: 'ready' | 'blocked';
};

export function auditOperatorReportTransfer(): OperatorReportTransferRow[] {
  return [
    {
      availableAxes: ['leak-ready proxy', 'target-regime breadth', 'realized target yield'],
      missingAxes: [],
      pluginId: 'pii:social',
      reusableSections: ['executive summary', 'frontier', 'per-regime evidence', 'known limitations'],
      transferStatus: 'ready',
    },
    {
      availableAxes: ['semantic sensitive-field frontier'],
      missingAxes: ['target-regime breadth', 'realized target yield'],
      pluginId: 'pii:direct',
      reusableSections: ['executive summary', 'frontier', 'known limitations'],
      transferStatus: 'blocked',
    },
  ];
}

export function renderOperatorReportTransferAuditMarkdown(
  rows: readonly OperatorReportTransferRow[],
): string {
  return [
    '# Operator Report Transfer Audit',
    '',
    ...renderMarkdownTable(
      ['Plugin', 'Available axes', 'Missing axes', 'Reusable sections', 'Transfer status'],
      rows.map((row) => ({
        cells: [
          row.pluginId,
          row.availableAxes.join(', '),
          row.missingAxes.join(', ') || '-',
          row.reusableSections.join(', '),
          row.transferStatus,
        ],
      })),
    ),
    '',
    '## Reading',
    '',
    '`pii:direct` is not blocked because it lacks a semantic frontier; it already has one. It is blocked because the current operator report also depends on target-regime breadth and realized target yield, and those replay assets do not yet exist for direct PII.',
  ].join('\n');
}

async function main() {
  console.log(renderOperatorReportTransferAuditMarkdown(auditOperatorReportTransfer()));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
