import fs from 'fs';
import os from 'os';
import path from 'path';

import { Command } from 'commander';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { compareCommand, compareResults, renderComparison } from '../../src/commands/compare';
import logger from '../../src/logger';
import { runDbMigrations } from '../../src/migrate';
import Eval from '../../src/models/eval';
import { ResultFailureReason } from '../../src/types/index';

import type { EvaluateResult } from '../../src/types/index';

vi.mock('../../src/logger');
vi.mock('../../src/telemetry', () => ({ default: { record: vi.fn() } }));

type Outcome = 'pass' | 'fail' | 'error';

function result(
  description: string | undefined,
  provider: string,
  outcome: Outcome,
  overrides: Partial<EvaluateResult> = {},
): EvaluateResult {
  return {
    promptIdx: 0,
    testIdx: 0,
    testCase: { description, vars: { input: description ?? 'none' } },
    promptId: 'prompt',
    provider: { id: `id-${provider}`, label: provider },
    prompt: { raw: 'Say {{input}}', label: 'Say {{input}}' },
    vars: { input: description ?? 'none' },
    error: outcome === 'error' ? 'boom' : null,
    failureReason:
      outcome === 'error'
        ? ResultFailureReason.ERROR
        : outcome === 'fail'
          ? ResultFailureReason.ASSERT
          : ResultFailureReason.NONE,
    success: outcome === 'pass',
    score: outcome === 'pass' ? 1 : 0,
    latencyMs: 100,
    namedScores: {},
    ...overrides,
  };
}

const side = (name: string, results: EvaluateResult[]) => ({ name, results });

describe('compareResults', () => {
  it('scores only rows graded on both evals', () => {
    const comparison = compareResults(
      side('a', [result('t1', 'p', 'pass'), result('t2', 'p', 'error'), result('t3', 'p', 'pass')]),
      side('b', [result('t1', 'p', 'pass'), result('t2', 'p', 'pass'), result('t3', 'p', 'error')]),
    );

    expect(comparison.gradedOnBoth).toBe(1);
    expect(comparison.a).toMatchObject({ pass: 1, passRate: 1, errors: 1, rows: 3 });
    expect(comparison.b).toMatchObject({ pass: 1, passRate: 1, errors: 1, rows: 3 });
    expect(comparison.changes).toEqual([]);
  });

  it('lists regressions and improvements per provider', () => {
    const comparison = compareResults(
      side('a', [result('t1', 'gpt', 'pass'), result('t1', 'claude', 'fail')]),
      side('b', [result('t1', 'gpt', 'fail'), result('t1', 'claude', 'pass')]),
    );

    expect(comparison.changes).toEqual([
      { test: 't1', provider: 'gpt', promptIdx: 0, a: 'pass', b: 'fail' },
      { test: 't1', provider: 'claude', promptIdx: 0, a: 'fail', b: 'pass' },
    ]);
    expect(comparison.a.byProvider).toEqual({
      gpt: { graded: 1, pass: 1 },
      claude: { graded: 1, pass: 0 },
    });
    expect(comparison.b.byProvider).toEqual({
      gpt: { graded: 1, pass: 0 },
      claude: { graded: 1, pass: 1 },
    });
  });

  it('matches by test and provider rather than position', () => {
    const comparison = compareResults(
      side('a', [
        result('t1', 'p', 'pass', { testIdx: 0 }),
        result('t2', 'p', 'fail', { testIdx: 1 }),
      ]),
      side('b', [
        result('t2', 'p', 'fail', { testIdx: 0 }),
        result('t1', 'p', 'pass', { testIdx: 1 }),
        result('t3', 'p', 'pass', { testIdx: 2 }),
      ]),
    );

    expect(comparison.gradedOnBoth).toBe(2);
    expect(comparison.changes).toEqual([]);
    expect(comparison.a.unmatched).toBe(0);
    expect(comparison.b.unmatched).toBe(1);
  });

  it('keys tests without a description by their vars', () => {
    const comparison = compareResults(
      side('a', [result(undefined, 'p', 'pass', { vars: { q: 1 } })]),
      side('b', [result(undefined, 'p', 'fail', { vars: { q: 1 } })]),
    );

    expect(comparison.changes).toEqual([
      { test: '{"q":1}', provider: 'p', promptIdx: 0, a: 'pass', b: 'fail' },
    ]);
  });

  it('pairs repeated rows of the same test in test order', () => {
    const comparison = compareResults(
      side('a', [
        result('t1', 'p', 'fail', { testIdx: 1 }),
        result('t1', 'p', 'pass', { testIdx: 0 }),
      ]),
      side('b', [
        result('t1', 'p', 'pass', { testIdx: 0 }),
        result('t1', 'p', 'pass', { testIdx: 1 }),
      ]),
    );

    expect(comparison.gradedOnBoth).toBe(2);
    expect(comparison.changes).toEqual([
      { test: 't1', provider: 'p', promptIdx: 0, a: 'fail', b: 'pass' },
    ]);
  });

  it('reports mean score and median latency over rows graded on both', () => {
    const comparison = compareResults(
      side('a', [
        result('t1', 'p', 'pass', { latencyMs: 100 }),
        result('t2', 'p', 'pass', { latencyMs: 300 }),
        result('t3', 'p', 'fail', { latencyMs: 9000, score: 0.5 }),
        result('t4', 'p', 'pass', { latencyMs: 50000 }),
      ]),
      side('b', [
        result('t1', 'p', 'pass'),
        result('t2', 'p', 'pass'),
        result('t3', 'p', 'pass'),
        result('t4', 'p', 'error'),
      ]),
    );

    expect(comparison.a.medianLatencyMs).toBe(300);
    expect(comparison.a.meanScore).toBeCloseTo(2.5 / 3);
    expect(comparison.a.passRate).toBeCloseTo(2 / 3);
  });

  it('renders the summary and changed rows as text', () => {
    const text = renderComparison(
      compareResults(
        side('evalA', [result('t1', 'p', 'pass')]),
        side('evalB', [result('t1', 'p', 'fail')]),
      ),
    );

    expect(text).toContain('1 rows graded on both evals.');
    expect(text).toContain('100.0% (1/1)');
    expect(text).toContain('0.0% (0/1)');
    expect(text).toMatch(/pass → fail.*p {2}t1/);
  });
});

describe('compareResults row identity', () => {
  it('falls back to the provider ID, then to "unknown"', () => {
    const comparison = compareResults(
      side('a', [
        result('t1', 'x', 'pass', { provider: { id: 'openai:gpt' } }),
        result('t2', 'x', 'pass', { provider: undefined as any }),
      ]),
      side('b', [
        result('t1', 'x', 'fail', { provider: { id: 'openai:gpt' } }),
        result('t2', 'x', 'fail', { provider: undefined as any }),
      ]),
    );

    expect(comparison.changes.map((change) => change.provider)).toEqual(['openai:gpt', 'unknown']);
  });

  it('uses the row description when the test case has none', () => {
    const comparison = compareResults(
      side('a', [result(undefined, 'p', 'pass', { description: 'from row' })]),
      side('b', [result(undefined, 'p', 'fail', { description: 'from row' })]),
    );

    expect(comparison.changes[0].test).toBe('from row');
  });

  it('ignores latencies that are not finite numbers', () => {
    const comparison = compareResults(
      side('a', [
        result('t1', 'p', 'pass', { latencyMs: Number.NaN }),
        result('t2', 'p', 'pass', { latencyMs: 40 }),
      ]),
      side('b', [result('t1', 'p', 'pass'), result('t2', 'p', 'pass')]),
    );

    expect(comparison.a.medianLatencyMs).toBe(40);
  });
});

describe('renderComparison edge cases', () => {
  it('shows placeholders when no row is graded on both evals', () => {
    const comparison = compareResults(
      side('a', [result('t1', 'p', 'error')]),
      side('b', [result('t1', 'p', 'pass')]),
    );

    expect(comparison).toMatchObject({
      gradedOnBoth: 0,
      a: { passRate: null, meanScore: null, medianLatencyMs: null, errors: 1 },
    });
    const text = renderComparison(comparison);
    expect(text).toContain('0 rows graded on both evals.');
    expect(text).toContain('0 changed outcomes (A → B):');
  });

  it('names the prompt when the evals have several', () => {
    const text = renderComparison(
      compareResults(
        side('a', [result('t1', 'p', 'pass'), result('t1', 'p', 'pass', { promptIdx: 1 })]),
        side('b', [result('t1', 'p', 'fail'), result('t1', 'p', 'fail', { promptIdx: 1 })]),
      ),
    );

    expect(text).toMatch(/pass → fail.*p prompt 0 {2}t1/);
    expect(text).toMatch(/pass → fail.*p prompt 1 {2}t1/);
  });
});

describe('compare command', () => {
  let tempDir: string;

  beforeAll(async () => {
    await runDbMigrations();
  });

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-compare-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    process.exitCode = undefined;
    vi.resetAllMocks();
  });

  async function run(...args: string[]) {
    const program = new Command();
    compareCommand(program);
    await program.parseAsync(['node', 'promptfoo', 'compare', ...args]);
  }

  function writeResultsFile(name: string, results: EvaluateResult[]): string {
    const file = path.join(tempDir, name);
    fs.writeFileSync(file, JSON.stringify({ evalId: null, results: { version: 3, results } }));
    return file;
  }

  async function createEval(results: EvaluateResult[]): Promise<string> {
    const eval_ = await Eval.create({ providers: [{ id: 'p' }], tests: [] }, [
      { raw: 'Say {{input}}', label: 'Say {{input}}' },
    ]);
    for (const row of results) {
      await eval_.addResult(row);
    }
    return eval_.id;
  }

  it('prints JSON for two results files', async () => {
    const a = writeResultsFile('a.json', [result('t1', 'p', 'pass')]);
    const b = writeResultsFile('b.json', [result('t1', 'p', 'fail')]);

    await run(a, b, '--json');

    const output = JSON.parse(vi.mocked(logger.info).mock.calls[0][0] as string);
    expect(output.gradedOnBoth).toBe(1);
    expect(output.changes).toEqual([
      { test: 't1', provider: 'p', promptIdx: 0, a: 'pass', b: 'fail' },
    ]);
    expect(process.exitCode).toBeUndefined();
  });

  it('compares stored evals by ID', async () => {
    const idA = await createEval([
      result('t1', 'p', 'pass'),
      result('t2', 'p', 'error', { testIdx: 1 }),
    ]);
    const idB = await createEval([
      result('t1', 'p', 'fail'),
      result('t2', 'p', 'pass', { testIdx: 1 }),
    ]);

    await run(idA, idB, '--json');

    const output = JSON.parse(vi.mocked(logger.info).mock.calls[0][0] as string);
    expect(output.gradedOnBoth).toBe(1);
    expect(output.a).toMatchObject({ name: idA, errors: 1 });
    expect(output.changes).toEqual([
      { test: 't1', provider: 'p', promptIdx: 0, a: 'pass', b: 'fail' },
    ]);
  });

  it('fails when an eval does not exist', async () => {
    const a = writeResultsFile('a.json', [result('t1', 'p', 'pass')]);

    await run(a, 'eval-missing');

    expect(logger.error).toHaveBeenCalledWith(
      'Failed to compare evals: No eval found with ID eval-missing',
    );
    expect(process.exitCode).toBe(1);
  });
});
