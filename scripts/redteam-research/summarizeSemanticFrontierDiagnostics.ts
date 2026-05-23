import { pathToFileURL } from 'node:url';

import { comparePiiSocialWarmStartAvailability } from './comparePiiSocialWarmStartAvailability';
import { renderMarkdownTable } from './reportRenderingShared';

import type { SemanticFrontierSummary } from '../../src/redteam/generation/portfolio';

export type SemanticFrontierDiagnosticRow = {
  completeRunCount: number;
  frontierCount: number;
  pluginId: string;
  structurallyDegraded: boolean;
  unreachableFeatureIds: string[];
};

export type SemanticFrontierDiagnosticInput = {
  pluginId: string;
  summary: SemanticFrontierSummary;
};

export function summarizeSemanticFrontierDiagnostics(
  inputs: readonly SemanticFrontierDiagnosticInput[],
): SemanticFrontierDiagnosticRow[] {
  const byPluginId = new Map<string, SemanticFrontierSummary[]>();
  for (const input of inputs) {
    byPluginId.set(input.pluginId, [...(byPluginId.get(input.pluginId) ?? []), input.summary]);
  }

  return [...byPluginId.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([pluginId, summaries]) => {
      const unreachableFeatureIds = [
        ...new Set(
          summaries.flatMap((summary) =>
            Object.values(summary.bands).flatMap((band) => band.unreachableFeatureIds),
          ),
        ),
      ].sort();

      return {
        completeRunCount: summaries.filter((summary) => summary.complete).length,
        frontierCount: summaries.length,
        pluginId,
        structurallyDegraded: unreachableFeatureIds.length > 0,
        unreachableFeatureIds,
      };
    });
}

export async function summarizePiiSocialAvailabilityDiagnostics(): Promise<
  SemanticFrontierDiagnosticRow[]
> {
  const rows = await comparePiiSocialWarmStartAvailability([3]);

  return summarizeSemanticFrontierDiagnostics(
    rows.flatMap((row) =>
      row.semanticFrontier
        ? [
            {
              pluginId: `pii:social:${row.scenario}`,
              summary: row.semanticFrontier,
            },
          ]
        : [],
    ),
  );
}

export function renderSemanticFrontierDiagnosticsMarkdown(
  rows: readonly SemanticFrontierDiagnosticRow[],
): string {
  return [
    '# Semantic Frontier Diagnostics',
    '',
    ...renderMarkdownTable(
      ['Plugin', 'Frontiers', 'Complete runs', 'Structural degradation', 'Unreachable features'],
      rows.map((row) => ({
        cells: [
          row.pluginId,
          String(row.frontierCount),
          String(row.completeRunCount),
          row.structurallyDegraded ? 'yes' : 'no',
          row.unreachableFeatureIds.join(', ') || 'none',
        ],
      })),
    ),
    '',
    '## Reading',
    '',
    'A plugin-level diagnostic can now distinguish healthy compression from structural loss without inspecting every retained prompt. In the availability study, only the `without-self-lost-access` scenario is structurally degraded, and it reports `requestsPrescriptionDetails` plus `requestsRefillDates` as unreachable.',
  ].join('\n');
}

async function main() {
  console.log(
    renderSemanticFrontierDiagnosticsMarkdown(await summarizePiiSocialAvailabilityDiagnostics()),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
