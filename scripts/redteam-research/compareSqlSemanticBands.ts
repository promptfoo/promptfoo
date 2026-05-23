import { pathToFileURL } from 'node:url';
import fs from 'fs/promises';

import yaml from 'js-yaml';
import {
  type ObservedPluginFeatureBandCoverageSummary,
  type ObservedPluginFeatureCoverageSummary,
  summarizeObservedPluginFeatureBandCoverage,
  summarizeObservedPluginFeatureCoverage,
} from '../../src/redteam/generation/predicateSignatures';
import {
  formatBandCoverage,
  renderMarkdownTable,
  renderNumberedSection,
} from './reportRenderingShared';
import {
  buildSqlCandidatePool,
  selectDiverseSqlPortfolio,
  selectSemanticBandAwareSqlPortfolio,
} from './selectSqlPortfolio';
import { buildSqlAttackPortfolio, extractEntities, loadPurpose } from './sqlResearchShared';

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

export type SqlSemanticBandSummary = {
  bandCoverage: ObservedPluginFeatureBandCoverageSummary;
  promptCount: number;
  semanticFeatureCoverage: ObservedPluginFeatureCoverageSummary;
};

export type SqlSemanticBandComparison = {
  baselineUniquePrompts: SqlSemanticBandSummary;
  curatedPortfolio: SqlSemanticBandSummary;
  diverseFivePortfolio: SqlSemanticBandSummary;
  firstFivePortfolio: SqlSemanticBandSummary;
  semanticBandAwareFivePortfolio: SqlSemanticBandSummary;
};

export type SqlBeforeAfterReport = {
  baselinePrompts: string[];
  comparison: SqlSemanticBandComparison;
  diverseFivePrompts: string[];
  firstFivePrompts: string[];
  semanticBandAwareFivePrompts: string[];
};

export function summarizeSqlSemanticBandComparison(
  baselinePrompts: readonly string[],
  curatedPrompts: readonly string[],
  firstFivePrompts: readonly string[],
  diverseFivePrompts: readonly string[],
  semanticBandAwareFivePrompts: readonly string[],
): SqlSemanticBandComparison {
  return {
    baselineUniquePrompts: summarizePromptSet(baselinePrompts),
    curatedPortfolio: summarizePromptSet(curatedPrompts),
    diverseFivePortfolio: summarizePromptSet(diverseFivePrompts),
    firstFivePortfolio: summarizePromptSet(firstFivePrompts),
    semanticBandAwareFivePortfolio: summarizePromptSet(semanticBandAwareFivePrompts),
  };
}

export function renderSqlBeforeAfterMarkdown(report: SqlBeforeAfterReport): string {
  const { baselinePrompts, comparison, diverseFivePrompts, firstFivePrompts } = report;
  const baseline = comparison.baselineUniquePrompts.bandCoverage;
  const firstFive = comparison.firstFivePortfolio.bandCoverage;
  const diverseFive = comparison.diverseFivePortfolio.bandCoverage;
  const semanticFive = comparison.semanticBandAwareFivePortfolio.bandCoverage;

  return [
    '# SQL Injection Before / After',
    '',
    ...renderMarkdownTable(
      ['Portfolio', 'Exploit mechanism', 'Authorization bypass'],
      [
        {
          cells: [
            'Baseline unique prompts',
            formatBandCoverage(baseline['exploit-mechanism']),
            formatBandCoverage(baseline['authorization-bypass']),
          ],
        },
        {
          cells: [
            'First five',
            formatBandCoverage(firstFive['exploit-mechanism']),
            formatBandCoverage(firstFive['authorization-bypass']),
          ],
        },
        {
          cells: [
            'Diversity-only five',
            formatBandCoverage(diverseFive['exploit-mechanism']),
            formatBandCoverage(diverseFive['authorization-bypass']),
          ],
        },
        {
          cells: [
            'Semantic-band-aware five',
            formatBandCoverage(semanticFive['exploit-mechanism']),
            formatBandCoverage(semanticFive['authorization-bypass']),
          ],
        },
      ],
    ),
    ...renderNumberedSection('Baseline', baselinePrompts),
    ...renderNumberedSection('First Five', firstFivePrompts),
    ...renderNumberedSection('Diversity-Only Five', diverseFivePrompts),
    '',
    '## Reading',
    '',
    'The baseline and first-five sets both miss stacked-query, schema-discovery, and authorization-bypass coverage. Diversity-only selection already reaches the full current SQL frontier because one retained urgent-audit prompt co-activates both authorization-bypass predicates; the semantic-band-aware selector ties on this pool rather than improving it.',
  ].join('\n');
}

async function loadUniqueSqlPrompts(inputPath: string): Promise<string[]> {
  const raw = await fs.readFile(inputPath, 'utf8');
  const parsed = yaml.load(raw) as RedteamFile;

  return [
    ...new Set(
      (parsed.tests ?? [])
        .filter((test) => test.metadata?.pluginId === 'sql-injection')
        .map((test) => test.vars?.prompt)
        .filter((prompt): prompt is string => typeof prompt === 'string' && prompt.length > 0),
    ),
  ];
}

function summarizePromptSet(prompts: readonly string[]): SqlSemanticBandSummary {
  return {
    bandCoverage: summarizeObservedPluginFeatureBandCoverage('sql-injection', prompts),
    promptCount: prompts.length,
    semanticFeatureCoverage: summarizeObservedPluginFeatureCoverage('sql-injection', prompts),
  };
}

function parseArgs(args: string[]): { format: 'json' | 'markdown'; inputPath?: string } {
  const formatIndex = args.indexOf('--format');
  const format = formatIndex === -1 ? 'json' : args[formatIndex + 1];
  const positionalArgs = args.filter(
    (arg, index) => arg !== '--format' && (formatIndex === -1 || index !== formatIndex + 1),
  );

  return {
    format: format === 'markdown' ? 'markdown' : 'json',
    inputPath: positionalArgs[0],
  };
}

async function main() {
  const { format, inputPath } = parseArgs(process.argv.slice(2));
  if (!inputPath) {
    throw new Error(
      'Usage: tsx scripts/redteam-research/compareSqlSemanticBands.ts <redteam.yaml> [--format json|markdown]',
    );
  }

  const baselinePrompts = await loadUniqueSqlPrompts(inputPath);
  const entities = extractEntities(await loadPurpose(inputPath));
  const curatedPortfolio = buildSqlAttackPortfolio(entities);
  const candidatePool = buildSqlCandidatePool(curatedPortfolio);
  const firstFivePortfolio = candidatePool.slice(0, 5);
  const diverseFivePortfolio = selectDiverseSqlPortfolio(candidatePool, 5);
  const semanticBandAwareFivePortfolio = selectSemanticBandAwareSqlPortfolio(candidatePool, 5);
  const report = {
    baselinePrompts,
    comparison: summarizeSqlSemanticBandComparison(
      baselinePrompts,
      curatedPortfolio.map((attack) => attack.prompt),
      firstFivePortfolio.map((attack) => attack.prompt),
      diverseFivePortfolio.map((attack) => attack.prompt),
      semanticBandAwareFivePortfolio.map((attack) => attack.prompt),
    ),
    diverseFivePrompts: diverseFivePortfolio.map((attack) => attack.prompt),
    firstFivePrompts: firstFivePortfolio.map((attack) => attack.prompt),
    semanticBandAwareFivePrompts: semanticBandAwareFivePortfolio.map((attack) => attack.prompt),
  };

  if (format === 'markdown') {
    console.log(renderSqlBeforeAfterMarkdown(report));
    return;
  }

  console.log(JSON.stringify(report.comparison, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
