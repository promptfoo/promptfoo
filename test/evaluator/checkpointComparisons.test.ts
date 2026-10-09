import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { evaluate } from '../../src/evaluator';
import { InMemoryEvaluationStore } from '../../src/evaluator/inMemoryStore';
import { runDbMigrations } from '../../src/migrate';
import Eval from '../../src/models/eval';
import { ResultFailureReason } from '../../src/types/index';
import { createDeferred, mockProcessEnv } from '../util/utils';

import type { InMemoryEvaluation } from '../../src/evaluator/inMemoryStore';
import type { EvaluateResult, ProviderResponse, TestSuite } from '../../src/types/index';

vi.mock('../../src/telemetry');

beforeAll(async () => {
  await runDbMigrations();
});
afterEach(() => {
  vi.restoreAllMocks();
});

it.each(
  (['persisted', 'in-memory'] as const).flatMap((mode) =>
    [0, 1].map((retainedColumn) => ({ mode, retainedColumn })),
  ),
)(
  'grades provider columns after $mode replacement with the assertion on column $retainedColumn',
  async ({ mode, retainedColumn }) => {
    const directory = await mkdtemp(path.join(tmpdir(), 'promptfoo-checkpoint-comparison-'));
    const restoreEnv = mockProcessEnv({ PROMPTFOO_DISABLE_TELEMETRY: 'true' });
    const previous = { resume: cliState.resume, retryMode: cliState.retryMode };
    cliState.resume = false;
    cliState.retryMode = false;
    const controller = new AbortController();
    const started = createDeferred<void>();
    const release = createDeferred<ProviderResponse>();
    let initial: Promise<unknown> | undefined;
    try {
      const hookPath = path.join(directory, 'assertions.mjs');
      await writeFile(
        hookPath,
        `let calls = 0;
export function beforeEach({ test }) {
  const visit = ++calls;
  return { test: { ...test, assert: (visit - 1) % 2 === ${retainedColumn} ? test.assert : [],
    metadata: { ...test.metadata, fixtureHookVisit: visit } } };
}
`,
      );
      let resuming = false;
      const first = {
        id: () => 'checkpoint-column-A',
        callApi: vi.fn(async (_prompt, _context, options) => {
          if (resuming) {
            return { output: 'Completed A', tokenUsage: { total: 5, numRequests: 1 } };
          }
          options?.onProgress?.({
            output: 'Checkpoint A',
            tokenUsage: { total: 11, numRequests: 1 },
          });
          started.resolve();
          return release.promise;
        }),
      };
      const second = {
        id: () => 'checkpoint-column-B',
        callApi: vi.fn(async () => ({
          output: 'Completed B',
          tokenUsage: { total: 7, numRequests: 1 },
        })),
      };
      const graderInputs: string[][] = [];
      const grader = {
        id: () => 'checkpoint-column-grader',
        callApi: vi.fn(async (input: string) => {
          graderInputs.push(JSON.parse(input));
          return { output: '0' };
        }),
      };
      const suite: TestSuite = {
        providers: [first, second],
        prompts: [{ raw: 'Synthetic comparison', label: 'Comparison' }],
        tests: [
          {
            options: { rubricPrompt: '{{ outputs | dump }}' },
            assert: [{ type: 'select-best', value: 'Choose the first output', provider: grader }],
          },
        ],
        extensions: [`file://${hookPath}:beforeEach`],
      };
      let record =
        mode === 'persisted'
          ? await Eval.create({}, suite.prompts, { id: randomUUID() })
          : undefined;
      const memory: InMemoryEvaluation = {
        id: randomUUID(),
        config: {},
        persisted: true,
        prompts: [],
        results: [],
        vars: [],
        resultPersistenceFailed: false,
        finalResults: [],
        failedResults: [],
      };
      const runtime = {
        createEvaluationStore: () => new InMemoryEvaluationStore(memory),
        createResultWriters: () => [],
      };
      const options = {
        cache: false,
        maxConcurrency: 2,
        timeoutMs: 0,
        maxEvalTimeMs: 0,
        showProgressBar: false,
      };
      const rows = async (): Promise<EvaluateResult[]> =>
        record
          ? (await record.fetchResultsByTestIdx(0)).map((row) => row.toEvaluateResult())
          : memory.results;
      initial = record
        ? evaluate(suite, record, { ...options, abortSignal: controller.signal })
        : evaluate(suite, memory, { ...options, abortSignal: controller.signal }, runtime);
      await started.promise;
      await vi.waitFor(async () => {
        expect((await rows()).find((row) => row.promptIdx === 1)?.success).toBe(true);
      });
      controller.abort(new Error('Interrupted before comparison'));
      await initial;
      release.resolve({ output: 'Late first attempt' });
      await new Promise<void>((resolve) => setImmediate(resolve));
      const before = await rows();
      const checkpoint = before.find((row) => row.promptIdx === 0)!;
      const sibling = before.find((row) => row.promptIdx === 1)!;
      expect(checkpoint).toMatchObject({
        failureReason: ResultFailureReason.ERROR,
        metadata: { fixtureHookVisit: 1, __promptfoo: { resumable: true } },
      });
      expect(
        checkpoint.testCase.assert?.some((assertion) => assertion.type === 'select-best'),
      ).toBe(retainedColumn === 0);
      expect(sibling.testCase.assert?.some((assertion) => assertion.type === 'select-best')).toBe(
        retainedColumn === 1,
      );
      expect(sibling.metadata?.fixtureHookVisit).toBe(2);
      expect(grader.callApi).not.toHaveBeenCalled();
      if (record) {
        record = (await Eval.findById(record.id))!;
      }
      resuming = true;
      cliState.resume = true;
      if (record) {
        await evaluate(suite, record, options);
      } else {
        await evaluate(suite, memory, options, runtime);
      }
      const after = await rows();
      expect(after).toHaveLength(2);
      expect(first.callApi).toHaveBeenCalledTimes(2);
      expect(second.callApi).toHaveBeenCalledOnce();
      expect(grader.callApi).toHaveBeenCalledOnce();
      expect(graderInputs).toEqual([['Completed A', 'Completed B']]);
      expect((record ?? memory).resultPersistenceFailed).toBe(false);
      if (record) {
        expect(after.map((row) => row.promptIdx)).toEqual([1, 0]);
        expect(after.find((row) => row.promptIdx === 0)!.id).not.toBe(checkpoint.id);
        expect(after.find((row) => row.promptIdx === 1)!.id).toBe(sibling.id);
      }
      for (const index of [0, 1]) {
        const row = after.find((item) => item.promptIdx === index)!;
        expect(row.provider.id).toBe(index === 0 ? first.id() : second.id());
        expect(row.prompt.raw).toBe('Synthetic comparison');
        expect(row.response?.output).toBe(index === 0 ? 'Completed A' : 'Completed B');
        expect(row.success).toBe(index === 0);
        expect(row.failureReason).toBe(
          index === 0 ? ResultFailureReason.NONE : ResultFailureReason.ASSERT,
        );
        expect(
          row.gradingResult?.componentResults?.find(
            (result) => result.assertion?.type === 'select-best',
          )?.pass,
        ).toBe(index === 0);
        expect((record ?? memory).prompts[index].metrics).toMatchObject({
          testPassCount: index === 0 ? 1 : 0,
          testFailCount: index === 0 ? 0 : 1,
          testErrorCount: 0,
          tokenUsage: { total: index === 0 ? 5 : 7, numRequests: 1 },
        });
      }
    } finally {
      controller.abort(new Error('Fixture cleanup'));
      release.resolve({ output: 'Fixture cleanup' });
      await initial?.catch(() => {});
      Object.assign(cliState, previous);
      restoreEnv();
      await rm(directory, { recursive: true, force: true });
    }
  },
);

const comparisonCases = (['persisted', 'in-memory'] as const).flatMap((mode) =>
  (['select-best', 'max-score'] as const).flatMap((handler) =>
    [0, 1].flatMap((firstToFinish) =>
      (['first', 'second', 'both', 'none'] as const).map((retained) => ({
        mode,
        handler,
        firstToFinish,
        retained,
      })),
    ),
  ),
);

it.each(comparisonCases)(
  '$handler keeps criteria and provider mapping with $mode, column $firstToFinish first, assertions on $retained',
  async ({ mode, handler, firstToFinish, retained }) => {
    const directory = await mkdtemp(path.join(tmpdir(), 'promptfoo-comparison-criteria-'));
    const restoreEnv = mockProcessEnv({ PROMPTFOO_DISABLE_TELEMETRY: 'true' });
    const previous = { resume: cliState.resume, retryMode: cliState.retryMode };
    cliState.resume = false;
    cliState.retryMode = false;
    const gates = [createDeferred<ProviderResponse>(), createDeferred<ProviderResponse>()];
    const entered = createDeferred<void>();
    let running: Promise<unknown> | undefined;
    try {
      const gradingLog = path.join(directory, 'grading.json');
      const graderPath = path.join(directory, 'grader.mjs');
      await writeFile(
        graderPath,
        `import fs from 'node:fs';
export default class Grader {
  constructor(options) { this.config = options.config; }
  id() { return 'file://' + new URL(import.meta.url).pathname; }
  async callApi(prompt, context) {
    fs.writeFileSync(this.config.log, JSON.stringify({
      owner: this.config.owner, prompt: JSON.parse(prompt), promptIdx: context.promptIdx,
      originalProvider: context.originalProvider.id(), vars: context.vars,
    }));
    return { output: '1' };
  }
}
`,
      );
      const hookPath = path.join(directory, 'criteria.mjs');
      await writeFile(
        hookPath,
        `let calls = 0;
export function beforeEach({ test }) {
  const column = calls++;
  const retained = ${JSON.stringify(retained)};
  const keep = retained === 'both' || (retained === 'first' && column === 0) || (retained === 'second' && column === 1);
  return { test: {
    ...test,
    vars: { ...test.vars, basis: 'saved-vars-' + column },
    options: { ...test.options, rubricPrompt: '{"outputs": {{ outputs | dump }}, "criteria": {{ criteria | dump }}, "basis": {{ basis | dump }}, "optionColumn": ' + column + '}' },
    assert: test.assert.flatMap(assertion => assertion.type !== ${JSON.stringify(handler)} ? [assertion] : keep ? [{
      ...assertion,
      value: ${JSON.stringify(handler)} === 'select-best' ? 'saved-criterion-' + column : { method: 'average' },
      metric: 'comparison-column-' + column,
      ...(${JSON.stringify(handler)} === 'select-best' ? { provider: { id: ${JSON.stringify('file://' + graderPath)}, config: { owner: column, log: ${JSON.stringify(gradingLog)} } } } : {}),
    }] : []),
  } };
}
`,
      );
      let calls = 0;
      const providers = [0, 1].map((index) => ({
        id: () => `criteria-column-${index}`,
        callApi: vi.fn(async () => {
          if (++calls === 2) {
            entered.resolve();
          }
          return gates[index].promise;
        }),
      }));
      const suite: TestSuite = {
        providers,
        prompts: [{ raw: 'Synthetic criteria comparison', label: 'Comparison' }],
        tests: [
          {
            assert: [
              {
                type: 'javascript',
                value: (output) => ({
                  pass: true,
                  score: output === 'Completed A' ? 0.2 : 0.8,
                  reason: 'Synthetic scoring control',
                }),
              },
              { type: handler },
            ],
          },
        ],
        extensions: [`file://${hookPath}:beforeEach`],
      };
      const record =
        mode === 'persisted'
          ? await Eval.create({}, suite.prompts, { id: randomUUID() })
          : undefined;
      const memory: InMemoryEvaluation = {
        id: randomUUID(),
        config: {},
        persisted: true,
        prompts: [],
        results: [],
        vars: [],
        resultPersistenceFailed: false,
        finalResults: [],
        failedResults: [],
      };
      const runtime = {
        createEvaluationStore: () => new InMemoryEvaluationStore(memory),
        createResultWriters: () => [],
      };
      const rows = async (): Promise<EvaluateResult[]> =>
        record
          ? (await record.fetchResultsByTestIdx(0)).map((row) => row.toEvaluateResult())
          : memory.results;
      const options = {
        cache: false,
        maxConcurrency: 2,
        timeoutMs: 0,
        maxEvalTimeMs: 0,
        showProgressBar: false,
      };
      running = record
        ? evaluate(suite, record, options)
        : evaluate(suite, memory, options, runtime);
      await entered.promise;
      const response = (index: number) => ({
        output: index === 0 ? 'Completed A' : 'Completed B',
        tokenUsage: { total: index === 0 ? 5 : 7, numRequests: 1 },
      });
      gates[firstToFinish].resolve(response(firstToFinish));
      await vi.waitFor(async () =>
        expect((await rows()).map((row) => row.promptIdx)).toEqual([firstToFinish]),
      );
      gates[1 - firstToFinish].resolve(response(1 - firstToFinish));
      await running;
      const results = await rows();
      const comparisonApplied = retained !== 'none';
      const sourceColumn = retained === 'second' ? 1 : 0;
      expect(results.map((row) => row.promptIdx).sort()).toEqual([0, 1]);
      for (const index of [0, 1]) {
        const row = results.find((result) => result.promptIdx === index)!;
        expect(row.provider.id).toBe(providers[index].id());
        expect(row.response?.output).toBe(response(index).output);
        expect(row.success).toBe(!comparisonApplied || index === 1);
        expect(row.failureReason).toBe(
          comparisonApplied && index === 0 ? ResultFailureReason.ASSERT : ResultFailureReason.NONE,
        );
        const comparison = row.gradingResult?.componentResults?.find(
          (result) => result.assertion?.type === handler,
        );
        if (comparisonApplied) {
          expect(comparison?.pass).toBe(index === 1);
          expect(comparison?.assertion?.metric).toBe(`comparison-column-${sourceColumn}`);
        } else {
          expect(comparison).toBeUndefined();
        }
        expect((record ?? memory).prompts[index].metrics).toMatchObject({
          testPassCount: !comparisonApplied || index === 1 ? 1 : 0,
          testFailCount: comparisonApplied && index === 0 ? 1 : 0,
          testErrorCount: 0,
          tokenUsage: { total: index === 0 ? 5 : 7, numRequests: 1 },
        });
      }
      if (handler === 'select-best' && comparisonApplied) {
        expect(JSON.parse(await readFile(gradingLog, 'utf8'))).toMatchObject({
          owner: sourceColumn,
          prompt: {
            outputs: ['Completed A', 'Completed B'],
            criteria: `saved-criterion-${sourceColumn}`,
            basis: `saved-vars-${sourceColumn}`,
            optionColumn: sourceColumn,
          },
          promptIdx: sourceColumn,
          originalProvider: providers[sourceColumn].id(),
          vars: { basis: `saved-vars-${sourceColumn}` },
        });
      } else {
        await expect(readFile(gradingLog, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
      }
    } finally {
      gates[0].resolve({ output: 'Fixture cleanup A' });
      gates[1].resolve({ output: 'Fixture cleanup B' });
      await running?.catch(() => {});
      Object.assign(cliState, previous);
      restoreEnv();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
