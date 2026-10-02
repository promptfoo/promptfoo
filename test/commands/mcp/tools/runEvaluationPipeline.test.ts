import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';

import input from '@inquirer/input';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enableCache, isCacheEnabled } from '../../../../src/cache';
import cliState from '../../../../src/cliState';
import { registerRunEvaluationTool } from '../../../../src/commands/mcp/tools/runEvaluation';
import * as envars from '../../../../src/envars';
import * as accounts from '../../../../src/globalConfig/accounts';
import logger from '../../../../src/logger';
import { runDbMigrations } from '../../../../src/migrate';
import Eval from '../../../../src/models/eval';
import { doEval } from '../../../../src/node/doEval';
import { AwsBedrockConverseProvider } from '../../../../src/providers/bedrock/converse';
import { EchoProvider } from '../../../../src/providers/echo';
import { GeminiImageProvider } from '../../../../src/providers/google/gemini-image';
import { GoogleImageProvider } from '../../../../src/providers/google/image';
import { GoogleLiveProvider } from '../../../../src/providers/google/live';
import { VertexLiveProvider } from '../../../../src/providers/google/vertexLive';
import { HuggingfaceTextGenerationProvider } from '../../../../src/providers/huggingface';
import { OpenCodeSDKProvider } from '../../../../src/providers/opencode-sdk';
import { PythonProvider } from '../../../../src/providers/pythonCompletion';
import { PythonWorker } from '../../../../src/python/worker';
import { createShareableUrl, isSharingEnabled } from '../../../../src/share';
import * as suggestions from '../../../../src/suggestions';
import { BAD_EMAIL_RESULT, EMAIL_OK_STATUS } from '../../../../src/types/email';
import * as cloud from '../../../../src/util/cloud';
import * as readline from '../../../../src/util/readline';
import { mockProcessEnv } from '../../../util/utils';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

vi.mock('../../../../src/telemetry', () => ({
  default: { record: vi.fn(), send: vi.fn() },
}));
vi.mock('@inquirer/input', () => ({ default: vi.fn() }));
vi.mock('../../../../src/util/config/default', () => ({
  loadDefaultConfig: vi.fn(async () => ({ defaultConfig: {}, defaultConfigPath: undefined })),
}));
vi.mock('../../../../src/share', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../src/share')>()),
  createShareableUrl: vi.fn(),
  isSharingEnabled: vi.fn(),
}));

const selections = [
  { label: 'unfiltered', filters: {} },
  { label: 'test index', filters: { testCaseIndices: 0 } },
  { label: 'prompt index', filters: { promptFilter: '0' } },
  { label: 'provider', filters: { providerFilter: 'echo' } },
];

describe('MCP evaluation execution contract', () => {
  let restoreEnv: () => void;
  let directory: string;
  let configPath: string;
  let originalState: Record<string, unknown>;
  let server: Server | undefined;
  let responseTimer: ReturnType<typeof setTimeout> | undefined;
  const originalIsTTY = process.stdout.isTTY;

  beforeEach(async () => {
    restoreEnv = mockProcessEnv();
    originalState = Object.fromEntries(
      Object.entries(cliState).filter(
        ([key]) => Object.getOwnPropertyDescriptor(cliState, key)?.writable,
      ),
    );
    vi.mocked(createShareableUrl).mockReset().mockResolvedValue('https://example.test/eval');
    vi.mocked(isSharingEnabled).mockReset().mockReturnValue(true);
    directory = await mkdtemp(path.join(os.tmpdir(), 'mcp-evaluation-pipeline-'));
    configPath = path.join(directory, 'promptfooconfig.json');
    await writeFile(
      configPath,
      JSON.stringify({
        providers: ['echo'],
        prompts: ['Hello {{name}}'],
        tests: [{ vars: { name: 'Ada' }, assert: [{ type: 'equals', value: 'Hello Ada' }] }],
      }),
    );
    await runDbMigrations();
  });

  afterEach(async () => {
    if (responseTimer) {
      clearTimeout(responseTimer);
      responseTimer = undefined;
    }
    if (server) {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = undefined;
    }
    enableCache();
    process.stdout.isTTY = originalIsTTY;
    Object.assign(cliState, originalState);
    vi.restoreAllMocks();
    restoreEnv();
    await rm(directory, { recursive: true, force: true });
  });

  async function run(options: Record<string, unknown>) {
    const tool = vi.fn();
    registerRunEvaluationTool({ tool } as unknown as McpServer);
    const handler = tool.mock.calls[0][2];
    const result = await handler({ configPath, cache: false, share: false, ...options });
    return JSON.parse(result.content[0].text);
  }

  it.each(selections)('honors repeat and no-write for $label runs', async ({ filters }) => {
    const response = await run({ ...filters, repeat: 3, write: false });
    expect(response.success, response.error).toBe(true);
    expect(response.data.results.totalEvals).toBe(3);
    expect(response.data.results.stats).toMatchObject({ successes: 3, failures: 0, errors: 0 });
    expect(await Eval.findById(response.data.eval.id)).toBeUndefined();
    expect(createShareableUrl).not.toHaveBeenCalled();
  });

  describe.each(['evaluateOptions', 'commandLineOptions'])('%s prompt suggestions', (source) => {
    it.each(selections)(
      'rejects interactive suggestions before generation for $label',
      async ({ filters }) => {
        const generate = vi
          .spyOn(suggestions, 'generatePrompts')
          .mockResolvedValue({ prompts: ['Suggested prompt'], tokensUsed: {} });
        const prompt = vi.spyOn(readline, 'promptYesNo').mockResolvedValue(false);
        await writeFile(
          configPath,
          JSON.stringify({
            providers: ['echo'],
            prompts: ['Hello'],
            tests: [{ vars: {} }],
            [source]: { generateSuggestions: true },
          }),
        );
        const response = await run(filters);
        expect(response.success).toBe(false);
        expect(response.error).toContain(
          'Interactive prompt suggestions are not supported over MCP',
        );
        expect(generate).not.toHaveBeenCalled();
        expect(prompt).not.toHaveBeenCalled();
      },
    );
  });

  it.each([undefined, 9])(
    'preserves later Python worker allocation after rejection with prior concurrency %s',
    async (priorConcurrency) => {
      const originalConcurrency = cliState.maxConcurrency;
      const initialize = vi.spyOn(PythonWorker.prototype, 'initialize').mockResolvedValue();
      const python = new PythonProvider('unused-worker-fixture.py');
      vi.stubEnv('PROMPTFOO_PYTHON_WORKERS', undefined);
      try {
        cliState.maxConcurrency = priorConcurrency;
        await writeFile(
          configPath,
          JSON.stringify({
            providers: ['echo'],
            prompts: ['Hello'],
            tests: [{ vars: {} }],
            evaluateOptions: { generateSuggestions: true },
          }),
        );
        const response = await run({ testCaseIndices: 0, maxConcurrency: 20, write: false });
        expect(response.success).toBe(false);
        expect(response.error).toContain('Interactive prompt suggestions are not supported');
        await python.initialize();
        expect(initialize).toHaveBeenCalledTimes(priorConcurrency ?? 1);
        expect(cliState.maxConcurrency).toBe(priorConcurrency);
      } finally {
        await python.shutdown();
        cliState.maxConcurrency = originalConcurrency;
      }
    },
  );

  it('isolates concurrency while overlapping requests finish in reverse order', async () => {
    const originalConcurrency = cliState.maxConcurrency;
    const deferred = () => {
      let resolve!: () => void;
      const promise = new Promise<void>((complete) => {
        resolve = complete;
      });
      return { promise, resolve };
    };
    const gates = {
      A: { started: deferred(), resume: deferred() },
      B: { started: deferred(), resume: deferred() },
    };
    const observations: Record<string, (number | undefined)[]> = {};
    vi.spyOn(EchoProvider.prototype, 'callApi').mockImplementation(async (prompt) => {
      const gate = gates[prompt as keyof typeof gates];
      observations[prompt] = [cliState.maxConcurrency];
      gate.started.resolve();
      await gate.resume.promise;
      observations[prompt].push(cliState.maxConcurrency);
      return { output: prompt };
    });
    await writeFile(
      configPath,
      JSON.stringify({ providers: ['echo'], prompts: ['A', 'B'], tests: [{ vars: {} }] }),
    );
    const pending: Promise<unknown>[] = [];
    try {
      cliState.maxConcurrency = undefined;
      const first = run({ promptFilter: '0', maxConcurrency: 2, write: false });
      pending.push(first);
      await gates.A.started.promise;
      const second = run({ promptFilter: '1', maxConcurrency: 7, write: false });
      pending.push(second);
      await gates.B.started.promise;
      const outsideConcurrency = cliState.maxConcurrency;
      gates.B.resume.resolve();
      const secondResult = await second;
      gates.A.resume.resolve();
      const firstResult = await first;
      expect(firstResult.success, firstResult.error).toBe(true);
      expect(secondResult.success, secondResult.error).toBe(true);
      expect(outsideConcurrency).toBeUndefined();
      expect(observations).toEqual({ A: [2, 2], B: [7, 7] });
      expect(cliState.maxConcurrency).toBeUndefined();
    } finally {
      gates.A.resume.resolve();
      gates.B.resume.resolve();
      await Promise.allSettled(pending);
      cliState.maxConcurrency = originalConcurrency;
    }
  });

  it.each(selections)(
    'honors explicit false over enabled suggestion defaults for $label',
    async ({ filters }) => {
      const generate = vi.spyOn(suggestions, 'generatePrompts');
      await writeFile(
        configPath,
        JSON.stringify({
          providers: ['echo'],
          prompts: ['Hello'],
          tests: [{ vars: {} }],
          evaluateOptions: { generateSuggestions: true },
          commandLineOptions: { generateSuggestions: false },
        }),
      );
      const response = await run(filters);
      expect(response.success, response.error).toBe(true);
      expect(response.data.results.totalEvals).toBe(1);
      expect(generate).not.toHaveBeenCalled();
    },
  );

  it('keeps detailed filter errors out of logs when provider URLs contain credentials', async () => {
    const log = vi.spyOn(logger, 'error');
    const providerId =
      'https://fixture-user:fixture-password@example.test/eval?api_key=fixture-query-secret';
    const filter = 'unmatched-filter-secret';
    await writeFile(
      configPath,
      JSON.stringify({
        providers: [{ id: providerId, config: { body: { prompt: '{{prompt}}' } } }],
        prompts: ['Hello'],
        tests: [{ vars: {} }],
      }),
    );
    const response = await run({ providerFilter: filter });
    expect(response.success).toBe(false);
    expect(response.error).toContain(`No providers matched filter: ${filter}`);
    expect(response.error).toContain(`Available providers: ${providerId}`);
    expect(log).toHaveBeenCalled();
    const logs = JSON.stringify(log.mock.calls);
    for (const secret of ['fixture-user', 'fixture-password', 'fixture-query-secret', filter]) {
      expect(logs).not.toContain(secret);
    }
  });

  it.each([{}, { testCaseIndices: 0 }])(
    'keeps provider URL credentials out of failure summaries with filters %j',
    async (filters) => {
      const log = vi.spyOn(logger, 'debug');
      const requests: string[] = [];
      server = createServer((request, response) => {
        requests.push(request.url!);
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ output: 'actual output' }));
      });
      await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
      const address = server.address();
      expect(address && typeof address !== 'string').toBe(true);
      const secret = 'fixture-failed-assertion-query-secret';
      const providerId = `http://127.0.0.1:${(address as { port: number }).port}/eval?api_key=${secret}`;
      await writeFile(
        configPath,
        JSON.stringify({
          providers: [
            {
              id: providerId,
              config: { body: { prompt: '{{prompt}}' }, responseParser: 'json.output' },
            },
          ],
          prompts: ['Hello'],
          tests: [{ assert: [{ type: 'equals', value: 'expected output' }] }],
        }),
      );

      const response = await run({ ...filters, write: false });
      expect(response.success, response.error).toBe(true);
      expect(response.data.results.stats).toMatchObject({ successes: 0, failures: 1, errors: 0 });
      expect(requests).toEqual([`/eval?api_key=${secret}`]);
      // String messages bypass logger context sanitization.
      for (const [message] of log.mock.calls) {
        expect(message).not.toContain(secret);
      }
    },
  );

  it('sanitizes provider URLs in multi-provider token summaries', async () => {
    const log = vi.spyOn(logger, 'info');
    const requests: string[] = [];
    server = createServer((request, response) => {
      requests.push(request.url!);
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(
        JSON.stringify({ output: 'Hello', tokenUsage: { total: 2, prompt: 1, completion: 1 } }),
      );
    });
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const address = server.address() as { port: number };
    const secret = 'fixture-token-summary-query-secret';
    await writeFile(
      configPath,
      JSON.stringify({
        providers: ['one', 'two'].map((name) => ({
          id: `http://127.0.0.1:${address.port}/${name}?api_key=${secret}`,
          config: { body: { prompt: '{{prompt}}' }, responseParser: 'json.output' },
        })),
        prompts: ['Hello'],
        tests: [{ assert: [{ type: 'equals', value: 'Hello' }] }],
      }),
    );
    const response = await run({ testCaseIndices: 0, write: false });
    expect(response.success, response.error).toBe(true);
    expect(response.data.results.stats).toMatchObject({ successes: 2, failures: 0, errors: 0 });
    expect(requests).toHaveLength(2);
    const messages = log.mock.calls.map(([message]) => String(message)).join('\n');
    expect(messages).toContain('Providers:');
    expect(messages).toContain('/one?');
    expect(messages).toContain('/two?');
    expect(messages).not.toContain(secret);
  });

  it.each([
    { command: { generateSuggestions: true }, options: {} },
    { command: {}, options: { generateSuggestions: true } },
    { command: { suggestPrompts: 1, generateSuggestions: false }, options: {} },
  ])('rejects effective caller suggestion options for MCP: %j', async ({ command, options }) => {
    const generate = vi
      .spyOn(suggestions, 'generatePrompts')
      .mockResolvedValue({ prompts: ['Suggested prompt'], tokensUsed: {} });
    const prompt = vi.spyOn(readline, 'promptYesNo').mockResolvedValue(false);
    await expect(
      doEval({ config: [configPath], write: false, share: false, ...command }, {}, undefined, {
        eventSource: 'mcp',
        showProgressBar: false,
        ...options,
      }),
    ).rejects.toThrow('Interactive prompt suggestions are not supported over MCP');
    expect(generate).not.toHaveBeenCalled();
    expect(prompt).not.toHaveBeenCalled();
  });

  it('allows an explicit caller false to override enabled suggestions for MCP', async () => {
    const generate = vi.spyOn(suggestions, 'generatePrompts');
    const result = await doEval(
      { config: [configPath], write: false, share: false, generateSuggestions: false },
      {},
      undefined,
      {
        eventSource: 'mcp',
        showProgressBar: false,
        generateSuggestions: true,
      },
    );
    expect((await result.toEvaluateSummary()).stats.successes).toBe(1);
    expect(generate).not.toHaveBeenCalled();
  });

  it.each(selections)('honors explicit sharing for $label runs', async ({ filters }) => {
    const response = await run({ ...filters, share: true, write: false });
    expect(response.success, response.error).toBe(true);
    expect(createShareableUrl).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ id: response.data.eval.id }),
      { silent: true, interactive: false },
    );
  });

  it.each([false, true])(
    'completes real self-hosted sharing without a TTY prompt with filtering=%s',
    async (filtered) => {
      const actualShare =
        await vi.importActual<typeof import('../../../../src/share')>('../../../../src/share');
      vi.mocked(createShareableUrl).mockImplementation(actualShare.createShareableUrl);
      vi.spyOn(accounts, 'getAuthor').mockReturnValue(null);
      vi.spyOn(accounts, 'getUserEmail').mockReturnValue(null);
      vi.spyOn(envars, 'isCI').mockReturnValue(false);
      vi.stubEnv('PROMPTFOO_DISABLE_SHARE_EMAIL_REQUEST', undefined);
      vi.mocked(input).mockReset().mockRejectedValue(new Error('Unexpected interactive prompt'));
      process.stdout.isTTY = true;
      const requests: string[] = [];
      server = createServer(async (request, response) => {
        for await (const _chunk of request) {
          /* Consume upload before responding. */
        }
        requests.push(request.url!);
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify({ id: 'shared-fixture' }));
      });
      await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error('Expected TCP address');
      }
      const localUrl = `http://127.0.0.1:${address.port}`;
      await writeFile(
        configPath,
        JSON.stringify({
          providers: ['echo'],
          prompts: ['Hello'],
          tests: [{ assert: [{ type: 'equals', value: 'Hello' }] }],
          sharing: { apiBaseUrl: localUrl, appBaseUrl: localUrl },
        }),
      );
      const response = await run({
        ...(filtered ? { testCaseIndices: 0 } : {}),
        share: true,
        write: false,
      });
      expect(response.success, response.error).toBe(true);
      expect(input).not.toHaveBeenCalled();
      expect(requests).toContain('/api/eval');
    },
  );

  it('runs a selected test without requiring keys for its excluded providers', async () => {
    vi.stubEnv('OPENAI_API_KEY', undefined);
    await writeFile(
      configPath,
      JSON.stringify({
        providers: ['echo', 'openai:gpt-4.1'],
        prompts: ['Hello'],
        tests: [{ providers: ['echo'], assert: [{ type: 'equals', value: 'Hello' }] }],
      }),
    );
    const response = await run({ testCaseIndices: 0, write: false });
    expect(response.success, response.error).toBe(true);
    expect(response.data.results.stats).toMatchObject({ successes: 1, failures: 0, errors: 0 });
  });

  it.each(['Authorization', 'authorization'])(
    'preserves filtered TTS gateway authentication through the %s header',
    async (header) => {
      vi.stubEnv('OPENAI_API_KEY', undefined);
      const requests: string[] = [];
      server = createServer(async (request, response) => {
        for await (const _chunk of request) {
          /* Consume the TTS request. */
        }
        requests.push(request.headers.authorization!);
        response.writeHead(200, { 'content-type': 'audio/wav' });
        response.end(Buffer.from('RIFF0000WAVEowned-local-audio'));
      });
      await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error('Expected TCP address');
      }
      await writeFile(
        configPath,
        JSON.stringify({
          providers: [
            {
              id: 'openai:tts:tts-1',
              config: {
                apiBaseUrl: `http://127.0.0.1:${address.port}/v1`,
                headers: { [header]: 'Bearer owned-synthetic-header' },
              },
            },
          ],
          prompts: ['Hello'],
          tests: [{ vars: {} }],
        }),
      );
      const response = await run({ testCaseIndices: 0, write: false });
      expect(response.success, response.error).toBe(true);
      expect(response.data.results.stats).toMatchObject({ successes: 1, failures: 0, errors: 0 });
      expect(requests).toEqual(['Bearer owned-synthetic-header']);
    },
  );

  it('checks only selected cloud references without resolved credentials', async () => {
    const allowed = 'promptfoo://provider/11111111-1111-4111-8111-111111111111';
    const excluded = 'promptfoo://provider/22222222-2222-4222-8222-222222222222';
    vi.spyOn(cloud, 'getProviderFromCloud').mockImplementation(async (id) => ({
      id: 'echo',
      label: id.startsWith('1111') ? 'Allowed target' : 'Excluded target',
      config: { apiKey: 'resolved-fixture-secret' },
    }));
    const permissions = vi
      .spyOn(cloud, 'checkCloudPermissions')
      .mockImplementation(async (config) => {
        if (JSON.stringify(config.providers).includes(excluded)) {
          throw new Error('Excluded target denied');
        }
      });
    await writeFile(
      configPath,
      JSON.stringify({
        providers: [allowed, excluded],
        prompts: ['Hello'],
        tests: [{ vars: {} }],
        metadata: { teamId: 'fixture-team' },
      }),
    );

    const response = await run({ providerFilter: 'Allowed target', write: false });
    expect(response.success, response.error).toBe(true);
    expect(permissions).toHaveBeenCalledOnce();
    const checked = permissions.mock.calls[0][0];
    expect(checked.providers).toEqual([allowed]);
    expect(checked.metadata).toEqual({ teamId: 'fixture-team' });
    expect(JSON.stringify(checked.providers)).not.toContain('resolved-fixture-secret');
  });

  it('keeps the selected provider configuration for sharing and replay', async () => {
    const selected = { id: 'echo', label: 'Allowed', config: { custom: 'preserve-for-replay' } };
    const permissions = vi
      .spyOn(cloud, 'checkCloudPermissions')
      .mockImplementation(async (config) => {
        if (JSON.stringify(config.providers).includes('Excluded')) {
          throw new Error('Excluded target denied');
        }
      });
    vi.mocked(createShareableUrl).mockImplementation(async (evalRecord) => {
      await cloud.checkCloudPermissions(evalRecord.config);
      return 'https://example.test/selected';
    });
    await writeFile(
      configPath,
      JSON.stringify({
        providers: [selected, { id: 'echo', label: 'Excluded' }],
        prompts: ['Hello'],
        tests: [{ vars: {} }],
      }),
    );

    const response = await run({ providerFilter: 'Allowed', share: true, write: true });
    expect(response.success, response.error).toBe(true);
    expect(permissions).toHaveBeenCalledTimes(2);
    expect(permissions.mock.calls[1][0].providers).toEqual([selected]);
    const saved = await Eval.findById(response.data.eval.id);
    expect(saved?.config.providers).toEqual([selected]);
  });

  it.each(['test', 'default', 'scenario'])(
    'checks only providers eligible for the selected %s cases',
    async (source) => {
      const selected = { id: 'echo', label: 'Allowed' };
      const permissions = vi
        .spyOn(cloud, 'checkCloudPermissions')
        .mockImplementation(async (config) => {
          if (JSON.stringify(config.providers).includes('Excluded')) {
            throw new Error('Excluded target denied');
          }
        });
      await writeFile(
        configPath,
        JSON.stringify({
          providers: [selected, { id: 'echo', label: 'Excluded' }],
          prompts: ['Hello'],
          ...(source === 'scenario'
            ? { scenarios: [{ config: [{ providers: ['Allowed'] }], tests: [{ vars: {} }] }] }
            : {
                tests:
                  source === 'test'
                    ? [
                        { vars: {}, providers: ['Allowed'] },
                        { vars: {}, providers: ['Excluded'] },
                      ]
                    : [{ vars: {} }],
                ...(source === 'default' ? { defaultTest: { providers: ['Allowed'] } } : {}),
              }),
        }),
      );

      const response = await run({
        ...(source === 'test' ? { testCaseIndices: 0 } : { promptFilter: '0' }),
        write: false,
      });
      expect(response.success, response.error).toBe(true);
      expect(response.data.results.stats).toMatchObject({ successes: 1, failures: 0, errors: 0 });
      expect(permissions.mock.calls[0][0].providers).toEqual([selected]);
    },
  );

  it.each([{ providers: ['Excluded'] }, { providers: undefined }])(
    'keeps the union of providers allowed by selected tests with $providers',
    async ({ providers }) => {
      const configured = [
        { id: 'echo', label: 'Allowed' },
        { id: 'echo', label: 'Excluded' },
      ];
      const permissions = vi.spyOn(cloud, 'checkCloudPermissions').mockResolvedValue();
      await writeFile(
        configPath,
        JSON.stringify({
          providers: configured,
          prompts: ['Hello'],
          tests: [
            { vars: {}, providers: ['Allowed'] },
            { vars: {}, providers },
          ],
        }),
      );
      const response = await run({ testCaseIndices: [0, 1], write: false });
      expect(response.success, response.error).toBe(true);
      expect(permissions.mock.calls[0][0].providers).toEqual(configured);
      expect(response.data.results.totalEvals).toBe(providers ? 2 : 3);
    },
  );

  it.each(['default', 'scenario'])(
    'lets a test override a %s provider restriction',
    async (source) => {
      const selected = { id: 'echo', label: 'Override' };
      const permissions = vi.spyOn(cloud, 'checkCloudPermissions').mockResolvedValue();
      const test = { vars: {}, providers: ['Override'] };
      await writeFile(
        configPath,
        JSON.stringify({
          providers: [{ id: 'echo', label: 'Default' }, selected],
          prompts: ['Hello'],
          defaultTest: { providers: ['Default'] },
          ...(source === 'scenario'
            ? { scenarios: [{ config: [{ providers: ['Default'] }], tests: [test] }] }
            : { tests: [test] }),
        }),
      );
      const response = await run({ promptFilter: '0', write: false });
      expect(response.success, response.error).toBe(true);
      expect(permissions.mock.calls[0][0].providers).toEqual([selected]);
      expect(response.data.results.totalEvals).toBe(1);
    },
  );

  it('preserves the linked cloud identity of a selected local provider', async () => {
    const target = 'promptfoo://provider/33333333-3333-4333-8333-333333333333';
    vi.spyOn(cloud, 'validateLinkedTargetId').mockResolvedValue();
    const permissions = vi.spyOn(cloud, 'checkCloudPermissions').mockResolvedValue();
    await writeFile(
      configPath,
      JSON.stringify({
        providers: [
          {
            id: 'echo',
            label: 'Selected',
            config: { linkedTargetId: target, apiKey: 'fixture-secret' },
          },
          { id: 'echo', label: 'Excluded' },
        ],
        prompts: ['Hello'],
        tests: [{ vars: {} }],
      }),
    );
    const response = await run({ providerFilter: 'Selected', write: false });
    expect(response.success, response.error).toBe(true);
    expect(permissions).toHaveBeenCalledOnce();
    expect(permissions.mock.calls[0][0].providers).toEqual([
      {
        id: 'echo',
        label: 'Selected',
        config: { linkedTargetId: target, apiKey: 'fixture-secret' },
      },
    ]);
  });

  it('preserves permission rejection for a selected provider', async () => {
    vi.spyOn(cloud, 'checkCloudPermissions').mockRejectedValue(new Error('Selected target denied'));
    const call = vi.spyOn(EchoProvider.prototype, 'callApi');
    const response = await run({ providerFilter: 'echo', write: false });
    expect(response.success).toBe(false);
    expect(response.error).toContain('Selected target denied');
    expect(call).not.toHaveBeenCalled();
  });

  it('cleans constructed providers when a later test source fails to resolve', async () => {
    const cleanup = vi.spyOn(AwsBedrockConverseProvider.prototype, 'cleanup').mockResolvedValue();
    await writeFile(
      configPath,
      JSON.stringify({
        providers: ['bedrock:converse:anthropic.claude-3-5-sonnet-20240620-v1:0'],
        prompts: ['Hello'],
        tests: 'file://missing-tests.json',
      }),
    );
    const response = await run({ testCaseIndices: 0, write: false });
    expect(response.success).toBe(false);
    expect(response.error).toContain('missing-tests.json');
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it.each([false, true])(
    'cleans providers removed by selection after suggestions=%s',
    async (generateSuggestions) => {
      const cleanup = vi.spyOn(AwsBedrockConverseProvider.prototype, 'cleanup').mockResolvedValue();
      await writeFile(
        configPath,
        JSON.stringify({
          providers: ['echo', 'bedrock:converse:anthropic.claude-3-5-sonnet-20240620-v1:0'],
          prompts: ['Hello'],
          tests: [{ vars: {} }],
          evaluateOptions: { generateSuggestions },
        }),
      );
      const response = await run({ providerFilter: 'echo', write: false });
      expect(response.success).toBe(!generateSuggestions);
      if (generateSuggestions) {
        expect(response.error).toContain(
          'Interactive prompt suggestions are not supported over MCP',
        );
      }
      expect(cleanup).toHaveBeenCalledOnce();
    },
  );

  it.each(['test', 'default', 'scenario'])(
    'cleans resolved %s providers after suggestions reject',
    async (location) => {
      const cleanup = vi.spyOn(AwsBedrockConverseProvider.prototype, 'cleanup').mockResolvedValue();
      const test = {
        provider: 'bedrock:converse:anthropic.claude-3-5-sonnet-20240620-v1:0',
        vars: {},
      };
      await writeFile(
        configPath,
        JSON.stringify({
          providers: ['echo'],
          prompts: ['Hello'],
          tests: location === 'test' ? [test] : [{ vars: {} }],
          ...(location === 'default' ? { defaultTest: test } : {}),
          ...(location === 'scenario' ? { scenarios: [{ config: [{}], tests: [test] }] } : {}),
          evaluateOptions: { generateSuggestions: true },
        }),
      );
      const response = await run({ testCaseIndices: 0, write: false });
      expect(response.success).toBe(false);
      expect(response.error).toContain('Interactive prompt suggestions are not supported over MCP');
      expect(cleanup).toHaveBeenCalledOnce();
    },
  );

  it('preserves the original evaluation failure when provider cleanup rejects', async () => {
    const cleanup = vi
      .spyOn(AwsBedrockConverseProvider.prototype, 'cleanup')
      .mockResolvedValue()
      .mockRejectedValueOnce(new Error('Owned cleanup failure'));
    await writeFile(
      configPath,
      JSON.stringify({
        providers: [
          'echo',
          'bedrock:converse:anthropic.claude-3-5-sonnet-20240620-v1:0',
          'bedrock:converse:anthropic.claude-3-haiku-20240307-v1:0',
        ],
        prompts: ['Hello'],
        tests: [{ vars: {} }],
        evaluateOptions: { generateSuggestions: true },
      }),
    );
    const response = await run({ providerFilter: 'echo', write: false });
    expect(response.success).toBe(false);
    expect(response.error).toContain('Interactive prompt suggestions are not supported over MCP');
    expect(cleanup).toHaveBeenCalledTimes(2);
  });

  it.each([undefined, 42])(
    'reports MCP cleanup failure with ambient exit code %s',
    async (exitCode) => {
      const previousExitCode = process.exitCode;
      process.exitCode = exitCode;
      try {
        const cleanup = vi
          .spyOn(AwsBedrockConverseProvider.prototype, 'cleanup')
          .mockRejectedValue(new Error('Owned cleanup failure'));
        await writeFile(
          configPath,
          JSON.stringify({
            providers: ['echo', 'bedrock:converse:anthropic.claude-3-5-sonnet-20240620-v1:0'],
            prompts: ['Hello'],
            tests: [{ vars: {} }],
          }),
        );
        const response = await run({ providerFilter: 'echo', write: false });
        expect(response.success).toBe(false);
        expect(response.error).toContain('Owned cleanup failure');
        expect(cleanup).toHaveBeenCalledOnce();
      } finally {
        process.exitCode = previousExitCode;
      }
    },
  );

  describe.each([
    { id: 'google:gemini-3.1-flash-image', prototype: GeminiImageProvider.prototype },
    { id: 'google:image:imagen-3.0-generate-002', prototype: GoogleImageProvider.prototype },
  ])('$id missing image authentication', ({ id, prototype }) => {
    it.each([false, true])(
      'preserves preflight versus runtime authentication with filtering=%s',
      async (filtered) => {
        for (const key of [
          'GOOGLE_API_KEY',
          'GOOGLE_GENERATIVE_AI_API_KEY',
          'GEMINI_API_KEY',
          'GOOGLE_CLOUD_PROJECT',
          'GOOGLE_PROJECT_ID',
        ]) {
          vi.stubEnv(key, undefined);
        }
        const call = vi.spyOn(prototype, 'callApi');
        await writeFile(
          configPath,
          JSON.stringify({
            providers: [id],
            prompts: ['Hello'],
            tests: [{ assert: [{ type: 'equals', value: 'Hello' }] }],
          }),
        );
        const response = await run({ ...(filtered ? { testCaseIndices: 0 } : {}), write: false });
        if (filtered) {
          expect(response.success, response.error).toBe(true);
          expect(response.data.results.stats).toMatchObject({ successes: 0, errors: 1 });
          expect(call).toHaveBeenCalledOnce();
        } else {
          expect(response.success).toBe(false);
          expect(response.error).toContain('Missing required API keys');
          expect(call).not.toHaveBeenCalled();
        }
      },
    );
  });

  describe.each([
    {
      id: 'google:gemini-3.1-flash-image',
      config: { projectId: 'fixture-project' },
      prototype: GeminiImageProvider.prototype,
    },
    {
      id: 'google:image:imagen-3.0-generate-002',
      config: { projectId: 'fixture-project' },
      prototype: GoogleImageProvider.prototype,
    },
    {
      id: 'huggingface:text-generation:fixture-model',
      config: { apiEndpoint: 'http://127.0.0.1:12345/generate' },
      prototype: HuggingfaceTextGenerationProvider.prototype,
    },
    {
      id: 'opencode:sdk',
      config: { baseUrl: 'http://127.0.0.1:12345' },
      prototype: OpenCodeSDKProvider.prototype,
    },
    {
      id: 'opencode:sdk',
      config: { apiKeyRequired: false },
      prototype: OpenCodeSDKProvider.prototype,
    },
    {
      id: 'google:live:gemini-2.0-flash-live-001',
      config: { credentials: { client_email: 'fixture@example.com', private_key: 'fixture' } },
      prototype: GoogleLiveProvider.prototype,
    },
    {
      id: 'google:live:gemini-2.0-flash-live-001',
      config: {},
      prototype: GoogleLiveProvider.prototype,
    },
    {
      id: 'vertex:live:gemini-2.0-flash-live-001',
      config: { projectId: 'fixture-project' },
      prototype: VertexLiveProvider.prototype,
    },
  ])('$id historical authentication dispatch', ({ id, config, prototype }) => {
    it.each([false, true])('preserves provider dispatch with filtering=%s', async (filtered) => {
      for (const key of [
        'ANTHROPIC_API_KEY',
        'OPENAI_API_KEY',
        'GOOGLE_API_KEY',
        'GEMINI_API_KEY',
        'GOOGLE_GENERATIVE_AI_API_KEY',
        'HF_TOKEN',
        'HF_API_TOKEN',
      ]) {
        vi.stubEnv(key, undefined);
      }
      const call = vi.spyOn(prototype, 'callApi').mockResolvedValue({ output: 'Hello' });
      await writeFile(
        configPath,
        JSON.stringify({
          providers: [{ id, config }],
          prompts: ['Hello'],
          tests: [{ assert: [{ type: 'equals', value: 'Hello' }] }],
        }),
      );
      const response = await run({ ...(filtered ? { testCaseIndices: 0 } : {}), write: false });
      if (filtered || ('apiKeyRequired' in config && config.apiKeyRequired === false)) {
        expect(response.success, response.error).toBe(true);
        expect(response.data.results.stats).toMatchObject({ successes: 1, failures: 0, errors: 0 });
        expect(call).toHaveBeenCalledOnce();
      } else {
        expect(response.success).toBe(false);
        expect(response.error).toContain('Missing required API keys');
        expect(call).not.toHaveBeenCalled();
      }
    });
  });

  it('preserves unfiltered OpenCode missing-key preflight', async () => {
    for (const key of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY']) {
      vi.stubEnv(key, undefined);
    }
    const call = vi.spyOn(OpenCodeSDKProvider.prototype, 'callApi');
    await writeFile(
      configPath,
      JSON.stringify({
        providers: ['opencode:sdk'],
        prompts: ['Hello'],
        tests: [{ vars: {} }],
      }),
    );
    const response = await run({ write: false });
    expect(response.success).toBe(false);
    expect(response.error).toContain('Missing required API keys');
    expect(call).not.toHaveBeenCalled();
  });

  it.each([false, true])('persists only when requested with filtering=%s', async (filtered) => {
    const response = await run({ ...(filtered ? { testCaseIndices: 0 } : {}), write: true });
    expect(response.success, response.error).toBe(true);
    const stored = await Eval.findById(response.data.eval.id);
    expect(stored).toBeDefined();
    try {
      expect((await stored!.getResults()).map((row) => row.response?.output)).toEqual([
        'Hello Ada',
      ]);
    } finally {
      await stored?.delete();
    }
  });

  it.each([
    [{ promptFilter: ['0', 'Hello'] }, 'Cannot mix numeric indices and regex patterns'],
    [{ promptFilter: '4' }, 'Invalid prompt indices: 4'],
    [{ promptFilter: 'absent' }, 'No prompts found after applying filter'],
    [{ providerFilter: 'absent' }, 'No providers matched filter'],
    [{ testCaseIndices: 4 }, 'Test case index 4 is out of range'],
    [{ testCaseIndices: [0, 4] }, 'Invalid test case indices: 4'],
    [{ testCaseIndices: { start: 1, end: 0 } }, 'Invalid range: start=1, end=0'],
  ])('preserves filter errors without terminating the host: %j', async (filters, message) => {
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('MCP must not exit the host');
    });
    const exitCode = process.exitCode;
    const response = await run(filters);
    expect(response.success).toBe(false);
    expect(response.error).toContain(message);
    expect(exit).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(exitCode);
  });

  it('preserves numeric prompt order, duplicates and result pagination', async () => {
    await writeFile(
      configPath,
      JSON.stringify({
        providers: ['echo'],
        prompts: ['first', 'second'],
        tests: [{ vars: {} }, { vars: {} }],
      }),
    );
    const response = await run({
      promptFilter: ['1', '0', '1'],
      testCaseIndices: [1],
      resultLimit: 2,
      resultOffset: 1,
    });
    expect(response.success, response.error).toBe(true);
    expect(response.data.configuration.testCases).toMatchObject({ total: 2, filtered: 1 });
    expect(response.data.configuration.prompts).toMatchObject({
      total: 2,
      filtered: 3,
      labels: ['second', 'first', 'second'],
    });
    expect(response.data.results.totalEvals).toBe(3);
    expect(response.data.results.results).toHaveLength(2);
    expect(response.data.results.pagination).toMatchObject({
      offset: 1,
      limit: 2,
      returnedCount: 2,
    });
  });

  async function httpConfig(responseDelay = 0, configTimeout?: number) {
    const calls: number[] = [];
    server = createServer((_request, response) => {
      calls.push(Date.now());
      const send = () => {
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify({ output: 'PONG' }));
      };
      if (responseDelay) {
        responseTimer = setTimeout(send, responseDelay);
      } else {
        send();
      }
    });
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Expected a TCP server address');
    }
    await writeFile(
      configPath,
      JSON.stringify({
        providers: [
          {
            id: 'http',
            config: {
              url: `http://127.0.0.1:${address.port}/fixture`,
              method: 'POST',
              body: { prompt: '{{prompt}}' },
              transformResponse: 'json.output',
            },
          },
        ],
        prompts: ['Hello'],
        evaluateOptions: { timeoutMs: configTimeout },
        tests: [{ assert: [{ type: 'equals', value: 'PONG' }] }],
      }),
    );
    return calls;
  }

  it.each([false, true])('honors cache and delay with filtering=%s', async (filtered) => {
    const calls = await httpConfig();
    const response = await run({
      ...(filtered ? { testCaseIndices: 0 } : {}),
      repeat: 3,
      cache: false,
      delay: 35,
      maxConcurrency: 4,
      write: false,
    });
    expect(response.success, response.error).toBe(true);
    expect(response.data.results.stats).toMatchObject({ successes: 3, errors: 0 });
    expect(calls).toHaveLength(3);
    expect(calls[1] - calls[0]).toBeGreaterThanOrEqual(25);
    expect(calls[2] - calls[1]).toBeGreaterThanOrEqual(25);
  });

  it.each([false, true])(
    'keeps no-cache local to each request with filtering=%s',
    async (filtered) => {
      const calls = await httpConfig();
      const filters = filtered ? { testCaseIndices: 0 } : {};
      for (const cache of [false, true, true]) {
        const response = await run({ ...filters, cache });
        expect(response.success, response.error).toBe(true);
      }
      expect(calls).toHaveLength(2);
      expect(isCacheEnabled()).toBe(true);
    },
  );

  it.each([false, true])(
    'uses configured timeout when the request omits it with filtering=%s',
    async (filtered) => {
      const calls = await httpConfig(2000, 1000);
      const response = await run(filtered ? { testCaseIndices: 0 } : {});
      expect(response.success, response.error).toBe(true);
      expect(response.data.results.stats).toMatchObject({ successes: 0, errors: 1 });
      expect(calls).toHaveLength(1);
    },
  );

  it.each([{ testCaseIndices: [1] }, { promptFilter: '0' }])(
    'keeps explicit MCP selection independent of configured ranges: %j',
    async (filters) => {
      await writeFile(
        configPath,
        JSON.stringify({
          providers: ['echo'],
          prompts: ['Hello {{name}}'],
          tests: [{ vars: { name: 'Ada' } }, { vars: { name: 'Grace' } }],
          evaluateOptions: { filterRange: '1:2' },
        }),
      );
      const response = await run(filters);
      expect(response.success, response.error).toBe(true);
      expect(
        response.data.results.results.map(
          (row: { response: { output: string } }) => row.response.output,
        ),
      ).toEqual('testCaseIndices' in filters ? ['Hello Grace'] : ['Hello Ada', 'Hello Grace']);
    },
  );

  it('reports missing redteam email without opening an interactive prompt', async () => {
    mockProcessEnv({ PROMPTFOO_DISABLE_REMOTE_GENERATION: 'false' });
    vi.spyOn(envars, 'isCI').mockReturnValue(false);
    const prompt = vi
      .spyOn(accounts, 'promptForEmailUnverified')
      .mockRejectedValue(new Error('Unexpected interactive prompt'));
    vi.spyOn(accounts, 'getUserEmail').mockReturnValue(null);
    await writeFile(
      configPath,
      JSON.stringify({
        providers: ['echo'],
        prompts: ['Hello'],
        tests: [{ vars: {} }],
        redteam: { plugins: ['harmful:hate'] },
      }),
    );
    const response = await run({ testCaseIndices: 0 });
    expect(response.success).toBe(false);
    expect(response.error).toContain('email verification');
    expect(prompt).not.toHaveBeenCalled();
  });

  it.each([BAD_EMAIL_RESULT, EMAIL_OK_STATUS] as const)(
    'checks existing redteam email without interaction: %s',
    async (status) => {
      mockProcessEnv({ PROMPTFOO_DISABLE_REMOTE_GENERATION: 'false' });
      vi.spyOn(envars, 'isCI').mockReturnValue(false);
      const prompt = vi
        .spyOn(accounts, 'promptForEmailUnverified')
        .mockRejectedValue(new Error('Unexpected interactive prompt'));
      vi.spyOn(accounts, 'getUserEmail').mockReturnValue('fixture@example.test');
      vi.spyOn(accounts, 'getUserEmailNeedsValidation').mockReturnValue(true);
      vi.spyOn(accounts, 'getUserEmailValidated').mockReturnValue(false);
      const check = vi.spyOn(accounts, 'checkEmailStatusAndMaybeExit').mockResolvedValue(status);
      await writeFile(
        configPath,
        JSON.stringify({
          providers: ['echo'],
          prompts: ['Hello'],
          tests: [{ vars: {} }],
          redteam: { plugins: ['harmful:hate'] },
        }),
      );
      const response = await run({ testCaseIndices: 0 });
      expect(response.success).toBe(status === EMAIL_OK_STATUS);
      if (status !== EMAIL_OK_STATUS) {
        expect(response.error).toContain('valid work email');
      }
      expect(check).toHaveBeenCalledExactlyOnceWith({ validate: true });
      expect(prompt).not.toHaveBeenCalled();
    },
  );

  it.each([false, true])(
    'honors explicit timeout over config with filtering=%s',
    async (filtered) => {
      const calls = await httpConfig(2000, 10000);
      const response = await run({
        ...(filtered ? { testCaseIndices: 0 } : {}),
        timeoutMs: 1000,
        write: false,
      });
      expect(response.success, response.error).toBe(true);
      expect(response.data.results.stats).toMatchObject({ successes: 0, errors: 1 });
      expect(calls).toHaveLength(1);
    },
  );
});
