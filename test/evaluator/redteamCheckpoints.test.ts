import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetBlobStorageProvider, setBlobStorageProvider } from '../../src/blobs';
import { FilesystemBlobStorageProvider } from '../../src/blobs/filesystemProvider';
import cliState from '../../src/cliState';
import { evaluate } from '../../src/evaluator';
import logger from '../../src/logger';
import { runDbMigrations } from '../../src/migrate';
import Eval from '../../src/models/eval';
import EvalResult from '../../src/models/evalResult';
import { PromptfooChatCompletionProvider } from '../../src/providers/promptfoo';
import { getGraderById } from '../../src/redteam/graders';
import { HydraProvider } from '../../src/redteam/providers/hydra';
import MetaProvider from '../../src/redteam/providers/iterativeMeta';
import { redteamProviderManager } from '../../src/redteam/providers/shared';
import * as remoteGeneration from '../../src/redteam/remoteGeneration';
import { ResultFailureReason } from '../../src/types/index';
import { writeOutput } from '../../src/util/output';
import { createDeferred, mockProcessEnv } from '../util/utils';

import type { ApiProvider, ProviderResponse, TestSuite } from '../../src/types/index';

vi.mock('../../src/telemetry');

const strategies = ['hydra', 'meta'] as const;
type Strategy = (typeof strategies)[number];
const assertion = { type: 'promptfoo:redteam:pii' } as const;
const passedGrade = {
  grade: {
    pass: true,
    score: 1,
    reason: 'Target defended',
    tokensUsed: { total: 2, numRequests: 1 },
  },
  rubric: 'Local checkpoint fixture',
};
const options = {
  cache: false,
  maxConcurrency: 1,
  showProgressBar: false,
  timeoutMs: 0,
  maxEvalTimeMs: 0,
};
let directory: string;
let restoreEnv: () => void;
let previousCliState: { resume: boolean | undefined; retryMode: boolean | undefined };
let controllers: AbortController[];
let releases: (() => void)[];
let running: Promise<unknown>[];

beforeAll(async () => {
  await runDbMigrations();
});
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-strategy-checkpoints-'));
  restoreEnv = mockProcessEnv({
    PROMPTFOO_DISABLE_TELEMETRY: 'true',
    PROMPTFOO_DISABLE_SHARING: 'true',
    PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER: 'false',
  });
  previousCliState = { resume: cliState.resume, retryMode: cliState.retryMode };
  cliState.resume = false;
  cliState.retryMode = false;
  controllers = [];
  releases = [];
  running = [];
  vi.spyOn(remoteGeneration, 'shouldGenerateRemote').mockReturnValue(true);
  vi.spyOn(remoteGeneration, 'neverGenerateRemote').mockReturnValue(false);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new Error('Unexpected fixture network request');
    }),
  );
});
afterEach(async () => {
  for (const controller of controllers) {
    controller.abort(new Error('Fixture cleanup'));
  }
  for (const release of releases) {
    release();
  }
  await Promise.allSettled(running);
  vi.useRealTimers();
  resetBlobStorageProvider();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Object.assign(cliState, previousCliState);
  restoreEnv();
  fs.rmSync(directory, { recursive: true, force: true });
});

function fixture(strategy: Strategy, responses: ProviderResponse[], maxBacktracks = 0) {
  let targetIndex = 0;
  const target: ApiProvider = {
    id: () => 'local-checkpoint-target',
    callApi: vi.fn(async () => structuredClone(responses[targetIndex++])),
  };
  const agent: ApiProvider = {
    id: () => 'local-checkpoint-agent',
    callApi: vi.fn(async () => ({
      output: { result: `Synthetic probe ${targetIndex + 1}` },
      tokenUsage: { total: 3, numRequests: 1 },
      cost: 8,
      incurredCost: 7,
    })),
  };
  vi.spyOn(PromptfooChatCompletionProvider.prototype, 'callApi').mockImplementation(agent.callApi);
  vi.spyOn(redteamProviderManager, 'getProvider').mockResolvedValue(agent);
  vi.spyOn(redteamProviderManager, 'getGradingProvider').mockResolvedValue(agent);
  const grader = vi
    .spyOn(getGraderById(assertion.type)!, 'getResult')
    .mockResolvedValue(passedGrade);
  const provider: ApiProvider =
    strategy === 'hydra'
      ? new HydraProvider({ injectVar: 'query', maxTurns: responses.length, maxBacktracks })
      : new MetaProvider({ injectVar: 'query', numIterations: responses.length });
  const suite: TestSuite = {
    providers: [target],
    prompts: [{ raw: '{{query}}', label: 'checkpoint fixture' }],
    tests: [
      {
        provider,
        vars: { query: 'Synthetic objective' },
        metadata: {
          pluginId: 'pii',
          strategyId: strategy === 'hydra' ? 'hydra' : 'jailbreak:meta',
        },
        assert: [assertion],
      },
    ],
  };
  return { target, agent, grader, provider, suite };
}

function controller() {
  const value = new AbortController();
  controllers.push(value);
  return value;
}

function holdGrade() {
  const gate = createDeferred<typeof passedGrade>();
  const entered = createDeferred<void>();
  releases.push(() => gate.resolve(passedGrade));
  return {
    gate,
    entered,
    call: () => {
      entered.resolve();
      return gate.promise;
    },
  };
}

describe('real strategy checkpoint identity', () => {
  it.each(strategies)(
    '%s does not attach the prior verdict to a newer ungraded target',
    async (strategy) => {
      const f = fixture(strategy, [
        { output: 'First completed output', tokenUsage: { total: 11, numRequests: 1 } },
        { output: 'Second completed output', tokenUsage: { total: 13, numRequests: 1 } },
      ]);
      const held = holdGrade();
      f.grader.mockResolvedValueOnce(passedGrade).mockImplementationOnce(held.call);
      const caller = controller();
      const record = await Eval.create({}, f.suite.prompts, { id: randomUUID() });
      const evaluation = evaluate(f.suite, record, { ...options, abortSignal: caller.signal });
      running.push(evaluation);
      await held.entered.promise;
      caller.abort(new Error('Cancelled while grading the newer target'));
      await evaluation;
      const [row] = await record.fetchResultsByTestIdx(0);
      expect(row).toMatchObject({
        failureReason: ResultFailureReason.ERROR,
        score: 0,
        response: { output: 'Second completed output' },
      });
      expect(row.response?.metadata?.redteamHistory).toMatchObject([
        { output: 'First completed output', graderPassed: true },
        { output: 'Second completed output' },
      ]);
      expect(row.response?.metadata?.redteamHistory[1].graderPassed).toBeUndefined();
      expect(row.response?.metadata?.storedGraderResult).toBeUndefined();
      const beforeLate = row.toEvaluateResult();
      held.gate.resolve(passedGrade);
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect((await record.fetchResultsByTestIdx(0))[0].toEvaluateResult()).toEqual(beforeLate);
    },
  );
});

const mixedResponses: ProviderResponse[] = [
  {
    output: 'First response',
    cost: 0.2,
    incurredCost: 0.07,
    tokenUsage: { total: 11, numRequests: 1 },
  },
  { output: 'Cached response', cost: 0.3, cached: true, tokenUsage: { total: 13, numRequests: 1 } },
  { output: 'Final response', cost: 0.4, tokenUsage: { total: 17, numRequests: 1 } },
];
const costCases = [
  { name: 'caller', mode: 'caller', responses: mixedResponses, cost: 0.9, incurred: 0.47 },
  {
    name: 'per-case timeout',
    mode: 'timeout',
    responses: mixedResponses,
    cost: 0.9,
    incurred: 0.47,
  },
  { name: 'global timeout', mode: 'global', responses: mixedResponses, cost: 0.9, incurred: 0.47 },
  { name: 'CLI pause', mode: 'pause', responses: mixedResponses, cost: 0.9, incurred: 0.47 },
  {
    name: 'pacing callbacks',
    mode: 'pacing',
    responses: mixedResponses,
    cost: 0.9,
    incurred: 0.47,
  },
  {
    name: 'normal return limit',
    mode: 'normal',
    responses: mixedResponses,
    cost: undefined,
    incurred: undefined,
  },
  {
    name: 'cached caller',
    mode: 'caller',
    responses: [
      { output: 'Cached only', cached: true, cost: 0.5, tokenUsage: { total: 11, numRequests: 1 } },
    ],
    cost: 0.5,
    incurred: 0,
  },
  {
    name: 'cached CLI pause',
    mode: 'pause',
    responses: [
      { output: 'Cached only', cached: true, cost: 0.5, tokenUsage: { total: 11, numRequests: 1 } },
    ],
    cost: 0.5,
    incurred: 0,
  },
  {
    name: 'explicit incurred zero',
    mode: 'caller',
    responses: [
      {
        output: 'Zero actual cost',
        cost: 0.5,
        incurredCost: 0,
        tokenUsage: { total: 11, numRequests: 1 },
      },
    ],
    cost: 0.5,
    incurred: 0,
  },
  {
    name: 'incurred only',
    mode: 'caller',
    responses: [
      { output: 'Actual cost only', incurredCost: 0.2, tokenUsage: { total: 11, numRequests: 1 } },
    ],
    cost: undefined,
    incurred: 0.2,
  },
  {
    name: 'unknown costs',
    mode: 'caller',
    responses: [{ output: 'Unknown cost', tokenUsage: { total: 11, numRequests: 1 } }],
    cost: undefined,
    incurred: undefined,
  },
];

for (const strategy of strategies) {
  describe(`${strategy} completed target costs`, () => {
    it.each(costCases)('$name', async ({ mode, responses, cost, incurred }) => {
      const f = fixture(strategy, responses);
      const held = holdGrade();
      f.grader.mockImplementation(async (_prompt, output) => {
        // Grader and attacker calls have their own prices; neither belongs in target totals.
        await f.agent.callApi('Local grading request');
        return mode !== 'normal' && output === responses.at(-1)!.output ? held.call() : passedGrade;
      });
      if (mode === 'pacing') {
        f.target.delay = 10;
      }
      const caller = controller();
      const pause = controller();
      const streamPath = path.join(directory, 'stream.jsonl');
      const record = await Eval.create({ outputPath: streamPath }, f.suite.prompts, {
        id: randomUUID(),
      });
      vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
      const evaluation = evaluate(f.suite, record, {
        ...options,
        abortSignal: caller.signal,
        pauseSignal: pause.signal,
        timeoutMs: mode === 'timeout' ? 1000 : 0,
        maxEvalTimeMs: mode === 'global' ? 1000 : 0,
      });
      running.push(evaluation);
      if (mode !== 'normal') {
        if (mode === 'pacing') {
          await vi.waitFor(() => expect(f.grader).toHaveBeenCalledTimes(responses.length), {
            interval: 10,
          });
        } else {
          await held.entered.promise;
        }
        if (mode === 'timeout' || mode === 'global') {
          await vi.advanceTimersByTimeAsync(1000);
        } else if (mode === 'pause') {
          pause.abort(new Error('CLI pause during target grading'));
        } else {
          caller.abort(new Error('Caller cancelled target grading'));
        }
      }
      await evaluation;
      const fresh = (await Eval.findById(record.id))!;
      const [row] = await fresh.fetchResultsByTestIdx(0);
      expect(row).toMatchObject({
        success: mode === 'normal',
        score: mode === 'normal' ? 1 : 0,
        failureReason: mode === 'normal' ? ResultFailureReason.NONE : ResultFailureReason.ERROR,
        response: { output: responses.at(-1)!.output },
      });
      expect(f.target.callApi).toHaveBeenCalledTimes(responses.length);
      const metrics = fresh.prompts[0].metrics!;
      expect(metrics.tokenUsage.total).toBe(
        responses.reduce((sum, response) => sum + response.tokenUsage!.total!, 0),
      );
      if (cost === undefined) {
        expect(row.response?.cost).toBeUndefined();
        // EvalResult normalizes its top-level absent cost to zero.
        expect(row.cost).toBe(0);
        expect(metrics.cost).toBe(0);
      } else {
        expect(row.response?.cost).toBeCloseTo(cost);
        expect(row.cost).toBeCloseTo(cost);
        expect(metrics.cost).toBeCloseTo(cost);
      }
      if (incurred === undefined) {
        expect(row.response?.incurredCost).toBeUndefined();
        expect(metrics.incurredCost).toBeUndefined();
      } else {
        expect(row.response?.incurredCost).toBeCloseTo(incurred);
        expect(metrics.incurredCost).toBeCloseTo(incurred);
      }
      const jsonPath = path.join(directory, 'results.json');
      const jsonlPath = path.join(directory, 'results.jsonl');
      await writeOutput(jsonPath, fresh, null);
      await writeOutput(jsonlPath, fresh, null);
      const exported = JSON.parse(fs.readFileSync(jsonPath, 'utf8')).results.results;
      const jsonl = fs
        .readFileSync(jsonlPath, 'utf8')
        .trim()
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line));
      const streamed = (fs.existsSync(streamPath) ? fs.readFileSync(streamPath, 'utf8') : '')
        .trim()
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line));
      expect(exported).toHaveLength(1);
      expect(jsonl).toHaveLength(1);
      expect(streamed).toHaveLength(mode === 'timeout' ? 0 : 1);
      for (const result of [...exported, ...jsonl, ...streamed]) {
        expect(result.cost ?? 0).toBeCloseTo(cost ?? 0);
        if (incurred === undefined) {
          expect(result.incurredCost).toBeUndefined();
        } else {
          expect(result.incurredCost).toBeCloseTo(incurred);
        }
      }
      // Late grading cannot change the captured totals or attach a new verdict.
      const beforeLate = row.toEvaluateResult();
      held.gate.resolve(passedGrade);
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect((await fresh.fetchResultsByTestIdx(0))[0].toEvaluateResult()).toEqual(beforeLate);
      if (mode === 'pause') {
        expect(await EvalResult.getCompletedIndexPairs(record.id)).toEqual(new Set(['0:0']));
        cliState.resume = true;
        await evaluate(f.suite, (await Eval.findById(record.id))!, options);
        expect(f.target.callApi).toHaveBeenCalledTimes(responses.length);
        expect(
          (await (await Eval.findById(record.id))!.fetchResultsByTestIdx(0))[0].toEvaluateResult(),
        ).toEqual(beforeLate);
      }
    });
  });
}

it.each(['caller', 'deadline', 'pause'] as const)(
  'retains Meta completed verdict and matching state across post-provider trace %s',
  async (mode) => {
    const f = fixture('meta', [
      {
        output: 'Completed conclusive output',
        cost: 0.4,
        incurredCost: 0.2,
        tokenUsage: { total: 11, numRequests: 1 },
      },
    ]);
    const conclusiveGrade = {
      grade: {
        pass: false,
        score: 0,
        reason: 'Completed conclusive verdict',
        tokensUsed: { total: 7, numRequests: 1 },
      },
      rubric: 'Local checkpoint fixture',
    };
    f.grader.mockResolvedValue(conclusiveGrade);
    const traceEntered = createDeferred<void>();
    const debug = logger.debug.bind(logger);
    vi.spyOn(logger, 'debug').mockImplementation((...args) => {
      if (String(args[0]).includes('Waiting 3000ms for spans to arrive at external backend')) {
        traceEntered.resolve();
      }
      return debug(...args);
    });
    // The real external-trace delay happens after the strategy returned its completed response.
    f.suite.tracing = {
      enabled: true,
      provider: { id: 'tempo', endpoint: 'http://127.0.0.1:9' },
      queryDelay: 3000,
    };
    const caller = controller();
    const record = await Eval.create({}, f.suite.prompts, { id: randomUUID() });
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    const evaluation = evaluate(f.suite, record, {
      ...options,
      ...(mode === 'pause' ? { pauseSignal: caller.signal } : { abortSignal: caller.signal }),
      timeoutMs: mode === 'deadline' ? 1000 : 0,
    });
    running.push(evaluation);
    await traceEntered.promise;
    if (mode === 'deadline') {
      await vi.advanceTimersByTimeAsync(1000);
    } else {
      caller.abort(new Error('Interrupted post-provider trace collection'));
    }
    await evaluation;
    const [row] = await record.fetchResultsByTestIdx(0);
    expect(row).toMatchObject({
      success: false,
      score: 0,
      failureReason: mode === 'pause' ? ResultFailureReason.ASSERT : ResultFailureReason.ERROR,
      response: {
        output: 'Completed conclusive output',
        metadata: {
          storedGraderResult: { pass: false, reason: 'Completed conclusive verdict' },
          finalIteration: 1,
          vulnerabilityAchieved: true,
          stopReason: 'Grader failed',
          redteamHistory: [{ output: 'Completed conclusive output', graderPassed: false }],
        },
      },
    });
    expect(row.response?.metadata?.redteamFinalPrompt).toBe(f.grader.mock.calls[0][0]);
    expect(f.grader).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
    if (mode !== 'pause') {
      expect(row.cost).toBe(0.4);
      expect(row.response?.incurredCost).toBe(0.2);
      expect(row.metadata?.incomplete).toBe(true);
      expect(row.metadata?.__promptfoo?.resumable).toBe(mode === 'caller' ? true : undefined);
    }
  },
);

it.each(strategies)(
  '%s publishes the second conclusive verdict with cumulative grading usage',
  async (strategy) => {
    const f = fixture(strategy, [
      { output: 'First safe response', tokenUsage: { total: 11, numRequests: 1 } },
      { output: 'Second conclusive response', tokenUsage: { total: 13, numRequests: 1 } },
    ]);
    const held = holdGrade();
    f.grader.mockResolvedValueOnce(passedGrade).mockImplementationOnce(held.call);
    const snapshots: ProviderResponse[] = [];
    const call = f.provider.callApi.bind(f.provider);
    vi.spyOn(f.provider, 'callApi').mockImplementation((prompt, context, callOptions) =>
      call(prompt, context, {
        ...callOptions,
        onProgress: (response) => {
          snapshots.push(structuredClone(response));
          callOptions?.onProgress?.(response);
        },
      }),
    );
    const record = await Eval.create({}, f.suite.prompts, { id: randomUUID() });
    const evaluation = evaluate(f.suite, record, options);
    running.push(evaluation);
    await held.entered.promise;
    expect(snapshots.at(-1)?.metadata?.storedGraderResult).toBeUndefined();
    held.gate.resolve({
      grade: {
        pass: false,
        score: 0,
        reason: 'Second target verdict',
        tokensUsed: { total: 7, numRequests: 1 },
      },
      rubric: 'Local checkpoint fixture',
    });
    await evaluation;
    const finalCheckpoint = snapshots.at(-1)!;
    expect(finalCheckpoint).toMatchObject({
      output: 'Second conclusive response',
      metadata: {
        storedGraderResult: {
          pass: false,
          reason: 'Second target verdict',
          tokensUsed: { total: 9, numRequests: 2 },
        },
        redteamHistory: [
          { output: 'First safe response', graderPassed: true },
          { output: 'Second conclusive response', graderPassed: false },
        ],
        stopReason: 'Grader failed',
      },
      tokenUsage: { total: 24, numRequests: 2, assertions: { total: 9, numRequests: 2 } },
    });
    expect(finalCheckpoint.metadata?.redteamFinalPrompt).toBe(f.grader.mock.calls[1][0]);
    if (strategy === 'meta') {
      expect(finalCheckpoint.metadata).toMatchObject({
        vulnerabilityAchieved: true,
        finalIteration: 2,
      });
    } else {
      expect(finalCheckpoint.metadata).toMatchObject({
        hydraResult: true,
        totalSuccessfulAttacks: 1,
      });
    }
    const [row] = await record.fetchResultsByTestIdx(0);
    expect(row.failureReason).toBe(ResultFailureReason.ASSERT);
    expect(row.response?.metadata?.storedGraderResult).toEqual(
      finalCheckpoint.metadata?.storedGraderResult,
    );
    expect(f.grader).toHaveBeenCalledTimes(2);
    expect((await Eval.findById(record.id))!.prompts[0].metrics?.tokenUsage.assertions?.total).toBe(
      9,
    );
  },
);

it.each(strategies)(
  '%s keeps completed target-error costs when pacing is cancelled',
  async (strategy) => {
    const f = fixture(strategy, [
      {
        output: 'Completed error evidence',
        error: 'Billable target diagnostic',
        cost: 0.4,
        incurredCost: 0.2,
        tokenUsage: { total: 11, numRequests: 1 },
      },
    ]);
    f.target.delay = 100;
    const pacing = createDeferred<void>();
    const debug = logger.debug.bind(logger);
    vi.spyOn(logger, 'debug').mockImplementation((...args) => {
      if (args[0] === 'Sleeping for 100ms') {
        pacing.resolve();
      }
      return debug(...args);
    });
    const caller = controller();
    const record = await Eval.create({}, f.suite.prompts, { id: randomUUID() });
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    const evaluation = evaluate(f.suite, record, { ...options, abortSignal: caller.signal });
    running.push(evaluation);
    await pacing.promise;
    caller.abort(new Error('Cancelled during target error pacing'));
    await evaluation;
    const [row] = await record.fetchResultsByTestIdx(0);
    expect(row).toMatchObject({
      failureReason: ResultFailureReason.ERROR,
      score: 0,
      cost: 0.4,
      response: { output: 'Completed error evidence', cost: 0.4, incurredCost: 0.2 },
    });
    expect(row.response?.metadata?.storedGraderResult).toBeUndefined();
    expect(f.grader).not.toHaveBeenCalled();
    expect(f.target.callApi).toHaveBeenCalledOnce();
    expect((await Eval.findById(record.id))!.prompts[0].metrics).toMatchObject({
      cost: 0.4,
      incurredCost: 0.2,
    });
  },
);

it('keeps Hydra costs for a completed target that was backtracked', async () => {
  const f = fixture(
    'hydra',
    [
      {
        output: "I can't help with that request.",
        cost: 0.2,
        incurredCost: 0.1,
        tokenUsage: { total: 11, numRequests: 1 },
      },
      { output: 'Later completed output', cost: 0.4, tokenUsage: { total: 13, numRequests: 1 } },
    ],
    2,
  );
  const held = holdGrade();
  f.grader.mockImplementation(held.call);
  const caller = controller();
  const record = await Eval.create({}, f.suite.prompts, { id: randomUUID() });
  const evaluation = evaluate(f.suite, record, { ...options, abortSignal: caller.signal });
  running.push(evaluation);
  await held.entered.promise;
  caller.abort(new Error('Cancelled grading after backtracking'));
  await evaluation;
  const [row] = await record.fetchResultsByTestIdx(0);
  expect(row.response?.metadata?.hydraBacktrackCount).toBe(1);
  expect(row.response?.metadata?.redteamHistory).toHaveLength(2);
  expect(row.response?.tokenUsage).toMatchObject({ total: 24, numRequests: 2 });
  expect(row.cost).toBeCloseTo(0.6);
  expect(row.response?.incurredCost).toBeCloseTo(0.5);
  expect(f.target.callApi).toHaveBeenCalledTimes(2);
});

describe.each(strategies)('%s pause verdict identity', (strategy) => {
  it.each(['pause', 'caller', 'normal'] as const)(
    'associates repeated output with its completed target attempt on %s',
    async (mode) => {
      const response = {
        output: 'Repeated target output',
        cost: 0.25,
        incurredCost: 0.1,
        tokenUsage: { total: 11, numRequests: 1 },
      };
      const f = fixture(strategy, [response, response]);
      const caller = controller();
      let targetCalls = 0;
      f.target.callApi = vi.fn(async () => {
        if (++targetCalls === 2 && mode !== 'normal') {
          caller.abort(new Error('Interrupted before the second target checkpoint'));
        }
        return structuredClone(response);
      });
      let probe = 0;
      vi.spyOn(PromptfooChatCompletionProvider.prototype, 'callApi').mockImplementation(
        async () => ({
          output: { result: `Distinct probe ${++probe}` },
        }),
      );
      vi.mocked(f.agent.callApi).mockImplementation(async () => ({
        output: { result: `Distinct probe ${++probe}` },
      }));
      f.grader.mockImplementation(async (input) => ({
        ...passedGrade,
        grade: { ...passedGrade.grade, reason: `Verdict for ${input}` },
      }));
      const record = await Eval.create({}, f.suite.prompts, { id: randomUUID() });
      await evaluate(f.suite, record, {
        ...options,
        ...(mode === 'pause' ? { pauseSignal: caller.signal } : { abortSignal: caller.signal }),
      });
      const fresh = (await Eval.findById(record.id))!;
      const [row] = await fresh.fetchResultsByTestIdx(0);
      expect(f.target.callApi).toHaveBeenCalledTimes(2);
      expect(f.grader).toHaveBeenCalledTimes(mode === 'normal' ? 2 : 1);
      expect(row.response?.output).toBe(response.output);
      const metadata = row.response?.metadata;
      if (mode === 'pause') {
        expect(row).toMatchObject({
          success: false,
          score: 0,
          failureReason: ResultFailureReason.ERROR,
        });
        expect(metadata?.storedGraderResult).toBeUndefined();
        expect(metadata?.completedTargetResponses).toHaveLength(2);
        expect(
          metadata?.completedTargetResponses.map(({ prompt }: { prompt: string }) => prompt),
        ).toEqual([
          expect.stringContaining('Distinct probe 1'),
          expect.stringContaining('Distinct probe 2'),
        ]);
        expect(metadata?.redteamHistory[0].graderPassed).toBe(true);
        expect(row.response?.tokenUsage?.assertions?.total).toBe(2);
        expect(row.response?.tokenUsage?.total).toBe(22);
        expect(row.cost).toBe(0.5);
        expect(row.response?.incurredCost).toBe(0.2);
        expect(await EvalResult.getCompletedIndexPairs(record.id)).toEqual(new Set(['0:0']));
        cliState.resume = true;
        await evaluate(f.suite, fresh, options);
        expect(f.target.callApi).toHaveBeenCalledTimes(2);
      } else {
        expect(metadata?.storedGraderResult?.reason).toBe(
          `Verdict for Distinct probe ${mode === 'normal' ? 2 : 1}`,
        );
        if (mode === 'caller') {
          expect(row).toMatchObject({
            success: false,
            score: 0,
            failureReason: ResultFailureReason.ERROR,
          });
          expect(row.metadata?.__promptfoo?.resumable).toBe(true);
          expect(metadata?.redteamHistory).toHaveLength(1);
          expect(row.response?.tokenUsage?.total).toBe(11);
          expect(row.cost).toBe(0.25);
        }
      }
      const beforeLate = row.toEvaluateResult();
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect((await fresh.fetchResultsByTestIdx(0))[0].toEvaluateResult()).toEqual(beforeLate);
    },
  );

  it.each(['pause', 'caller', 'normal'] as const)(
    'retains a graded blob response after %s during subsequent strategy work',
    async (mode) => {
      setBlobStorageProvider(new FilesystemBlobStorageProvider({ basePath: directory }));
      const rawImage = `data:image/png;base64,${Buffer.alloc(2048, 9).toString('base64')}`;
      const f = fixture(strategy, [
        { output: rawImage, cost: 0.25, tokenUsage: { total: 11, numRequests: 1 } },
        { output: 'Later output' },
      ]);
      const caller = controller();
      const entered = createDeferred<void>();
      const release = createDeferred<ProviderResponse>();
      releases.push(() => release.resolve({ output: { result: 'Later probe' } }));
      let requests = 0;
      const agentCall = vi.fn(async () => {
        if (++requests === 2) {
          entered.resolve();
          if (mode !== 'normal') {
            return release.promise;
          }
        }
        return { output: { result: requests === 1 ? 'Graded image probe' : 'Later probe' } };
      });
      vi.spyOn(PromptfooChatCompletionProvider.prototype, 'callApi').mockImplementation(agentCall);
      vi.mocked(f.agent.callApi).mockImplementation(agentCall);
      f.grader.mockImplementation(async (input) => ({
        ...passedGrade,
        grade: { ...passedGrade.grade, reason: `Verdict for ${input}` },
      }));
      // Keep normal completion on the first image to compare its stored verdict.
      if (mode === 'normal') {
        f.grader.mockResolvedValue({
          ...passedGrade,
          grade: {
            ...passedGrade.grade,
            pass: false,
            score: 0,
            reason: 'Verdict for Graded image probe',
          },
        });
      }
      const record = await Eval.create({}, f.suite.prompts, { id: randomUUID() });
      const evaluation = evaluate(f.suite, record, {
        ...options,
        ...(mode === 'pause' ? { pauseSignal: caller.signal } : { abortSignal: caller.signal }),
      });
      running.push(evaluation);
      if (mode !== 'normal') {
        await entered.promise;
        caller.abort(new Error('Interrupted after grading an externalized response'));
      }
      await evaluation;
      const fresh = (await Eval.findById(record.id))!;
      const [row] = await fresh.fetchResultsByTestIdx(0);
      const gradedOutput = f.grader.mock.calls[0][1];
      expect(gradedOutput).toMatch(/^promptfoo:\/\/blob\//);
      expect(row.response?.output).toBe(gradedOutput);
      expect(row.response?.metadata?.storedGraderResult?.reason).toBe(
        'Verdict for Graded image probe',
      );
      expect(row.response?.metadata?.redteamHistory[0].graderPassed).toBe(mode !== 'normal');
      expect(f.target.callApi).toHaveBeenCalledTimes(1);
      expect(f.grader).toHaveBeenCalledTimes(1);
      if (mode !== 'normal') {
        expect(row).toMatchObject({
          success: false,
          score: 0,
          failureReason: ResultFailureReason.ERROR,
        });
        expect(row.response?.tokenUsage?.assertions?.total).toBe(2);
        expect(row.response?.tokenUsage?.total).toBe(11);
        expect(row.cost).toBe(0.25);
      }
      if (mode === 'pause') {
        expect(await EvalResult.getCompletedIndexPairs(record.id)).toEqual(new Set(['0:0']));
        cliState.resume = true;
        await evaluate(f.suite, fresh, options);
        expect(f.target.callApi).toHaveBeenCalledTimes(1);
      }
      const beforeLate = row.toEvaluateResult();
      release.resolve({ output: { result: 'Late agent completion' } });
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect((await fresh.fetchResultsByTestIdx(0))[0].toEvaluateResult()).toEqual(beforeLate);
      const jsonPath = path.join(directory, 'identity.json');
      const jsonlPath = path.join(directory, 'identity.jsonl');
      await writeOutput(jsonPath, fresh, null);
      await writeOutput(jsonlPath, fresh, null);
      const exported = JSON.parse(fs.readFileSync(jsonPath, 'utf8')).results.results[0];
      const streamed = JSON.parse(fs.readFileSync(jsonlPath, 'utf8').trim());
      for (const result of [exported, streamed]) {
        expect(result.response.output).toBe(gradedOutput);
        expect(result.response.metadata.storedGraderResult.reason).toBe(
          'Verdict for Graded image probe',
        );
      }
    },
  );
});
