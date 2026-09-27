import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enableCache, isCacheEnabled } from '../../../../src/cache';
import cliState from '../../../../src/cliState';
import { registerRunEvaluationTool } from '../../../../src/commands/mcp/tools/runEvaluation';
import * as accounts from '../../../../src/globalConfig/accounts';
import logger from '../../../../src/logger';
import { runDbMigrations } from '../../../../src/migrate';
import Eval from '../../../../src/models/eval';
import { doEval } from '../../../../src/node/doEval';
import { createShareableUrl, isSharingEnabled } from '../../../../src/share';
import * as suggestions from '../../../../src/suggestions';
import { BAD_EMAIL_RESULT, EMAIL_OK_STATUS } from '../../../../src/types/email';
import * as readline from '../../../../src/util/readline';
import { mockProcessEnv } from '../../../util/utils';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

vi.mock('../../../../src/telemetry', () => ({
  default: { record: vi.fn(), send: vi.fn() },
}));
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
      { silent: true },
    );
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
    mockProcessEnv({ CI: 'false', PROMPTFOO_DISABLE_REMOTE_GENERATION: 'false' });
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
      mockProcessEnv({ CI: 'false', PROMPTFOO_DISABLE_REMOTE_GENERATION: 'false' });
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
