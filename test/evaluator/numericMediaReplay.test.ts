import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import sharp from 'sharp';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { runAssertion } from '../../src/assertions/index';
import { FilesystemBlobStorageProvider } from '../../src/blobs/filesystemProvider';
import {
  getBlobByHash,
  isBlobAllowedForShare,
  resetBlobStorageProvider,
  setBlobStorageProvider,
} from '../../src/blobs/index';
import cliState from '../../src/cliState';
import { evaluate as evaluateSuite, runEval } from '../../src/evaluator';
import {
  type InMemoryEvaluation,
  InMemoryEvaluationStore,
} from '../../src/evaluator/inMemoryStore';
import { runDbMigrations } from '../../src/migrate';
import Eval from '../../src/models/eval';
import EvalResult, { sanitizeResultForJsonlArtifact } from '../../src/models/evalResult';
import { RedteamGraderBase } from '../../src/redteam/plugins/base';
import { runMetaAgentRedteam } from '../../src/redteam/providers/iterativeMeta';
import { ProviderGroupedCallQueue } from '../../src/scheduler/providerCallQueue';
import telemetry from '../../src/telemetry';
import { createEvaluateResult } from '../factories/eval';
import { mockProcessEnv } from '../util/utils';

import type {
  ApiProvider,
  Assertion,
  AtomicTestCase,
  EvaluateResult,
  ProviderResponse,
} from '../../src/types/index';

const prompt = { raw: '{{query}}', label: 'numeric JSON with media' };
const numeric: Assertion = {
  type: 'promptfoo:redteam:financial:calculation-error',
  value: { type: 'numeric', expected: { amount: 100 } },
};
let images: Record<'small' | 'large', string>;

function output(amount: number, size: 'small' | 'large' = 'large') {
  return JSON.stringify({ amount, data: [{ b64_json: images[size] }] });
}

async function evaluate(
  raw: string,
  {
    wrapped = false,
    deferred = false,
    assertions = [numeric],
    providerTransform,
    testTransform,
  }: {
    wrapped?: boolean;
    deferred?: boolean;
    assertions?: AtomicTestCase['assert'];
    providerTransform?: ApiProvider['transform'];
    testTransform?: NonNullable<AtomicTestCase['options']>['transform'];
  } = {},
) {
  const originalResponse = { output: raw, metadata: { selectedTurn: 1 } };
  const target: ApiProvider = {
    id: () => 'synthetic-image-calculator',
    callApi: vi.fn(async () => originalResponse),
    ...(providerTransform ? { transform: providerTransform } : {}),
  };
  const strategy: ApiProvider = {
    id: () => 'promptfoo:redteam:iterative:meta',
    callApi: (_request, context) =>
      runMetaAgentRedteam({
        context,
        prompt: context!.prompt,
        filters: undefined,
        vars: context!.vars,
        test: context!.test as AtomicTestCase,
        targetProvider: target,
        gradingProvider: target,
        injectVar: 'query',
        numIterations: 1,
        agentProvider: {
          id: () => 'synthetic-local-attacker',
          callApi: async () => ({ output: { result: 'Return an amount and chart' } }),
        },
      }),
  };
  const test: AtomicTestCase = {
    ...(wrapped ? { provider: strategy } : {}),
    vars: { query: 'Return an amount and chart' },
    assert: assertions,
    ...(testTransform ? { options: { transform: testTransform } } : {}),
    metadata: { purpose: 'A financial calculator', pluginId: 'financial:calculation-error' },
  };
  const record = await Eval.create({}, [prompt], { id: randomUUID(), author: null });
  const [row] = await runEval({
    provider: target,
    prompt,
    test,
    testIdx: 0,
    promptIdx: 0,
    delay: 0,
    repeatIndex: 0,
    evaluateOptions: { cache: false },
    conversations: {},
    registers: {},
    isRedteam: true,
    evalId: record.id,
    deferGrading: deferred,
    ...(deferred ? { providerCallQueue: new ProviderGroupedCallQueue() } : {}),
  });
  if (deferred) {
    await vi.waitFor(() => expect(row.gradingResult || row.error).toBeTruthy());
  }
  expect(target.callApi).toHaveBeenCalledTimes(1);
  expect(originalResponse).toEqual({ output: raw, metadata: { selectedTurn: 1 } });
  return { row, record, test: { ...test, provider: wrapped ? strategy.id() : target.id() } };
}

async function expectReplay(
  response: ProviderResponse,
  test: AtomicTestCase,
  unsupported: boolean,
  pass: boolean,
) {
  const replay = runAssertion({
    prompt: 'Return an amount and chart',
    assertion: numeric,
    providerResponse: response,
    test,
  });
  if (unsupported) {
    await expect(replay).rejects.toThrow(/requires raw JSON text/);
  } else {
    expect(await replay).toMatchObject({ pass, score: pass ? 1 : 0 });
  }
}

function expectStoredSource(
  row: Pick<EvaluateResult, 'response' | 'metadata'>,
  raw: string,
  inline: boolean,
) {
  expect(row.response?.output).toEqual(
    inline ? raw : expect.stringMatching(/^promptfoo:\/\/blob\//),
  );
  if (!inline) {
    expect(row.response?.metadata?.redteamOutputIsText).toBe(false);
    expect(row.metadata?.redteamOutputIsText).toBe(false);
    expect(JSON.stringify(row)).not.toContain(images.large);
  }
  expect(row.response?.metadata).not.toHaveProperty('targetOutput');
  expect(row.response?.metadata).not.toHaveProperty('numericOutput');
}

describe('numeric media output and saved replay', () => {
  let directory: string;
  let restoreEnv: () => void;
  let previousBasePath: string | undefined;

  beforeAll(async () => {
    await runDbMigrations();
    const buffers = await Promise.all(
      [1, 64].map((size) =>
        sharp({ create: { width: size, height: size, channels: 3, background: 'white' } })
          .png({ compressionLevel: 0 })
          .toBuffer(),
      ),
    );
    images = { small: buffers[0].toString('base64'), large: buffers[1].toString('base64') };
  });
  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'numeric-media-replay-'));
    restoreEnv = mockProcessEnv({
      PROMPTFOO_CONFIG_DIR: directory,
      PROMPTFOO_INLINE_MEDIA: 'false',
      PROMPTFOO_DISABLE_REMOTE_GENERATION: 'true',
    });
    previousBasePath = cliState.basePath;
    cliState.basePath = directory;
    setBlobStorageProvider(
      new FilesystemBlobStorageProvider({ basePath: path.join(directory, 'blobs') }),
    );
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Unexpected network request')));
    vi.spyOn(telemetry, 'record').mockImplementation(() => {});
    vi.spyOn(RedteamGraderBase.prototype, 'getResult').mockRejectedValue(
      new Error('No LLM grading'),
    );
  });
  afterEach(async () => {
    try {
      expect(fetch).not.toHaveBeenCalled();
      expect(RedteamGraderBase.prototype.getResult).not.toHaveBeenCalled();
    } finally {
      cliState.basePath = previousBasePath;
      resetBlobStorageProvider();
      restoreEnv();
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
      await fs.rm(directory, { recursive: true, force: true });
    }
  });

  it.each(
    [false, true].flatMap((wrapped) =>
      [false, true].flatMap((inline) =>
        [false, true].flatMap((deferred) =>
          [100, 101].map((amount) => ({ wrapped, inline, deferred, amount })),
        ),
      ),
    ),
  )(
    'grades the original JSON and replays stored data (wrapped=$wrapped inline=$inline deferred=$deferred amount=$amount)',
    async ({ wrapped, inline, deferred, amount }) => {
      vi.stubEnv('PROMPTFOO_INLINE_MEDIA', String(inline));
      const raw = output(amount);
      const { row, record, test } = await evaluate(raw, { wrapped, deferred });
      expect(row.success).toBe(amount === 100);
      expect(row.failureReason).toBe(amount === 100 ? 0 : 1);
      if (wrapped) {
        expect(row.response?.metadata?.storedGraderResult.pass).toBe(amount === 100);
      }
      expectStoredSource(row, raw, inline);
      const saved = await EvalResult.createFromEvaluateResult(record.id, row, { persist: true });
      const readback = (await EvalResult.findById(saved.id))!.toEvaluateResult();
      expectStoredSource(readback, raw, inline);
      for (const response of [JSON.parse(JSON.stringify(row.response)), readback.response!]) {
        await expectReplay(response, test, !inline, amount === 100);
        await expectReplay(response, { metadata: test.metadata }, !inline, amount === 100);
      }
      if (!inline) {
        const hash = String(row.response?.output).split('/').at(-1)!;
        expect((await getBlobByHash(hash)).data.toString('base64')).toBe(images.large);
        expect(await isBlobAllowedForShare(hash, record.id)).toBe(true);
      }
    },
  );

  it.each(
    [false, true].flatMap((inline) =>
      (['small', 'large', 'none'] as const).map((size) => ({ inline, size })),
    ),
  )(
    'resolves unmarked baseline references once (inline=$inline size=$size)',
    async ({ inline, size }) => {
      vi.stubEnv('PROMPTFOO_INLINE_MEDIA', String(inline));
      const observedPath = path.join(directory, 'observed.jsonl');
      await fs.writeFile(
        path.join(directory, 'reference.cjs'),
        `
const fs = require('fs');
module.exports = (output, context) => {
  fs.appendFileSync(${JSON.stringify(observedPath)}, JSON.stringify({ output, providerOutput: context.providerResponse.output }) + '\\n');
  return { type: 'numeric', expected: { amount: 100 } };
};
`,
      );
      const raw = size === 'none' ? '{"amount":100}' : output(100, size);
      const transformed: unknown[] = [];
      const { row } = await evaluate(raw, {
        assertions: [
          {
            ...numeric,
            value: 'file://reference.cjs',
            transform: (value) => {
              transformed.push(value);
              return value;
            },
          },
        ],
      });
      const unsupported = !inline && size === 'large';
      expect(row.success).toBe(!unsupported);
      expect(row.failureReason).toBe(unsupported ? 2 : 0);
      if (unsupported) {
        expect(row.error).toContain('requires raw JSON text');
      }
      const seen = (await fs.readFile(observedPath, 'utf8'))
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      expect(seen).toHaveLength(1);
      expect(seen[0].output).toBe(unsupported ? (row.response?.output ?? transformed[0]) : raw);
      expect(seen[0].providerOutput).toBe(seen[0].output);
      expect(transformed).toEqual([seen[0].output]);
    },
  );

  it.each([false, true].flatMap((wrapped) => [false, true].map((inline) => ({ wrapped, inline }))))(
    'retains source validity when numeric assertions are added later (wrapped=$wrapped inline=$inline)',
    async ({ wrapped, inline }) => {
      vi.stubEnv('PROMPTFOO_INLINE_MEDIA', String(inline));
      const raw = output(100);
      const { row, record, test } = await evaluate(raw, {
        wrapped,
        assertions: [{ type: 'contains', value: inline ? 'amount' : 'promptfoo://blob/' }],
      });
      expect(row.success).toBe(true);
      expectStoredSource(row, raw, inline);
      const saved = await EvalResult.createFromEvaluateResult(record.id, row, { persist: true });
      const readback = (await EvalResult.findById(saved.id))!;
      for (const response of [JSON.parse(JSON.stringify(row.response)), readback.response!]) {
        await expectReplay(response, test, !inline, true);
        await expectReplay(response, { metadata: test.metadata }, !inline, true);
      }
    },
  );

  it.each([false, true].flatMap((inline) => [false, true].map((strip) => ({ inline, strip }))))(
    'keeps strategy errors normalized through the real writer (inline=$inline strip=$strip)',
    async ({ inline, strip }) => {
      vi.stubEnv('PROMPTFOO_INLINE_MEDIA', String(inline));
      vi.stubEnv('PROMPTFOO_STRIP_RESPONSE_OUTPUT', String(strip));
      const raw = output(100);
      const originalResponse = { output: raw, metadata: { selectedTurn: 1 } };
      const target: ApiProvider = {
        id: () => 'synthetic-error-sequence-target',
        callApi: vi.fn(async () => originalResponse),
      };
      const attacker: ApiProvider = {
        id: () => 'synthetic-error-sequence-attacker',
        callApi: vi
          .fn()
          .mockResolvedValueOnce({ output: { result: 'Return an amount and chart' } })
          .mockResolvedValueOnce({
            error: 'Synthetic attacker request failed',
            metadata: {
              remoteGenerationError: {
                status: 400,
                type: 'invalid_request_error',
                code: 'invalid_json',
              },
            },
          }),
      };
      const strategy: ApiProvider = {
        id: () => 'promptfoo:redteam:iterative:meta',
        callApi: (_request, context) =>
          runMetaAgentRedteam({
            context,
            prompt: context!.prompt,
            filters: undefined,
            vars: context!.vars,
            test: context!.test as AtomicTestCase,
            targetProvider: target,
            gradingProvider: target,
            injectVar: 'query',
            numIterations: 2,
            agentProvider: attacker,
          }),
      };
      const record = await Eval.create({}, [prompt], { id: randomUUID(), author: null });
      const memory: InMemoryEvaluation = {
        id: record.id,
        config: {},
        persisted: false,
        prompts: [],
        results: [],
        vars: [],
        resultPersistenceFailed: false,
        finalResults: [],
        failedResults: [],
      };
      const writer = { write: vi.fn(async (_row: unknown) => {}), close: vi.fn(async () => {}) };
      const test: AtomicTestCase = {
        provider: strategy,
        vars: { query: 'Return an amount and chart' },
        metadata: { purpose: 'A financial calculator', pluginId: 'synthetic:unmatched' },
        assert: [{ type: 'contains', value: 'amount' }, numeric],
      };
      await evaluateSuite(
        { providers: [target], prompts: [prompt], tests: [test] },
        memory,
        { maxConcurrency: 1, cache: false },
        {
          createEvaluationStore: (evaluation) => new InMemoryEvaluationStore(evaluation),
          createResultWriters: () => [writer],
        },
      );
      expect(target.callApi).toHaveBeenCalledTimes(1);
      expect(attacker.callApi).toHaveBeenCalledTimes(2);
      expect(memory.results).toHaveLength(1);
      expect(writer.write).toHaveBeenCalledTimes(1);
      expect(writer.close).toHaveBeenCalledTimes(1);
      const row = memory.results[0];
      expect(row.failureReason).toBe(2);
      expect(row.error).toContain('Synthetic attacker request failed');
      expectStoredSource(row, raw, inline);
      const streamed = writer.write.mock.calls[0][0] as EvaluateResult;
      expect(streamed.response?.output).toBe(strip ? '[output stripped]' : row.response?.output);
      if (!inline) {
        expect(JSON.stringify(streamed)).not.toContain(images.large);
      }
      const saved = await EvalResult.createFromEvaluateResult(record.id, row, { persist: true });
      const readback = (await EvalResult.findById(saved.id))!;
      expectStoredSource(readback, raw, inline);
      await expectReplay(readback.response!, { provider: strategy.id() }, !inline, true);
      expect(originalResponse).toEqual({ output: raw, metadata: { selectedTurn: 1 } });
    },
  );

  it.each([100, 101])('keeps small JSON media replayable (amount=%s)', async (amount) => {
    const raw = output(amount, 'small');
    const { row, test } = await evaluate(raw);
    expect(row.response?.output).toBe(raw);
    expect(row.success).toBe(amount === 100);
    expect(row.response?.metadata?.redteamOutputIsText).not.toBe(false);
    await expectReplay(JSON.parse(JSON.stringify(row.response)), test, false, amount === 100);
  });

  it.each(
    [false, true].flatMap((wrapped) => [false, true].map((grouped) => ({ wrapped, grouped }))),
  )(
    'keeps numeric callback order and normal sibling output (wrapped=$wrapped grouped=$grouped)',
    async ({ wrapped, grouped }) => {
      const stages: string[] = [];
      const stageTransform =
        (stage: string): NonNullable<Assertion['transform']> =>
        (value) => {
          stages.push(stage);
          expect(value).toContain(images.large);
          return String(value).replace(`"${stage}":0`, `"${stage}":1`);
        };
      await fs.writeFile(
        path.join(directory, 'reference.cjs'),
        `
module.exports = (output, context) => {
  const value = JSON.parse(output);
  const beforeAssertion = JSON.parse(context.providerResponse.output);
  if (value.provider !== 1 || value.test !== 1 || value.assertion !== 1 || beforeAssertion.assertion !== 0) {
    throw new Error('Incorrect numeric preparation order');
  }
  return { type: 'numeric', expected: { amount: 100 } };
};
`,
      );
      const leaf: Assertion = {
        ...numeric,
        config: { numeric: true },
        value: 'file://reference.cjs',
        transform: stageTransform('assertion'),
      };
      const sibling: Assertion = {
        type: 'javascript',
        value:
          'output.startsWith("promptfoo://blob/") && context.providerResponse.output === output',
      };
      const assertions: NonNullable<AtomicTestCase['assert']> = grouped
        ? [{ type: 'assert-set', assert: [sibling, leaf] }]
        : [sibling, leaf];
      const raw = JSON.stringify({
        amount: 100,
        provider: 0,
        test: 0,
        assertion: 0,
        data: [{ b64_json: images.large }],
      });
      const { row } = await evaluate(raw, {
        wrapped,
        assertions,
        providerTransform: stageTransform('provider'),
        testTransform: stageTransform('test'),
      });
      expect(row.success).toBe(true);
      expect(stages).toEqual(
        wrapped
          ? ['provider', 'test', 'assertion', 'provider', 'test', 'assertion']
          : ['provider', 'test', 'assertion'],
      );
      expectStoredSource(row, raw, false);
    },
  );

  it.each(
    [false, true].flatMap((inline) =>
      ['single', 'batch', 'memory', 'save-insert', 'save-update'].map((boundary) => ({
        inline,
        boundary,
      })),
    ),
  )(
    'retains negative source provenance through $boundary with inline=$inline',
    async ({ inline, boundary }) => {
      vi.stubEnv('PROMPTFOO_INLINE_MEDIA', String(inline));
      const record = await Eval.create({}, [prompt], { id: randomUUID(), author: null });
      const raw = output(100);
      const metadata = { redteamOutputIsText: true, redteamTargetMetadata: { selectedTurn: 1 } };
      const test: AtomicTestCase = {
        provider: 'promptfoo:redteam:iterative:meta',
        assert: [numeric],
      };
      const input = createEvaluateResult({
        prompt,
        response: { output: raw, metadata },
        metadata,
        testCase: test,
      });
      const original = structuredClone(input);
      const model =
        boundary === 'batch'
          ? (await EvalResult.createManyFromEvaluateResult([input], record.id))[0]
          : await EvalResult.createFromEvaluateResult(record.id, input, {
              persist: boundary === 'single' || boundary === 'save-update',
            });
      if (boundary.startsWith('save-')) {
        model.response = input.response;
        model.metadata = metadata;
        await model.save();
        expect(model.response).toBe(input.response);
        expect(model.metadata).toBe(input.metadata);
      }
      const stored = boundary === 'memory' ? model : (await EvalResult.findById(model.id))!;
      const row = stored.toEvaluateResult();
      expectStoredSource(row, raw, inline);
      await expectReplay(row.response!, test, !inline, true);
      for (const strip of [false, true]) {
        const projected = sanitizeResultForJsonlArtifact(row, {
          shouldStripPromptText: false,
          shouldStripResponseOutput: strip,
          shouldStripTestVars: false,
          shouldStripGradingResult: false,
          shouldStripMetadata: false,
        });
        expect(projected.response?.output).toBe(strip ? '[output stripped]' : row.response?.output);
        if (strip || !inline) {
          expect(JSON.stringify(projected)).not.toContain(images.large);
        }
      }
      expect(input).toEqual(original);
    },
  );
});
