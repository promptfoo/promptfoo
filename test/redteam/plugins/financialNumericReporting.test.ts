import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { parse as parseCsv } from 'csv-parse/sync';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { evaluate, runEval } from '../../../src/evaluator';
import { runDbMigrations } from '../../../src/migrate';
import Eval, { EvalQueries } from '../../../src/models/eval';
import EvalResult from '../../../src/models/evalResult';
import { testProviderConnectivity } from '../../../src/node/testProvider';
import AuthoritativeMarkupInjectionProvider from '../../../src/redteam/providers/authoritativeMarkupInjection';
import BestOfNProvider from '../../../src/redteam/providers/bestOfN';
import { evalTableToCsv } from '../../../src/util/eval/evalTableUtils';
import { convertEvalResultToTableCell } from '../../../src/util/exportToFile/index';
import { createCompletedPrompt } from '../../factories/eval';
import { mockProcessEnv } from '../../util/utils';

import type {
  ApiProvider,
  Assertion,
  AtomicTestCase,
  ProviderResponse,
  TestSuite,
} from '../../../src/types/index';

const remoteFetch = vi.hoisted(() => vi.fn());
vi.mock('../../../src/util/fetch/index', async (original) => ({
  ...(await original()),
  fetchWithProxy: (...args: unknown[]) => remoteFetch(...args),
}));
vi.mock('../../../src/redteam/remoteGeneration', async (original) => ({
  ...(await original()),
  neverGenerateRemote: () => false,
}));

const strategies = ['best-of-n', 'authoritative-markup-injection'] as const;
type Strategy = (typeof strategies)[number];
const prompt = { raw: '{{query}}', label: 'numeric reporting' };
const numericAssertion: Assertion = {
  type: 'promptfoo:redteam:financial:calculation-error',
  value: { type: 'numeric', expected: { amount: 100 } },
};

function createStrategy(strategy: Strategy): ApiProvider {
  return strategy === 'best-of-n'
    ? new BestOfNProvider({ injectVar: 'query', maxConcurrency: 1 })
    : new AuthoritativeMarkupInjectionProvider({ injectVar: 'query' });
}

function createTest(
  provider: ApiProvider,
  numeric: boolean,
  query = 'Return an amount',
): AtomicTestCase {
  return {
    provider,
    vars: { query },
    assert: numeric ? [numericAssertion] : [{ type: 'equals', value: '{"amount":100}' }],
    metadata: {
      purpose: 'A financial calculator',
      pluginId: 'financial:calculation-error',
      strategyId: provider.id().split(':').at(-1),
    },
  };
}

async function runRow(
  strategy: Strategy,
  numeric: boolean,
  response: ProviderResponse,
  testIdx = 0,
) {
  const wrapper = createStrategy(strategy);
  const target: ApiProvider = {
    id: () => 'synthetic-reporting-target',
    callApi: vi.fn(async () => response),
  };
  const [row] = await runEval({
    provider: target,
    prompt,
    test: createTest(wrapper, numeric, `row ${testIdx}`),
    testIdx,
    promptIdx: 0,
    delay: 0,
    repeatIndex: 0,
    evaluateOptions: {},
    conversations: {},
    registers: {},
    isRedteam: true,
  });
  expect(target.callApi).toHaveBeenCalledTimes(1);
  expect(row.success).toBe(true);
  return row;
}

async function createRecord() {
  const created = await Eval.create({ redteam: {} }, [prompt], {
    id: randomUUID(),
    author: null,
    vars: ['query'],
    completedPrompts: [
      createCompletedPrompt(prompt.raw, {
        label: prompt.label,
        provider: 'synthetic-reporting-target',
      }),
    ],
  });
  const record = await Eval.findById(created.id);
  expect(record).toBeDefined();
  return record!;
}

describe('numeric metadata reporting compatibility', () => {
  let directory: string;
  let restoreEnv: () => void;

  beforeAll(async () => {
    // Uses the shared in-memory database, reset by the root Vitest teardown.
    await runDbMigrations();
  });

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'numeric-reporting-'));
    restoreEnv = mockProcessEnv({ PROMPTFOO_INLINE_MEDIA: 'true' });
    remoteFetch.mockReset();
    remoteFetch.mockImplementation(async (url, options) => {
      if (String(url).endsWith('/api/v1/providers/test')) {
        return {
          ok: true,
          json: async () => ({
            changes_needed: false,
            message: 'Synthetic diagnostic check passed',
          }),
        };
      }
      const { task } = JSON.parse(options.body);
      if (task === 'jailbreak:best-of-n') {
        return { json: async () => ({ modifiedPrompts: ['Return an amount'] }) };
      }
      if (task === 'authoritative-markup-injection') {
        return { json: async () => ({ message: { role: 'user', content: 'Return an amount' } }) };
      }
      throw new Error(`Unexpected synthetic task: ${task}`);
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('Unexpected network request');
      }),
    );
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    remoteFetch.mockReset();
    restoreEnv();
    await fs.rm(directory, { recursive: true, force: true });
  });

  it.each(
    strategies.flatMap((strategy) =>
      ['single', 'multiple'].map((sessions) => ({ strategy, sessions })),
    ),
  )(
    '$strategy preserves $sessions session IDs in DB table and CSV projections',
    async ({ strategy, sessions }) => {
      const metadata =
        sessions === 'single'
          ? { sessionId: 'synthetic-session-one' }
          : { sessionIds: ['synthetic-session-one', 'synthetic-session-two'] };
      const expectedCell =
        sessions === 'single'
          ? 'synthetic-session-one'
          : 'synthetic-session-one\nsynthetic-session-two';
      const projections = [];
      for (const numeric of [false, true]) {
        const row = await runRow(strategy, numeric, { output: '{"amount":100}', metadata });
        const record = await createRecord();
        await record.addResult(row);
        const table = await record.getTablePage({ filters: [] });
        const sessionColumn = table.head.vars.indexOf('sessionId');
        expect(sessionColumn).toBeGreaterThanOrEqual(0);
        expect(table.body).toHaveLength(1);
        expect(table.body[0].vars[sessionColumn]).toBe(expectedCell);
        const [headers, values] = parseCsv(
          evalTableToCsv(table, { isRedteam: true }),
        ) as string[][];
        expect(values[headers.indexOf('sessionId')]).toBe(expectedCell);
        const metadataColumn = sessions === 'single' ? 'sessionId' : 'sessionIds';
        expect(values[headers.lastIndexOf(metadataColumn)]).toBe(
          sessions === 'single' ? 'synthetic-session-one' : JSON.stringify(metadata.sessionIds),
        );
        projections.push({
          sessionCell: table.body[0].vars[sessionColumn],
          csvValue: values[headers.lastIndexOf(metadataColumn)],
          sessions:
            table.body[0].outputs[0].metadata?.[sessions === 'single' ? 'sessionId' : 'sessionIds'],
        });
      }
      expect(projections[1]).toEqual(projections[0]);
    },
  );

  it.each(strategies)(
    '%s preserves arbitrary metadata key/value discovery and SQL filters',
    async (strategy) => {
      const projections = [];
      for (const numeric of [false, true]) {
        const record = await createRecord();
        for (const [testIdx, bucket] of ['primary', 'secondary'].entries()) {
          const row = await runRow(
            strategy,
            numeric,
            {
              output: '{"amount":100}',
              metadata: {
                routingBucket: bucket,
                batchNote: testIdx === 0 ? 'synthetic alpha batch' : 'synthetic beta batch',
              },
            },
            testIdx,
          );
          await record.addResult(row);
        }
        const keys = await EvalQueries.getMetadataKeysFromEval(record.id);
        expect(keys).toEqual(expect.arrayContaining(['routingBucket', 'batchNote']));
        const values = await EvalQueries.getMetadataValuesFromEval(record.id, 'routingBucket');
        expect(values).toEqual(['primary', 'secondary']);
        const matches = [];
        for (const [field, operator, value] of [
          ['routingBucket', 'equals', 'primary'],
          ['batchNote', 'contains', 'alpha'],
        ]) {
          const table = await record.getTablePage({
            filters: [
              JSON.stringify({ logicOperator: 'and', type: 'metadata', field, operator, value }),
            ],
          });
          expect(table.totalCount).toBe(2);
          expect(table.filteredCount).toBe(1);
          expect(table.body.map((row) => row.testIdx)).toEqual([0]);
          matches.push(table.body[0].outputs[0].metadata?.routingBucket);
        }
        projections.push({ values, matches });
      }
      expect(projections[1]).toEqual(projections[0]);
    },
  );

  it.each(strategies)(
    '%s preserves request diagnostics and media in reporting consumers',
    async (strategy) => {
      const audio = {
        data: Buffer.from('synthetic audio data').toString('base64'),
        format: 'pcm16',
        transcript: 'Synthetic spoken output',
      };
      const finalRequestBody = JSON.stringify({ query: 'Synthetic request', amount: 100 });
      const transformedRequest = {
        method: 'POST',
        url: 'https://example.com/calculator',
        body: finalRequestBody,
      };
      const projections = [];
      for (const numeric of [false, true]) {
        const row = await runRow(strategy, numeric, {
          output: '{"amount":100}',
          audio: { ...audio },
          metadata: { finalRequestBody, transformedRequest, audio: { ...audio } },
        });
        const model = await EvalResult.createFromEvaluateResult(randomUUID(), row, {
          persist: false,
        });
        const cell = convertEvalResultToTableCell(model);
        expect(cell.audio).toMatchObject(audio);
        expect(cell.metadata?.audio).toEqual(audio);
        const diagnostics = await testProviderConnectivity({
          provider: { id: () => 'synthetic-diagnostic-target', callApi: async () => row.response! },
          prompt: 'Synthetic connectivity check',
        });
        expect(diagnostics.success).toBe(true);
        expect(diagnostics.transformedRequest).toEqual(transformedRequest);
        const reportedResponse = diagnostics.providerResponse as ProviderResponse;
        expect(reportedResponse.metadata?.finalRequestBody).toBe(finalRequestBody);
        expect(reportedResponse.metadata?.audio).toEqual(audio);
        projections.push({
          request: diagnostics.transformedRequest,
          body: reportedResponse.metadata?.finalRequestBody,
          audio: cell.audio,
          metadataAudio: cell.metadata?.audio,
        });
      }
      expect(projections[1]).toEqual(projections[0]);
    },
  );

  it.each(
    strategies.flatMap((strategy) => [false, true].map((workingDir) => ({ strategy, workingDir }))),
  )(
    '$strategy preserves workspace-triggered deferred grading flush (workingDir: $workingDir)',
    async ({ strategy, workingDir }) => {
      const orders = [];
      for (const numeric of [false, true]) {
        const calls: string[] = [];
        const wrapper = createStrategy(strategy);
        const target: ApiProvider = {
          id: () => 'synthetic-workspace-target',
          callApi: async () => {
            calls.push('target');
            return {
              output: '{"amount":100}',
              metadata: workingDir ? { workingDir: directory } : {},
            };
          },
        };
        const judge: ApiProvider = {
          id: () => 'synthetic-workspace-judge',
          callApi: vi.fn(async () => {
            calls.push('judge');
            return { output: JSON.stringify({ pass: true, score: 1, reason: 'Synthetic check' }) };
          }),
        };
        const tests = [0, 1].map((index) => {
          const test = createTest(wrapper, numeric, `row ${index}`);
          test.assert!.push({ type: 'llm-rubric', value: 'Check {{query}}', provider: judge });
          return test;
        });
        const suite: TestSuite = { providers: [target], prompts: [prompt], tests, redteam: {} };
        const record = new Eval({}, { id: randomUUID(), persisted: false });
        await evaluate(suite, record, { maxConcurrency: 1, showProgressBar: false });
        const summary = await record.toEvaluateSummary();
        expect(summary.results).toHaveLength(2);
        expect(summary.results.every((row) => row.success)).toBe(true);
        expect(judge.callApi).toHaveBeenCalledTimes(2);
        expect(calls).toEqual(
          workingDir
            ? ['target', 'judge', 'target', 'judge']
            : ['target', 'target', 'judge', 'judge'],
        );
        orders.push(calls);
      }
      expect(orders[1]).toEqual(orders[0]);
    },
  );
});
