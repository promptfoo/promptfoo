import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { runDbMigrations } from '../../src/migrate';
import Eval from '../../src/models/eval';
import EvalResult from '../../src/models/evalResult';
import { generateIdFromPrompt } from '../../src/models/prompt';
import { evaluateWithSource } from '../../src/node';
import { loadApiProviders } from '../../src/providers/index';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import { createApp } from '../../src/server/server';
import { ResultFailureReason } from '../../src/types';
import { STRIPPED_TABLE_CELL_PROMPT } from '../../src/util/eval/evalTableUtils';
import invariant from '../../src/util/invariant';
import EvalFactory from '../factories/evalFactory';
import { setupTestServer } from '../util/testServer';
import { mockProcessEnv } from '../util/utils';

vi.mock('../../src/database/signal', async () => {
  const actual = await vi.importActual('../../src/database/signal');
  return {
    ...actual,
    updateSignalFile: vi.fn(),
  };
});

describe('eval routes', () => {
  const testEvalIds = new Set<string>();

  const api = setupTestServer(createApp, runDbMigrations);

  afterEach(async () => {
    vi.restoreAllMocks();

    // More robust cleanup with proper error handling
    const cleanupPromises = Array.from(testEvalIds).map(async (evalId) => {
      try {
        const eval_ = await Eval.findById(evalId);
        if (eval_) {
          await eval_.delete();
        }
      } catch (error) {
        // Log the error instead of silently ignoring it
        console.error(`Failed to cleanup eval ${evalId}:`, error);
      }
    });

    // Wait for all cleanups to complete
    await Promise.allSettled(cleanupPromises);
    testEvalIds.clear();
    vi.resetAllMocks();
  });

  it.each([undefined, 0])(
    'replays a saved environment-selected provider with prompt index %s',
    async (promptIndex) => {
      onTestFinished(mockProcessEnv({ REPLAY_FIXTURE_PROVIDER: 'echo' }));
      const original = { raw: 'original', label: 'original' };
      const saved = await Eval.create(
        { providers: [{ id: '{{ env.REPLAY_FIXTURE_PROVIDER }}' }] },
        [original],
        { completedPrompts: [{ ...original, provider: 'echo' }] },
      );
      testEvalIds.add(saved.id);

      const response = await api.post('/api/eval/replay').send({
        evaluationId: saved.id,
        promptIndex,
        prompt: 'edited replay',
      });
      expect(response.status).toBe(200);
      expect(response.body.output).toBe('edited replay');
    },
  );

  it('checks the authored prompt ID even when several definitions share a label hash', async () => {
    const original = { id: 'question-1', label: 'Readable', raw: 'First question' };
    const other = { ...original, id: 'question-2', raw: 'Different question' };
    const hash = generateIdFromPrompt(original);
    const request = async (selector: string, prompts = [other, original]) => {
      const saved = await Eval.create(
        { providers: [{ id: 'echo', prompts: [selector] }], prompts },
        prompts,
        { completedPrompts: [{ ...original, id: hash, provider: 'echo' }] },
      );
      testEvalIds.add(saved.id);
      return api
        .post('/api/eval/replay')
        .send({ evaluationId: saved.id, promptIndex: 0, prompt: 'edited' });
    };
    expect((await request(original.id)).body.output).toBe('edited');
    expect((await request('question-*')).status).toBe(200);
    expect((await request(other.id)).status).toBe(400);
    expect((await request(hash)).status).toBe(400);
    expect((await request(hash, [])).status).toBe(400);
    const ambiguous = [original, { ...original, id: 'another-id' }];
    expect((await request(original.id, ambiguous)).status).toBe(400);
    expect((await request(original.label, ambiguous)).status).toBe(200);
  });

  it('applies saved label and ID prompt overrides before provider filters on replay', async () => {
    const prompt = { id: 'current', label: 'Readable', raw: 'Original' };
    const replay = async (
      providerPromptMap: Record<string, string[]>,
      instance: string[],
      label = 'named',
    ) => {
      const config = {
        providers: [{ id: 'echo', label, prompts: instance }],
        prompts: [prompt],
        providerPromptMap,
      };
      const saved = await Eval.create(config, [prompt], {
        completedPrompts: [{ ...prompt, id: generateIdFromPrompt(prompt), provider: label }],
      });
      testEvalIds.add(saved.id);
      return api
        .post('/api/eval/replay')
        .send({ evaluationId: saved.id, promptIndex: 0, prompt: 'edited' });
    };
    const allowed = [prompt.id];
    expect((await replay({ named: allowed, echo: [] }, ['legacy'])).body.output).toBe('edited');
    expect((await replay({ named: [], echo: allowed }, allowed)).status).toBe(400);
    expect((await replay({ echo: [] }, allowed)).status).toBe(400);
    expect((await replay({ echo: allowed }, [], 'toString')).status).toBe(200);
    expect((await replay({ unrelated: [] }, allowed)).status).toBe(200);
    expect((await replay({ unrelated: allowed }, [])).status).toBe(400);
  });

  it('sends a replay only to the HTTP destination bound by the saved suite', async () => {
    const requests: { url?: string; authorization?: string; tenant?: string | string[] }[] = [];
    const target = createServer((req, res) => {
      requests.push({
        url: req.url,
        authorization: req.headers.authorization,
        tenant: req.headers['x-tenant'],
      });
      req.pipe(res);
    }).listen(0, '127.0.0.1');
    await once(target, 'listening');
    onTestFinished(() => new Promise<void>((resolve) => target.close(() => resolve())));
    const address = target.address();
    invariant(address && typeof address !== 'string', 'Expected a loopback listener');
    const base = `http://127.0.0.1:${address.port}`;
    const url = `${base}/saved`;
    onTestFinished(mockProcessEnv({ REPLAY_URL: `${base}/wrong`, PF_TOKEN: 'ambient' }));
    const original = { raw: 'original', label: 'original' };
    const saved = await Eval.create(
      {
        providers: [
          {
            id: 'http',
            env: { OPENAI_ORGANIZATION: 'provider' },
            config: {
              url: '{{ env.REPLAY_URL }}',
              method: 'POST',
              body: '{{prompt}}',
              headers: {
                Authorization: 'Bearer {{ env.PF_TOKEN }}',
                'X-Tenant': '{{ env.OPENAI_ORGANIZATION }}',
              },
            },
          },
        ],
        env: { REPLAY_URL: url, PF_TOKEN: 'suite-fixture', OPENAI_ORGANIZATION: 'suite' },
      },
      [original],
      { completedPrompts: [{ ...original, provider: url }] },
    );
    testEvalIds.add(saved.id);
    const response = await api.post('/api/eval/replay').send({
      evaluationId: saved.id,
      promptIndex: 0,
      prompt: 'edited replay',
    });
    expect(response.status).toBe(200);
    expect(requests).toEqual([
      { url: '/saved', authorization: 'Bearer suite-fixture', tenant: 'provider' },
    ]);
    expect(JSON.stringify(response.body)).not.toContain('suite-fixture');
    expect(response.body.output).toBe('edited replay');
  });

  it('binds mutable file targets to the persisted result even when the label stays the same', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'promptfoo-replay-'));
    onTestFinished(() => rm(directory, { force: true, recursive: true }));
    const requests: string[] = [];
    const target = createServer((req, res) => {
      requests.push(req.url!);
      req.pipe(res);
    }).listen(0, '127.0.0.1');
    await once(target, 'listening');
    onTestFinished(() => new Promise<void>((resolve) => target.close(() => resolve())));
    const address = target.address();
    invariant(address && typeof address !== 'string', 'Expected a loopback listener');
    const base = `http://127.0.0.1:${address.port}`;
    const file = join(directory, 'providers.json');
    const update = (url: string) =>
      writeFile(
        file,
        JSON.stringify({
          id: 'http',
          label: 'Saved',
          config: { url, method: 'POST', body: '{{prompt}}' },
        }),
      );
    const prompt = { label: 'question', raw: 'original' };
    const saved = await Eval.create({ providers: [`file://${file}`] }, [prompt], {
      completedPrompts: [{ ...prompt, provider: 'Saved' }],
    });
    testEvalIds.add(saved.id);
    const request = (promptIndex?: number) =>
      api
        .post('/api/eval/replay')
        .send({ evaluationId: saved.id, promptIndex, testIndex: 99, prompt: 'edited' });
    await update(base + '/saved');
    expect((await request(0)).status).toBe(400); // No recorded identity yet.
    const original = {
      promptIdx: 0,
      testIdx: 0,
      prompt,
      promptId: 'question',
      testCase: {},
      vars: {},
      provider: {
        id: base + '/saved',
        label: 'Saved',
        config: { url: base + '/saved', method: 'POST', body: '{{prompt}}' },
      },
      success: true,
      score: 1,
      latencyMs: 1,
      failureReason: ResultFailureReason.NONE,
      namedScores: {},
      cost: 0,
    };
    await saved.addResult(original);
    expect((await request(0)).body.output).toBe('edited');
    await update(base + '/other');
    expect((await request(0)).status).toBe(400);
    expect((await request()).status).toBe(400);
    // A conflicting scanner result anywhere in the column also blocks a replay.
    await update(base + '/saved');
    await saved.addResult({ ...original, testIdx: 1, metadata: { codexSecurity: {} } });
    expect((await request(0)).status).toBe(400);
    expect(requests).toEqual(['/saved']);
  });

  async function replayTargets() {
    const calls: Array<{ host?: string; authorization?: string }> = [];
    const listen = async () => {
      const server = createServer((req, res) => {
        calls.push({ host: req.headers.host, authorization: req.headers.authorization });
        req.resume();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ choices: [{ message: { content: 'fixture' } }] }));
      }).listen(0, '127.0.0.1');
      await once(server, 'listening');
      onTestFinished(() => new Promise<void>((resolve) => server.close(() => resolve())));
      const address = server.address();
      invariant(address && typeof address !== 'string', 'Expected a loopback listener');
      return `127.0.0.1:${address.port}`;
    };
    const first = await listen();
    const other = await listen();
    return { calls, first, other };
  }

  it.each(['openai', 'raw HTTP', 'inline HTTP request file'])(
    'binds a mutable %s endpoint even when both the stored ID and label stay unchanged',
    async (transport) => {
      const directory = await mkdtemp(join(tmpdir(), 'promptfoo-replay-'));
      onTestFinished(() => rm(directory, { force: true, recursive: true }));
      const { calls, first, other } = await replayTargets();
      const inline = transport === 'inline HTTP request file';
      const file = join(directory, inline ? 'request.txt' : 'provider.json');
      const model = transport === 'openai';
      const update = (host: string) => {
        const request = `POST /ask HTTP/1.1\r\nHost: ${host}\r\n\r\n{{prompt}}`;
        const config = model ? { apiBaseUrl: `http://${host}/v1` } : { request };
        const provider = { id: model ? 'openai:chat:gpt-4o' : 'http', label: 'Saved', config };
        return writeFile(file, inline ? request : JSON.stringify(provider));
      };
      await update(first);
      const reference = `file://${file}`;
      const saved = await evaluateWithSource(
        {
          providers: [inline ? { id: 'http', config: { request: reference } } : reference],
          env: { OPENAI_API_KEY: 'suite-fixture', OPENAI_BASE_URL: `http://${first}/fallback` },
          prompts: ['original'],
          tests: [{ vars: {} }],
          writeLatestResults: true,
          sharing: false,
        },
        { cache: false, showProgressBar: false, eventSource: 'library' },
      );
      testEvalIds.add(saved.id);
      const replay = () =>
        api.post('/api/eval/replay').send({
          evaluationId: saved.id,
          promptIndex: 0,
          prompt: 'edited',
        });
      expect((await replay()).status).toBe(inline ? 400 : 200);
      await update(other);
      const blocked = await replay();
      expect(blocked.status).toBe(400);
      expect(JSON.stringify(blocked.body)).not.toContain('suite-fixture');
      const expected = { host: first, authorization: model ? 'Bearer suite-fixture' : undefined };
      expect(calls).toEqual(inline ? [expected] : [expected, expected]);
    },
  );

  it.each(['raw Host', 'ambient endpoint', 'saved endpoint', 'test provider', 'provider output'])(
    'only sends a replay to the original inline target with %s',
    async (source) => {
      const { calls, first, other } = await replayTargets();
      const model = source.endsWith('endpoint');
      const raw = source === 'raw Host';
      const endpoint = `http://${first}/v1`;
      vi.stubEnv('REPLAY_ENDPOINT', endpoint);
      onTestFinished(() => {
        vi.unstubAllEnvs();
      });
      const config = model
        ? { apiBaseUrl: '{{ env.REPLAY_ENDPOINT }}' }
        : raw
          ? {
              request:
                'POST /ask HTTP/1.1\r\nHost: {{host}}\r\nAuthorization: Bearer {{env.OPENAI_API_KEY}}\r\n\r\n{{prompt}}',
            }
          : { url: `http://${other}`, method: 'POST', body: '{{prompt}}' };
      const savedEndpoint = source === 'saved endpoint';
      const saved = await evaluateWithSource(
        {
          providers: [{ id: model ? 'openai:chat:gpt-4o' : 'http', config }],
          env: {
            OPENAI_API_KEY: 'suite-fixture',
            OPENAI_BASE_URL: endpoint,
            ...(savedEndpoint && { REPLAY_ENDPOINT: endpoint }),
          },
          prompts: ['original'],
          tests: [
            {
              vars: { host: first },
              ...(source === 'test provider' && {
                provider: { id: () => 'echo', callApi: async () => ({ output: 'local' }) },
              }),
              ...(source === 'provider output' && { providerOutput: 'recorded' }),
            },
          ],
          writeLatestResults: true,
          sharing: false,
        },
        { cache: false, showProgressBar: false, eventSource: 'library' },
      );
      testEvalIds.add(saved.id);
      expect((await saved.toEvaluateSummary()).results[0].success).toBe(true);
      const expected = { host: first, authorization: 'Bearer suite-fixture' };
      expect(calls.splice(0)).toEqual(raw || model ? [expected] : []);
      vi.stubEnv('REPLAY_ENDPOINT', `http://${other}/v1`);
      const replay = await api.post('/api/eval/replay').send({
        evaluationId: saved.id,
        testIndex: 0,
        promptIndex: 0,
        prompt: 'edited',
        variables: { host: other },
      });
      expect(replay.status).toBe(savedEndpoint ? 200 : 400);
      expect(calls).toEqual(savedEndpoint ? [expected] : []);
      expect(JSON.stringify(replay.body)).not.toContain('suite-fixture');
    },
  );

  it('keeps saved credentials outside edited prompts and variables', async () => {
    const secret = 'synthetic-saved-credential';
    const saved = await evaluateWithSource(
      {
        providers: ['echo'],
        prompts: ['original'],
        tests: [{ vars: {} }],
        env: { OPENAI_API_KEY: secret },
        writeLatestResults: true,
        sharing: false,
      },
      { cache: false, showProgressBar: false, eventSource: 'library' },
    );
    testEvalIds.add(saved.id);
    const replay = (prompt: string, variables?: Record<string, unknown>) =>
      api
        .post('/api/eval/replay')
        .send({ evaluationId: saved.id, promptIndex: 0, prompt, variables });
    for (const [prompt, variables] of [
      ['{{env.OPENAI_API_KEY}}', {}],
      ['{{question}}', { question: '{{env.OPENAI_API_KEY}}' }],
      ['{"text":"\\u007b\\u007benv.OPENAI_API_KEY}}"}', {}],
      ['{% set key = env.OPENAI_API_KEY %}{{key}}', {}],
      ['{"text":"{\\u0025 include file %}"}', {}],
      ['{{question}}', { question: 'file://untrusted.js' }],
    ] as const) {
      const response = await replay(prompt, variables);
      expect(JSON.stringify(response.body)).not.toContain(secret);
      expect(response.status).toBe(400);
    }
    const valid = await replay('Hello {{ name }}', { name: 'World' });
    expect(valid.status).toBe(200);
    expect(valid.body.output).toBe('Hello World');
  });

  it('refuses an implicit model endpoint before sending a saved key to the current gateway', async () => {
    const { calls, first, other } = await replayTargets();
    vi.stubEnv('OPENAI_BASE_URL', 'http://' + first);
    onTestFinished(() => {
      vi.unstubAllEnvs();
    });
    const saved = await evaluateWithSource(
      {
        providers: ['openai:chat:gpt-4o'],
        prompts: ['original'],
        tests: [{ vars: {} }],
        env: { OPENAI_API_KEY: 'suite-fixture' },
        writeLatestResults: true,
        sharing: false,
      },
      { cache: false, showProgressBar: false, eventSource: 'library' },
    );
    testEvalIds.add(saved.id);
    expect(calls.splice(0)).toEqual([{ host: first, authorization: 'Bearer suite-fixture' }]);
    vi.stubEnv('OPENAI_BASE_URL', 'http://' + other);
    const replay = await api.post('/api/eval/replay').send({
      evaluationId: saved.id,
      promptIndex: 0,
      prompt: 'edited',
    });
    expect(calls).toEqual([]);
    expect(replay.status).toBe(400);
  });

  it.each(['ambient', 'suite', 'provider'])(
    'checks the original model gateway when its %s setting could be overridden',
    async (scope) => {
      const id = 'openai:chat:gpt-4.1';
      const gateway = 'https://gateway.invalid/v1';
      const destinations: string[] = [];
      vi.spyOn(OpenAiChatCompletionProvider.prototype, 'callApi').mockImplementation(
        async function (this: OpenAiChatCompletionProvider) {
          destinations.push(this.getApiUrl());
          return { output: 'fixture' };
        },
      );
      vi.stubEnv('OPENAI_API_KEY', 'synthetic-gateway-key');
      vi.stubEnv('OPENAI_BASE_URL', gateway);
      onTestFinished(() => {
        vi.unstubAllEnvs();
      });
      const env = { OPENAI_BASE_URL: gateway };
      const saved = await evaluateWithSource(
        {
          providers: [scope === 'provider' ? { id, env } : id],
          ...(scope === 'suite' && { env }),
          prompts: ['original'],
          tests: [{ vars: {} }],
          writeLatestResults: true,
          sharing: false,
        },
        { cache: false, showProgressBar: false, eventSource: 'library' },
      );
      testEvalIds.add(saved.id);
      expect(destinations.splice(0)).toEqual([gateway]);
      vi.stubEnv('OPENAI_BASE_URL', undefined);
      if (scope !== 'ambient') {
        vi.stubEnv('OPENAI_API_HOST', 'changed.invalid');
      }
      const response = await api.post('/api/eval/replay').send({
        evaluationId: saved.id,
        promptIndex: 0,
        prompt: 'edited',
      });
      if (scope === 'ambient') {
        expect(destinations).toEqual([]);
        expect(response.status).toBe(400);
        expect(response.body.error).toContain('original model endpoint');
      } else {
        expect(destinations).toEqual([gateway]);
        expect(response.status).toBe(200);
      }
    },
  );

  it('refuses an unverifiable Azure destination even when no environment was saved', async () => {
    const { calls, first, other } = await replayTargets();
    vi.stubEnv('AZURE_API_KEY', 'synthetic-azure-key');
    vi.stubEnv('AZURE_API_BASE_URL', 'http://' + first);
    onTestFinished(() => {
      vi.unstubAllEnvs();
    });
    const saved = await evaluateWithSource(
      {
        providers: [{ id: 'azure:chat:fixture' }],
        prompts: ['original'],
        tests: [{ vars: {} }],
        writeLatestResults: true,
        sharing: false,
      },
      { cache: false, showProgressBar: false, eventSource: 'library' },
    );
    testEvalIds.add(saved.id);
    expect(calls.splice(0).map(({ host }) => host)).toEqual([first]);
    vi.stubEnv('AZURE_API_BASE_URL', 'http://' + other);
    const response = await api.post('/api/eval/replay').send({
      evaluationId: saved.id,
      promptIndex: 0,
      prompt: 'edited',
    });
    expect(calls).toEqual([]);
    expect(response.status).toBe(400);
  });

  it('does not reload a live Responses instance as Chat using its display ID', async () => {
    const { calls, first, other } = await replayTargets();
    const providers = await loadApiProviders(['openai:responses:gpt-4.1', 'echo'], {
      env: { OPENAI_BASE_URL: 'http://' + first },
    });
    vi.spyOn(providers[0], 'callApi').mockResolvedValue({ output: 'original' });
    const saved = await evaluateWithSource(
      {
        providers,
        prompts: ['original'],
        tests: [{ vars: {} }],
        env: { OPENAI_API_KEY: 'suite-fixture', OPENAI_BASE_URL: 'http://' + other },
        writeLatestResults: true,
        sharing: false,
      },
      { cache: false, showProgressBar: false, eventSource: 'library' },
    );
    testEvalIds.add(saved.id);
    const replay = (promptIndex: number) =>
      api.post('/api/eval/replay').send({
        evaluationId: saved.id,
        promptIndex,
        prompt: 'edited',
      });
    expect((await replay(0)).status).toBe(400);
    expect((await replay(1)).body.output).toBe('edited');
    expect(calls).toEqual([]);
  });

  it('distinguishes graders from per-call options anywhere in the selected column', async () => {
    const saved = await evaluateWithSource(
      {
        providers: ['echo'],
        prompts: ['original'],
        tests: [{ options: { provider: 'echo', repeat: 1 } }],
        writeLatestResults: true,
        sharing: false,
      },
      { cache: false, showProgressBar: false, eventSource: 'library' },
    );
    testEvalIds.add(saved.id);
    const replay = () =>
      api.post('/api/eval/replay').send({
        evaluationId: saved.id,
        testIndex: 0,
        promptIndex: 0,
        prompt: 'edited',
      });
    expect((await replay()).body.output).toBe('edited');
    const [original] = (await saved.toEvaluateSummary()).results;
    await saved.addResult({
      ...original,
      testIdx: 1,
      testCase: { options: { apiBaseUrl: 'https://original.invalid' } },
    });
    expect((await replay()).status).toBe(400);
  });

  function mockTablePayloadRangeError(shouldThrow: (attempt: number) => boolean) {
    const originalStringify = JSON.stringify;
    let tablePayloadAttempts = 0;

    return vi
      .spyOn(JSON, 'stringify')
      .mockImplementation((...args: Parameters<typeof JSON.stringify>) => {
        const value = args[0];
        if (value && typeof value === 'object' && 'table' in value && 'totalCount' in value) {
          tablePayloadAttempts += 1;
          if (shouldThrow(tablePayloadAttempts)) {
            throw new RangeError('Invalid string length');
          }
        }
        return originalStringify.apply(JSON, args);
      });
  }

  async function setResultPromptRaws(eval_: Eval, raws: string[]) {
    const results = await eval_.getResults();
    await Promise.all(
      raws.map(async (raw, index) => {
        const result = results[index];
        invariant(result instanceof EvalResult, 'EvalResult is required');
        result.prompt = { ...result.prompt, raw };
        await result.save();
      }),
    );
  }

  function createManualRatingPayload(originalResult: any, pass: boolean) {
    const payload = { ...originalResult.gradingResult };
    const score = pass ? 1 : 0;
    payload.componentResults?.push({
      pass,
      score,
      reason: 'Manual result (overrides all other grading results)',
      assertion: { type: 'human' },
    });
    payload.reason = 'Manual result (overrides all other grading results)';
    payload.pass = pass;
    payload.score = score;
    return payload;
  }

  describe('POST /', () => {
    it('returns 500 when v4 prompt persistence fails', async () => {
      const createSpy = vi.spyOn(Eval, 'create');
      vi.spyOn(Eval.prototype, 'addPrompts').mockRejectedValueOnce(
        new Error('prompt persistence failed'),
      );

      const res = await api.post('/api/eval').send({
        config: {
          description: 'v4 save test',
          tests: [],
        },
        prompts: [{ raw: 'hello', label: 'hello' }],
        results: [],
      });

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Failed to write eval to database' });

      const createdEval = await createSpy.mock.results[0]?.value;
      if (createdEval) {
        testEvalIds.add(createdEval.id);
      }
    });
  });

  describe('post("/:evalId/results/:id/rating")', () => {
    it('rejects result ratings when the URL eval does not own the result', async () => {
      const evalA = await EvalFactory.create();
      const evalB = await EvalFactory.create();
      testEvalIds.add(evalA.id);
      testEvalIds.add(evalB.id);

      const resultsB = await evalB.getResults();
      const resultB = resultsB[0];
      invariant(resultB.id, 'Result ID is required');
      const originalResultB = {
        gradingResult: structuredClone(resultB.gradingResult),
        score: resultB.score,
        success: resultB.success,
      };
      const originalEvalAMetrics = structuredClone(evalA.prompts[resultB.promptIdx].metrics);
      const originalEvalBMetrics = structuredClone(evalB.prompts[resultB.promptIdx].metrics);

      const res = await api
        .post(`/api/eval/${evalA.id}/results/${resultB.id}/rating`)
        .send(createManualRatingPayload(resultB, false));

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Result not found');

      const updatedResultB = await EvalResult.findById(resultB.id);
      expect(updatedResultB?.gradingResult).toEqual(originalResultB.gradingResult);
      expect(updatedResultB?.score).toBe(originalResultB.score);
      expect(updatedResultB?.success).toBe(originalResultB.success);

      const updatedEvalA = await Eval.findById(evalA.id);
      const updatedEvalB = await Eval.findById(evalB.id);
      invariant(updatedEvalA, 'Eval A is required');
      invariant(updatedEvalB, 'Eval B is required');
      expect(updatedEvalA.prompts[resultB.promptIdx].metrics).toEqual(originalEvalAMetrics);
      expect(updatedEvalB.prompts[resultB.promptIdx].metrics).toEqual(originalEvalBMetrics);
    });

    it('returns a JSON 500 response when rating storage fails', async () => {
      const findByIdSpy = vi
        .spyOn(EvalResult, 'findById')
        .mockRejectedValueOnce(new Error('database unavailable'));

      const res = await api
        .post('/api/eval/eval-1/results/result-1/rating')
        .send({ pass: true, score: 1 });

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Failed to submit rating' });
      expect(findByIdSpy).toHaveBeenCalledWith('result-1');
    });

    it('returns the persisted result row so SDK clients see refreshed metrics', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);
      const results = await eval_.getResults();
      // Pick the failing result so flipping `pass=true` produces a real
      // state transition. With `results[0]` (already passing), every numeric
      // field would be unchanged and the test couldn't distinguish a fresh
      // post-rating row from a pre-rating snapshot.
      const result = results[1];
      invariant(result.id, 'Result ID is required');
      expect(result.gradingResult?.pass).toBe(false);
      expect(result.score).toBe(0);
      expect(result.success).toBe(false);

      const res = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send(createManualRatingPayload(result, true));

      expect(res.status).toBe(200);
      // The body must reflect the *post-rating* state, not just include the
      // row's id — external SDK consumers depend on reading refreshed
      // grading state without a follow-up GET. If the route ever regressed
      // to returning a pre-save snapshot or a generic `{message}` envelope,
      // the strict equality on flipped fields below would catch it.
      expect(res.body.id).toBe(result.id);
      expect(res.body.success).toBe(true);
      expect(res.body.score).toBe(1);
      expect(res.body.gradingResult?.pass).toBe(true);
      expect(res.body.gradingResult?.score).toBe(1);
      expect(res.body.gradingResult?.reason).toContain('Manual result');
    });

    it('persists the rated result before notifying through the eval save', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);
      const results = await eval_.getResults();
      const result = results[1];
      invariant(result.id, 'Result ID is required');
      const resultSaveSpy = vi.spyOn(EvalResult.prototype, 'save');
      const evalSaveSpy = vi.spyOn(Eval.prototype, 'save');

      const res = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send(createManualRatingPayload(result, true));

      expect(res.status).toBe(200);
      expect(resultSaveSpy).toHaveBeenCalledTimes(1);
      expect(evalSaveSpy).toHaveBeenCalledTimes(1);
      expect(resultSaveSpy.mock.invocationCallOrder[0]).toBeLessThan(
        evalSaveSpy.mock.invocationCallOrder[0],
      );
    });

    it('Passing test and the user marked it as passing (no change)', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);

      const results = await eval_.getResults();
      const result = results[0];
      expect(eval_.prompts[result.promptIdx].metrics?.assertPassCount).toBe(1);
      expect(eval_.prompts[result.promptIdx].metrics?.assertFailCount).toBe(1);
      expect(eval_.prompts[result.promptIdx].metrics?.testPassCount).toBe(1);
      expect(eval_.prompts[result.promptIdx].metrics?.testFailCount).toBe(1);
      expect(eval_.prompts[result.promptIdx].metrics?.score).toBe(1);

      expect(result.gradingResult?.pass).toBe(true);
      expect(result.gradingResult?.score).toBe(1);
      const ratingPayload = createManualRatingPayload(result, true);

      const res = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send(ratingPayload);

      expect(res.status).toBe(200);
      invariant(result.id, 'Result ID is required');
      const updatedResult = await EvalResult.findById(result.id);
      expect(updatedResult?.gradingResult?.pass).toBe(true);
      expect(updatedResult?.gradingResult?.score).toBe(1);
      expect(updatedResult?.gradingResult?.componentResults).toHaveLength(2);
      expect(updatedResult?.gradingResult?.reason).toBe(
        'Manual result (overrides all other grading results)',
      );

      const updatedEval = await Eval.findById(eval_.id);
      invariant(updatedEval, 'Eval is required');
      expect(updatedEval.prompts[result.promptIdx].metrics?.score).toBe(1);
      expect(updatedEval.prompts[result.promptIdx].metrics?.assertPassCount).toBe(2);
      expect(updatedEval.prompts[result.promptIdx].metrics?.assertFailCount).toBe(1);
      expect(updatedEval.prompts[result.promptIdx].metrics?.testPassCount).toBe(1);
      expect(updatedEval.prompts[result.promptIdx].metrics?.testFailCount).toBe(1);
    });

    it('Passing test and the user changed it to failing', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);

      const results = await eval_.getResults();
      const result = results[0];
      expect(eval_.prompts[result.promptIdx].metrics?.assertPassCount).toBe(1);
      expect(eval_.prompts[result.promptIdx].metrics?.assertFailCount).toBe(1);
      expect(eval_.prompts[result.promptIdx].metrics?.testPassCount).toBe(1);
      expect(eval_.prompts[result.promptIdx].metrics?.testFailCount).toBe(1);
      expect(eval_.prompts[result.promptIdx].metrics?.score).toBe(1);

      expect(result.gradingResult?.pass).toBe(true);
      expect(result.gradingResult?.score).toBe(1);
      const ratingPayload = createManualRatingPayload(result, false);
      const res = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send(ratingPayload);

      expect(res.status).toBe(200);
      invariant(result.id, 'Result ID is required');
      const updatedResult = await EvalResult.findById(result.id);
      expect(updatedResult?.gradingResult?.pass).toBe(false);
      expect(updatedResult?.gradingResult?.score).toBe(0);
      expect(updatedResult?.gradingResult?.componentResults).toHaveLength(2);
      expect(updatedResult?.gradingResult?.reason).toBe(
        'Manual result (overrides all other grading results)',
      );
      const updatedEval = await Eval.findById(eval_.id);
      invariant(updatedEval, 'Eval is required');
      expect(updatedEval.prompts[result.promptIdx].metrics?.assertPassCount).toBe(1);
      expect(updatedEval.prompts[result.promptIdx].metrics?.assertFailCount).toBe(2);
      expect(updatedEval.prompts[result.promptIdx].metrics?.score).toBe(0);
      expect(updatedEval.prompts[result.promptIdx].metrics?.testPassCount).toBe(0);
      expect(updatedEval.prompts[result.promptIdx].metrics?.testFailCount).toBe(2);
    });

    it('Failing test and the user changed it to passing', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);

      const results = await eval_.getResults();
      const result = results[1];
      expect(eval_.prompts[result.promptIdx].metrics?.assertPassCount).toBe(1);
      expect(eval_.prompts[result.promptIdx].metrics?.assertFailCount).toBe(1);
      expect(eval_.prompts[result.promptIdx].metrics?.testPassCount).toBe(1);
      expect(eval_.prompts[result.promptIdx].metrics?.testFailCount).toBe(1);
      expect(eval_.prompts[result.promptIdx].metrics?.score).toBe(1);

      expect(result.gradingResult?.pass).toBe(false);
      expect(result.gradingResult?.score).toBe(0);

      const ratingPayload = createManualRatingPayload(result, true);

      const res = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send(ratingPayload);

      expect(res.status).toBe(200);

      invariant(result.id, 'Result ID is required');

      const updatedResult = await EvalResult.findById(result.id);
      expect(updatedResult?.gradingResult?.pass).toBe(true);
      expect(updatedResult?.gradingResult?.score).toBe(1);
      expect(updatedResult?.gradingResult?.componentResults).toHaveLength(2);
      expect(updatedResult?.gradingResult?.reason).toBe(
        'Manual result (overrides all other grading results)',
      );

      const updatedEval = await Eval.findById(eval_.id);
      invariant(updatedEval, 'Eval is required');
      expect(updatedEval.prompts[result.promptIdx].metrics?.score).toBe(2);
      expect(updatedEval.prompts[result.promptIdx].metrics?.assertPassCount).toBe(2);
      expect(updatedEval.prompts[result.promptIdx].metrics?.assertFailCount).toBe(1);
      expect(updatedEval.prompts[result.promptIdx].metrics?.testPassCount).toBe(2);
      expect(updatedEval.prompts[result.promptIdx].metrics?.testFailCount).toBe(0);
    });

    it('Failing test and the user marked it as failing (no change)', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);

      const results = await eval_.getResults();
      const result = results[1];
      expect(eval_.prompts[result.promptIdx].metrics?.assertPassCount).toBe(1);
      expect(eval_.prompts[result.promptIdx].metrics?.assertFailCount).toBe(1);
      expect(eval_.prompts[result.promptIdx].metrics?.testPassCount).toBe(1);
      expect(eval_.prompts[result.promptIdx].metrics?.testFailCount).toBe(1);
      expect(eval_.prompts[result.promptIdx].metrics?.score).toBe(1);

      expect(result.gradingResult?.pass).toBe(false);
      expect(result.gradingResult?.score).toBe(0);
      const ratingPayload = createManualRatingPayload(result, false);
      const res = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send(ratingPayload);

      expect(res.status).toBe(200);
      invariant(result.id, 'Result ID is required');
      const updatedResult = await EvalResult.findById(result.id);
      expect(updatedResult?.gradingResult?.pass).toBe(false);
      expect(updatedResult?.gradingResult?.score).toBe(0);
      expect(updatedResult?.gradingResult?.componentResults).toHaveLength(2);
      expect(updatedResult?.gradingResult?.reason).toBe(
        'Manual result (overrides all other grading results)',
      );
      const updatedEval = await Eval.findById(eval_.id);
      invariant(updatedEval, 'Eval is required');
      expect(updatedEval.prompts[result.promptIdx].metrics?.assertPassCount).toBe(1);
      expect(updatedEval.prompts[result.promptIdx].metrics?.assertFailCount).toBe(2);
      expect(updatedEval.prompts[result.promptIdx].metrics?.score).toBe(1);
      expect(updatedEval.prompts[result.promptIdx].metrics?.testPassCount).toBe(1);
      expect(updatedEval.prompts[result.promptIdx].metrics?.testFailCount).toBe(1);
    });
  });

  describe('GET /:id/table - large payload handling', () => {
    it('preserves config tests returned from the table endpoint when saved back', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);
      const originalTable = await eval_.getTable();

      const res = await api.get(`/api/eval/${eval_.id}/table`);

      expect(res.status).toBe(200);
      expect(res.body.config.tests).toHaveLength(2);

      const patchRes = await api
        .patch(`/api/eval/${eval_.id}`)
        .send({ config: { ...res.body.config, description: 'renamed eval', otherField: 'value' } });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body).toEqual({ message: 'Eval updated successfully' });

      const updatedEval = await Eval.findById(eval_.id);
      invariant(updatedEval, 'Eval is required');
      expect(updatedEval.config.tests).toHaveLength(2);
      expect(updatedEval.config).toMatchObject({
        description: 'renamed eval',
        otherField: 'value',
      });
      expect(await updatedEval.getTable()).toEqual(originalTable);
    });

    it('preserves Azure Blob SAS tokens when a redacted table config is saved back', async () => {
      const sasUri =
        'az://{{ account }}/container/{{ suite }}.yaml?sp=r&sig=azure-secret&sv={{ version }}';
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);
      eval_.config.tests = sasUri;
      await eval_.save();

      const res = await api.get(`/api/eval/${eval_.id}/table`);

      expect(res.status).toBe(200);
      expect(res.body.config.tests).toBe(
        'az://{{ account }}/container/{{ suite }}.yaml?sp=r&sig=%5BREDACTED%5D&sv={{ version }}',
      );

      const patchRes = await api
        .patch(`/api/eval/${eval_.id}`)
        .send({ config: { ...res.body.config, description: 'renamed eval' } });

      expect(patchRes.status).toBe(200);

      const updatedEval = await Eval.findById(eval_.id);
      invariant(updatedEval, 'Eval is required');
      expect(updatedEval.config.tests).toBe(sasUri);
      expect(updatedEval.config.description).toBe('renamed eval');
    });

    it('returns table data with only the largest per-cell prompt stripped when possible', async () => {
      const eval_ = await EvalFactory.create({ numResults: 3 });
      testEvalIds.add(eval_.id);
      await setResultPromptRaws(eval_, ['small prompt', 'x'.repeat(100), 'x'.repeat(50)]);

      mockTablePayloadRangeError((attempt) => attempt === 1);

      const res = await api.get(`/api/eval/${eval_.id}/table`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('table');
      expect(res.body.table.body.length).toBeGreaterThan(0);
      expect(res.body.config.tests).toHaveLength(2);

      const prompts: Array<string | undefined> = res.body.table.body.flatMap(
        (row: { outputs: Array<{ prompt?: string }> }) =>
          row.outputs.map((output) => output?.prompt),
      );
      expect(prompts.filter((prompt) => prompt === STRIPPED_TABLE_CELL_PROMPT)).toHaveLength(1);
      expect(prompts).toContain('small prompt');
      expect(prompts).toContain('x'.repeat(50));
    });

    it('strips per-cell prompts largest first until the response serializes', async () => {
      const eval_ = await EvalFactory.create({ numResults: 3 });
      testEvalIds.add(eval_.id);
      await setResultPromptRaws(eval_, ['small prompt', 'x'.repeat(100), 'x'.repeat(50)]);

      mockTablePayloadRangeError((attempt) => attempt <= 2);

      const res = await api.get(`/api/eval/${eval_.id}/table`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('table');
      expect(res.body.config.tests).toHaveLength(2);

      const prompts: Array<string | undefined> = res.body.table.body.flatMap(
        (row: { outputs: Array<{ prompt?: string }> }) =>
          row.outputs.map((output) => output?.prompt),
      );
      expect(prompts.filter((prompt) => prompt === STRIPPED_TABLE_CELL_PROMPT)).toHaveLength(2);
      expect(prompts).toContain('small prompt');
    });

    it('returns 413 when the table response is still too large after stripping prompts', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);

      mockTablePayloadRangeError(() => true);

      const res = await api.get(`/api/eval/${eval_.id}/table`);

      expect(res.status).toBe(413);
      expect(res.body).toEqual({
        error: 'Eval too large to display. Try reducing the page size.',
      });
    });
  });

  describe('GET /:id/metadata-keys', () => {
    it('should return metadata keys for valid eval', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);

      // Add eval results with metadata using direct database insert
      const { getDb } = await import('../../src/database');
      const db = await getDb();
      await db.run(
        `INSERT INTO eval_results (
          id, eval_id, prompt_idx, test_idx, test_case, prompt, provider,
          success, score, metadata
        ) VALUES
        ('result1', '${eval_.id}', 0, 0, '{}', '{}', '{}', 1, 1.0, '{"key1": "value1", "key2": "value2"}'),
        ('result2', '${eval_.id}', 0, 1, '{}', '{}', '{}', 1, 1.0, '{"key2": "value3", "key3": "value4"}')`,
      );

      const res = await api.get(`/api/eval/${eval_.id}/metadata-keys`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('keys');
      expect(res.body.keys).toEqual(expect.arrayContaining(['key1', 'key2', 'key3']));
    });

    it('should return 404 for non-existent eval', async () => {
      const res = await api.get('/api/eval/non-existent-id/metadata-keys');

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error', 'Eval not found');
    });

    it('should return empty keys array for eval with no metadata', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);

      const res = await api.get(`/api/eval/${eval_.id}/metadata-keys`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('keys');
      expect(res.body.keys).toEqual([]);
    });
  });
});
