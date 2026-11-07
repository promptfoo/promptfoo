import chalk from 'chalk';
import logger from '../logger';
import Eval from '../models/eval';
import { wrapTable } from '../table';
import telemetry from '../telemetry';
import { ResultFailureReason } from '../types/index';
import { filterRuntimeVars } from '../util/comparison';
import { readOutput } from '../util/file';
import type { Command } from 'commander';

import type { EvaluateResult } from '../types/index';

type Outcome = 'pass' | 'fail' | 'error';

interface Row {
  test: string;
  provider: string;
  promptIdx: number;
  outcome: Outcome;
  score: number;
  latencyMs: number | undefined;
}

export interface CompareSide {
  name: string;
  /** Rows in this eval. */
  rows: number;
  /** Rows that ended in an error and so were never graded. */
  errors: number;
  /** Rows with no counterpart in the other eval. */
  unmatched: number;
  /** The rest are over rows graded on both sides. */
  pass: number;
  passRate: number | null;
  meanScore: number | null;
  medianLatencyMs: number | null;
  byProvider: Record<string, { graded: number; pass: number }>;
}

export interface EvalComparison {
  gradedOnBoth: number;
  a: CompareSide;
  b: CompareSide;
  /** Rows graded on both sides that passed on one and failed on the other. */
  changes: Array<{ test: string; provider: string; promptIdx: number; a: Outcome; b: Outcome }>;
}

function outcomeOf(result: EvaluateResult): Outcome {
  if (result.failureReason === ResultFailureReason.ERROR) {
    return 'error';
  }
  return result.success ? 'pass' : 'fail';
}

function testNameOf(result: EvaluateResult): string {
  return (
    result.testCase?.description ||
    result.description ||
    JSON.stringify(filterRuntimeVars(result.vars) ?? {})
  );
}

/**
 * Keys each result by (test, prompt index, provider). Tests are named by description, or by
 * their vars when they have none. A key seen more than once (repeats, duplicate descriptions)
 * is paired in test order.
 */
function rowsByKey(results: EvaluateResult[]): Map<string, Row> {
  const sorted = [...results].sort((x, y) => x.testIdx - y.testIdx || x.promptIdx - y.promptIdx);
  const rows = new Map<string, Row>();
  for (const result of sorted) {
    const row: Row = {
      test: testNameOf(result),
      provider: result.provider?.label || result.provider?.id || 'unknown',
      promptIdx: result.promptIdx,
      outcome: outcomeOf(result),
      score: result.score,
      latencyMs: Number.isFinite(result.latencyMs) ? result.latencyMs : undefined,
    };
    const base = JSON.stringify([row.test, row.promptIdx, row.provider]);
    let occurrence = 0;
    while (rows.has(`${base}#${occurrence}`)) {
      occurrence++;
    }
    rows.set(`${base}#${occurrence}`, row);
  }
  return rows;
}

function median(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((x, y) => x - y);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function summarize(
  name: string,
  rows: Map<string, Row>,
  other: Map<string, Row>,
  both: string[],
): CompareSide {
  const graded = both.map((key) => rows.get(key)!);
  const byProvider: CompareSide['byProvider'] = {};
  for (const row of graded) {
    byProvider[row.provider] ??= { graded: 0, pass: 0 };
    byProvider[row.provider].graded++;
    if (row.outcome === 'pass') {
      byProvider[row.provider].pass++;
    }
  }
  const pass = graded.filter((row) => row.outcome === 'pass').length;
  return {
    name,
    rows: rows.size,
    errors: [...rows.values()].filter((row) => row.outcome === 'error').length,
    unmatched: [...rows.keys()].filter((key) => !other.has(key)).length,
    pass,
    passRate: graded.length === 0 ? null : pass / graded.length,
    meanScore:
      graded.length === 0 ? null : graded.reduce((sum, row) => sum + row.score, 0) / graded.length,
    medianLatencyMs: median(graded.flatMap((row) => row.latencyMs ?? [])),
    byProvider,
  };
}

/**
 * Compares two evals row by row. Only rows graded on both sides are scored, so an eval with
 * more errors is not measured on an easier subset.
 */
export function compareResults(
  a: { name: string; results: EvaluateResult[] },
  b: { name: string; results: EvaluateResult[] },
): EvalComparison {
  const rowsA = rowsByKey(a.results);
  const rowsB = rowsByKey(b.results);
  const isGraded = (rows: Map<string, Row>, key: string) => {
    const outcome = rows.get(key)?.outcome;
    return outcome !== undefined && outcome !== 'error';
  };
  const both = [...rowsA.keys()].filter((key) => isGraded(rowsA, key) && isGraded(rowsB, key));
  const changes = both.flatMap((key) => {
    const rowA = rowsA.get(key)!;
    const rowB = rowsB.get(key)!;
    if (rowA.outcome === rowB.outcome) {
      return [];
    }
    const { test, provider, promptIdx } = rowA;
    return [{ test, provider, promptIdx, a: rowA.outcome, b: rowB.outcome }];
  });
  return {
    gradedOnBoth: both.length,
    a: summarize(a.name, rowsA, rowsB, both),
    b: summarize(b.name, rowsB, rowsA, both),
    changes,
  };
}

function formatRate(pass: number, graded: number): string {
  return graded === 0 ? '-' : `${((100 * pass) / graded).toFixed(1)}% (${pass}/${graded})`;
}

export function renderComparison(comparison: EvalComparison): string {
  const { a, b, changes } = comparison;
  const line = (measure: string, valueA: string, valueB: string) => ({
    Measure: measure,
    [`A: ${a.name}`]: valueA,
    [`B: ${b.name}`]: valueB,
  });
  const latency = (ms: number | null) => (ms === null ? '-' : `${Math.round(ms)} ms`);
  const table = [
    line(
      'pass rate',
      formatRate(a.pass, comparison.gradedOnBoth),
      formatRate(b.pass, comparison.gradedOnBoth),
    ),
    line('mean score', a.meanScore?.toFixed(3) ?? '-', b.meanScore?.toFixed(3) ?? '-'),
    line('median latency', latency(a.medianLatencyMs), latency(b.medianLatencyMs)),
  ];
  // Both sides count the same rows, so they list the same providers.
  for (const provider of Object.keys(a.byProvider).sort()) {
    const sideA = a.byProvider[provider];
    const sideB = b.byProvider[provider];
    table.push(
      line(
        `  ${provider}`,
        formatRate(sideA.pass, sideA.graded),
        formatRate(sideB.pass, sideB.graded),
      ),
    );
  }
  table.push(
    line('errors (excluded)', String(a.errors), String(b.errors)),
    line('unmatched (excluded)', String(a.unmatched), String(b.unmatched)),
  );

  const multiplePrompts = changes.some((change) => change.promptIdx > 0);
  const lines = [
    `${comparison.gradedOnBoth} rows graded on both evals.`,
    wrapTable(table) as string,
    '',
    `${changes.length} changed outcome${changes.length === 1 ? '' : 's'} (A → B):`,
    ...changes.map((change) => {
      const arrow =
        change.b === 'pass' ? chalk.green(`${change.a} → pass`) : chalk.red(`pass → ${change.b}`);
      const prompt = multiplePrompts ? ` prompt ${change.promptIdx}` : '';
      return `  ${arrow}  ${change.provider}${prompt}  ${change.test}`;
    }),
  ];
  return lines.join('\n');
}

async function loadResults(ref: string): Promise<EvaluateResult[]> {
  if (ref.endsWith('.json')) {
    return readOutput(ref).results.results;
  }
  const eval_ = ref === 'latest' ? await Eval.latest() : await Eval.findById(ref);
  if (!eval_) {
    throw new Error(`No eval found with ID ${ref}`);
  }
  return (await eval_.toEvaluateSummary()).results;
}

export function compareCommand(program: Command) {
  program
    .command('compare <evalA> <evalB>')
    .description(
      'Compare two evals row by row. Each argument is an eval ID, "latest", or a JSON results file',
    )
    .option('--json', 'Output the comparison as JSON')
    .action(async (evalA: string, evalB: string, cmdObj: { json?: boolean }) => {
      telemetry.record('command_used', { name: 'compare' });
      let comparison: EvalComparison;
      try {
        const [resultsA, resultsB] = await Promise.all([loadResults(evalA), loadResults(evalB)]);
        comparison = compareResults(
          { name: evalA, results: resultsA },
          { name: evalB, results: resultsB },
        );
      } catch (error) {
        logger.error(`Failed to compare evals: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
        return;
      }
      logger.info(cmdObj.json ? JSON.stringify(comparison, null, 2) : renderComparison(comparison));
    });
}
