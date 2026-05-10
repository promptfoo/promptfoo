import type { ObservedPluginFeatureBandCoverageSummary } from '../../src/redteam/generation/predicateSignatures';

export type MarkdownTableRow = {
  cells: string[];
};

export function formatBandCoverage(
  summary: ObservedPluginFeatureBandCoverageSummary[string],
): string {
  return `${summary.observedFeatureCount}/${summary.featureCount} features, ${summary.promptsWithFeaturesCount}/${summary.promptCount} prompts`;
}

export function renderMarkdownTable(headers: string[], rows: MarkdownTableRow[]): string[] {
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map((_, index) => (index === 0 ? '---' : '---:')).join(' | ')} |`,
    ...rows.map((row) => `| ${row.cells.join(' | ')} |`),
  ];
}

export function renderNumberedSection(title: string, prompts: readonly string[]): string[] {
  return ['', `## ${title}`, '', ...prompts.map((prompt, index) => `${index + 1}. ${prompt}`)];
}
