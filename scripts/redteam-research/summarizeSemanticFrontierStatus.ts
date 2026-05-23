import { pathToFileURL } from 'node:url';

import { getAnalyzerSemanticAlignment } from './analyzeGeneratedAttacks';
import {
  compareResearchProductionSemanticFrontiers,
  type ResearchProductionSemanticFrontierComparison,
} from './compareResearchProductionSemanticFrontiers';
import {
  runProductionSemanticFrontierBenchmark,
  type ProductionSemanticFrontierBenchmark,
} from './benchmarkProductionSemanticFrontiers';
import { renderMarkdownTable } from './reportRenderingShared';

type AlignmentShape = {
  kinds: string[];
  label: string;
};

export type ProductionSemanticFrontierStatusRow = {
  alignmentShape: AlignmentShape;
  frontierBandCount: number;
  generatedFamilyCountAtThreshold: number;
  parity: boolean;
  pluginId: ResearchProductionSemanticFrontierComparison['pluginId'];
  selectedTestCountAtThreshold: number;
  threshold: number;
};

export type FrontierCandidateShapeRow = {
  addsNewShape: boolean;
  alignmentShape: AlignmentShape;
  pluginId: 'excessive-agency' | 'pii:social';
  recommendation: 'next informative target' | 'defer';
};

const CANDIDATE_PLUGIN_IDS = ['pii:social', 'excessive-agency'] as const;

function summarizeAlignmentShape(pluginId: string): AlignmentShape {
  const kinds = [...new Set(getAnalyzerSemanticAlignment(pluginId).map((item) => item.kind))].sort();
  return {
    kinds,
    label: kinds.length > 0 ? kinds.join(' + ') : 'none',
  };
}

function getThresholdRow(benchmark: ProductionSemanticFrontierBenchmark) {
  const row = benchmark.rows.find((candidate) => candidate.frontierActive);
  if (!row?.semanticFrontier) {
    throw new Error(`Missing active frontier row for ${benchmark.pluginId}`);
  }

  return row;
}

export async function summarizeSemanticFrontierStatus(): Promise<{
  candidates: FrontierCandidateShapeRow[];
  production: ProductionSemanticFrontierStatusRow[];
}> {
  const [comparisons, benchmarks] = await Promise.all([
    compareResearchProductionSemanticFrontiers(),
    runProductionSemanticFrontierBenchmark([5]),
  ]);
  const benchmarkByPluginId = new Map(benchmarks.map((benchmark) => [benchmark.pluginId, benchmark]));
  const production = comparisons.map((comparison) => {
    const benchmark = benchmarkByPluginId.get(comparison.pluginId);
    if (!benchmark) {
      throw new Error(`Missing benchmark for ${comparison.pluginId}`);
    }
    const thresholdRow = getThresholdRow(benchmark);

    return {
      alignmentShape: summarizeAlignmentShape(comparison.pluginId),
      frontierBandCount: Object.keys(comparison.productionBandCoverage).length,
      generatedFamilyCountAtThreshold: thresholdRow.generatedFamilyCount,
      parity: comparison.agreesOnCompleteFrontier,
      pluginId: comparison.pluginId,
      selectedTestCountAtThreshold: thresholdRow.selectedTestCount,
      threshold: thresholdRow.semanticFrontier?.minimumPortfolioSize ?? thresholdRow.requestedCount,
    };
  });
  const productionShapes = new Set(production.map((row) => row.alignmentShape.label));
  const candidateShapes = CANDIDATE_PLUGIN_IDS.map((pluginId) => {
    const alignmentShape = summarizeAlignmentShape(pluginId);

    return {
      alignmentShape,
      pluginId,
      addsNewShape: !productionShapes.has(alignmentShape.label),
    };
  });
  const richestNovelShapeWidth = Math.max(
    0,
    ...candidateShapes
      .filter((candidate) => candidate.addsNewShape)
      .map((candidate) => candidate.alignmentShape.kinds.length),
  );
  const candidates = candidateShapes.map((candidate) => ({
    ...candidate,
    recommendation:
      candidate.addsNewShape && candidate.alignmentShape.kinds.length === richestNovelShapeWidth
        ? 'next informative target'
        : 'defer',
  })) satisfies FrontierCandidateShapeRow[];

  return {
    candidates,
    production,
  };
}

export function renderSemanticFrontierStatusMarkdown(status: {
  candidates: readonly FrontierCandidateShapeRow[];
  production: readonly ProductionSemanticFrontierStatusRow[];
}): string {
  return [
    '# Semantic Frontier Status',
    '',
    ...renderMarkdownTable(
      [
        'Plugin',
        'Bands',
        'Threshold',
        'Generated @ threshold',
        'Selected @ threshold',
        'Alignment shape',
        'Parity',
      ],
      status.production.map((row) => ({
        cells: [
          row.pluginId,
          String(row.frontierBandCount),
          String(row.threshold),
          String(row.generatedFamilyCountAtThreshold),
          String(row.selectedTestCountAtThreshold),
          row.alignmentShape.label,
          row.parity ? 'yes' : 'no',
        ],
      })),
    ),
    '',
    '## Candidate Shape Scan',
    '',
    ...renderMarkdownTable(
      ['Plugin', 'Alignment shape', 'Adds new shape', 'Recommendation'],
      status.candidates.map((row) => ({
        cells: [
          row.pluginId,
          row.alignmentShape.label,
          row.addsNewShape ? 'yes' : 'no',
          row.recommendation,
        ],
      })),
    ),
    '',
    '## Reading',
    '',
    'The productionized set now covers three distinct frontier shapes: exact-plus-separate (`pii:direct`), separate-only (`prompt-extraction`), and exact-plus-coarser (`sql-injection`). The next informative target is `pii:social`, not because it introduces a brand-new alignment kind, but because it is the first remaining plugin with the untested coarser-plus-separate combination. `excessive-agency` is exact-only, which would mostly repeat territory already exercised by the current production set.',
  ].join('\n');
}

async function main() {
  console.log(renderSemanticFrontierStatusMarkdown(await summarizeSemanticFrontierStatus()));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
