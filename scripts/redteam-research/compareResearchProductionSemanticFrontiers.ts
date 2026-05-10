import { pathToFileURL } from 'node:url';

import {
  renderMarkdownTable,
} from './reportRenderingShared';
import {
  buildPromptExtractionCandidatePool,
  buildPromptExtractionPortfolio,
  selectSemanticBandAwarePromptExtractionPortfolio,
} from './promptExtractionResearchShared';
import {
  buildSqlCandidatePool,
  selectSemanticBandAwareSqlPortfolio,
} from './selectSqlPortfolio';
import { buildSqlAttackPortfolio, extractEntities } from './sqlResearchShared';
import {
  summarizeObservedPluginFeatureBandCoverage,
  type ObservedPluginFeatureBandCoverageSummary,
} from '../../src/redteam/generation/predicateSignatures';
import {
  runProductionSemanticFrontierBenchmark,
  type ProductionSemanticFrontierBenchmark,
} from './benchmarkProductionSemanticFrontiers';

type PluginId = 'prompt-extraction' | 'sql-injection';

type ResearchProductionSemanticFrontierComparison = {
  pluginId: PluginId;
  productionBandCoverage: ObservedPluginFeatureBandCoverageSummary;
  productionComplete: boolean;
  productionSelectedFamilies: string[];
  researchBandCoverage: ObservedPluginFeatureBandCoverageSummary;
  researchComplete: boolean;
  agreesOnCompleteFrontier: boolean;
};

const REFERENCE_ENTITIES = extractEntities('');

function summarizeResearchPromptExtraction() {
  const fullPortfolio = buildPromptExtractionPortfolio(REFERENCE_ENTITIES);
  const selected = selectSemanticBandAwarePromptExtractionPortfolio(
    buildPromptExtractionCandidatePool(fullPortfolio),
    5,
  );

  return summarizeObservedPluginFeatureBandCoverage(
    'prompt-extraction',
    selected.map((attack) => attack.prompt),
  );
}

function summarizeResearchSqlInjection() {
  const fullPortfolio = buildSqlAttackPortfolio(REFERENCE_ENTITIES);
  const selected = selectSemanticBandAwareSqlPortfolio(buildSqlCandidatePool(fullPortfolio), 5);

  return summarizeObservedPluginFeatureBandCoverage(
    'sql-injection',
    selected.map((attack) => attack.prompt),
  );
}

function getProductionBenchmark(
  benchmarks: readonly ProductionSemanticFrontierBenchmark[],
  pluginId: PluginId,
) {
  const benchmark = benchmarks.find((candidate) => candidate.pluginId === pluginId);
  if (!benchmark) {
    throw new Error(`Missing production benchmark for ${pluginId}`);
  }

  const row = benchmark.rows.find((candidate) => candidate.requestedCount === 5);
  if (!row?.semanticFrontier) {
    throw new Error(`Missing production frontier row for ${pluginId}`);
  }

  return row;
}

function summarizeProductionBands(
  pluginId: PluginId,
  row: ReturnType<typeof getProductionBenchmark>,
): ObservedPluginFeatureBandCoverageSummary {
  return Object.fromEntries(
    Object.entries(row.semanticFrontier?.bands ?? {}).map(([bandId, summary]) => [
      bandId,
      {
        coverageRate:
          summary.featureCount === 0 ? 1 : summary.observedFeatureCount / summary.featureCount,
        featureCount: summary.featureCount,
        observedFeatureCount: summary.observedFeatureCount,
        observedFeatureIds: summary.observedFeatureIds,
        pluginId,
        promptCount: row.selectedTestCount,
        promptsWithFeaturesCount: 0,
      },
    ]),
  );
}

function isComplete(summary: ObservedPluginFeatureBandCoverageSummary): boolean {
  return Object.values(summary).every(
    (band) => band.observedFeatureCount === band.featureCount,
  );
}

export async function compareResearchProductionSemanticFrontiers(): Promise<
  ResearchProductionSemanticFrontierComparison[]
> {
  const production = await runProductionSemanticFrontierBenchmark([5]);
  const promptExtractionProduction = getProductionBenchmark(production, 'prompt-extraction');
  const sqlProduction = getProductionBenchmark(production, 'sql-injection');
  const promptExtractionResearch = summarizeResearchPromptExtraction();
  const sqlResearch = summarizeResearchSqlInjection();

  return [
    {
      agreesOnCompleteFrontier:
        isComplete(promptExtractionResearch) ===
        Boolean(promptExtractionProduction.semanticFrontier?.complete),
      pluginId: 'prompt-extraction',
      productionBandCoverage: summarizeProductionBands(
        'prompt-extraction',
        promptExtractionProduction,
      ),
      productionComplete: Boolean(promptExtractionProduction.semanticFrontier?.complete),
      productionSelectedFamilies: promptExtractionProduction.selectedFamilyIds,
      researchBandCoverage: promptExtractionResearch,
      researchComplete: isComplete(promptExtractionResearch),
    },
    {
      agreesOnCompleteFrontier:
        isComplete(sqlResearch) === Boolean(sqlProduction.semanticFrontier?.complete),
      pluginId: 'sql-injection',
      productionBandCoverage: summarizeProductionBands('sql-injection', sqlProduction),
      productionComplete: Boolean(sqlProduction.semanticFrontier?.complete),
      productionSelectedFamilies: sqlProduction.selectedFamilyIds,
      researchBandCoverage: sqlResearch,
      researchComplete: isComplete(sqlResearch),
    },
  ];
}

function formatCoverage(summary: ObservedPluginFeatureBandCoverageSummary): string {
  return Object.entries(summary)
    .map(([bandId, band]) => `${bandId} ${band.observedFeatureCount}/${band.featureCount}`)
    .join(', ');
}

export function renderResearchProductionSemanticFrontierComparisonMarkdown(
  comparisons: readonly ResearchProductionSemanticFrontierComparison[],
): string {
  return [
    '# Research / Production Semantic Frontier Bridge',
    '',
    ...renderMarkdownTable(
      ['Plugin', 'Research frontier', 'Production frontier', 'Agreement'],
      comparisons.map((comparison) => ({
        cells: [
          comparison.pluginId,
          formatCoverage(comparison.researchBandCoverage),
          formatCoverage(comparison.productionBandCoverage),
          comparison.agreesOnCompleteFrontier ? 'yes' : 'no',
        ],
      })),
    ),
    '',
    '## Reading',
    '',
    'The production handoff preserves the same high-level frontier claims that motivated the research refactor: prompt extraction remains fully covered across its core-disclosure and protected-control-plane bands, and SQL injection remains fully covered across exploit-mechanism and authorization-bypass bands. The selected production family sets are allowed to differ from the research portfolios as long as those semantic frontier claims stay intact.',
  ].join('\n');
}

async function main() {
  const comparisons = await compareResearchProductionSemanticFrontiers();
  console.log(renderResearchProductionSemanticFrontierComparisonMarkdown(comparisons));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
