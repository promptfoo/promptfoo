import * as fsPromises from 'fs/promises';
import * as path from 'path';

import { XMLParser } from 'fast-xml-parser';
import yaml from 'js-yaml';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '../../src/database/index';
import * as googleSheets from '../../src/googleSheets';
import logger from '../../src/logger';
import Eval from '../../src/models/eval';
import { getTraceStore } from '../../src/tracing/store';
import { type EvaluateResult, ResultFailureReason } from '../../src/types/index';
import { createJunitXml } from '../../src/util/junit';
import {
  createOutputMetadata,
  warnOnDegradedJsonlRecovery,
  writeMultipleOutputs,
  writeOutput,
} from '../../src/util/output';
import { mockConsole, mockProcessEnv } from './utils';

vi.mock('../../src/database', () => ({
  getDb: vi.fn(),
}));

vi.mock('proxy-agent', () => ({
  ProxyAgent: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    statSync: vi.fn(),
    readdirSync: vi.fn(),
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
  };
});

const mockFileHandle = vi.hoisted(() => ({
  write: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
}));
const JSONL_TEMP_DIRECTORY = '/tmp/promptfoo-jsonl-test';
const JSONL_BACKUP_PATH = path.join(JSONL_TEMP_DIRECTORY, 'backup.jsonl');
const JSONL_REPLACEMENT_PATH = path.join(JSONL_TEMP_DIRECTORY, 'replacement.jsonl');

function createLegacyV2Summary() {
  return {
    version: 2,
    timestamp: '2026-01-01T00:00:00.000Z',
    results: [],
    stats: { successes: 1, failures: 0, errors: 0, tokenUsage: {} },
    table: {
      head: {
        prompts: [
          {
            display: 'head-prompt-display-secret',
            raw: 'head-prompt-secret {{safe}}',
            label: 'head-prompt-label-secret',
            provider: 'provider',
            config: {
              apiKey: 'head-prompt-api-key-secret',
              temperature: 0.1,
            },
          },
        ],
        vars: ['apiKey', 'safe', 'config'],
      },
      body: [
        {
          description: '',
          testIdx: 0,
          vars: [
            'row-api-key-secret',
            'keep-row',
            '{"apiKey":"nested-row-api-key-secret","safe":"keep-nested"}',
          ],
          test: {
            vars: {
              apiKey: 'test-api-key-secret',
              safe: 'keep-me',
              config: { apiKey: 'nested-row-api-key-secret', safe: 'keep-nested' },
            },
          },
          outputs: [
            {
              id: 'o1',
              pass: true,
              failureReason: 0,
              score: 1,
              cost: 0,
              latencyMs: 1,
              namedScores: {},
              text: 'response-text-secret',
              prompt: 'rendered-prompt-secret',
              provider: 'provider',
              vars: {
                apiKey: 'output-api-key-secret',
                safe: 'keep-output',
                config: { apiKey: 'nested-output-api-key-secret', safe: 'keep-nested-output' },
              },
              testCase: {
                vars: {
                  apiKey: 'test-api-key-secret',
                  safe: 'keep-me',
                  config: { apiKey: 'nested-row-api-key-secret', safe: 'keep-nested' },
                },
              },
              response: {
                audio: { data: 'response-audio-secret' },
                images: [{ data: 'response-image-secret' }],
                output: 'response-output-secret',
                prompt: 'provider-prompt-secret',
                video: { url: 'response-video-secret' },
                metadata: {
                  blobUris: ['promptfoo://blob/secret-media'],
                  headers: {
                    'x-request-id': 'legacy_should_not_persist',
                    'x-safe-debug': 'keep-legacy',
                  },
                  http: {
                    status: 200,
                    statusText: 'OK',
                    headers: { 'set-cookie': 'session=secret' },
                    requestHeaders: {
                      authorization: 'Bearer sk-should-not-persist',
                      'api-key': 'azure-api-key-should-not-persist',
                      'x-safe-debug': 'keep-me',
                    },
                  },
                },
              },
              audio: { data: 'audio-output-secret' },
              video: { url: 'video-output-secret' },
              images: [{ data: 'image-output-secret' }],
            },
          ],
        },
      ],
    },
  };
}

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  appendFile: vi.fn(),
  copyFile: vi.fn(),
  chmod: vi.fn(),
  lstat: vi.fn(),
  mkdtemp: vi.fn(),
  stat: vi.fn(),
  realpath: vi.fn(),
  readlink: vi.fn(),
  rename: vi.fn().mockResolvedValue(undefined),
  rm: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn(),
  open: vi.fn().mockResolvedValue(mockFileHandle),
}));

vi.mock('../../src/googleSheets', () => ({
  writeCsvToGoogleSheet: vi.fn(),
}));

describe('writeOutput', () => {
  let consoleLogSpy: ReturnType<typeof mockConsole>;

  beforeEach(() => {
    const fileNotFoundError = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    vi.clearAllMocks();
    // Restore mock implementations that vi.resetAllMocks() clears
    mockFileHandle.write.mockResolvedValue(undefined);
    mockFileHandle.close.mockResolvedValue(undefined);
    vi.mocked(fsPromises.open).mockResolvedValue(
      mockFileHandle as unknown as fsPromises.FileHandle,
    );
    vi.mocked(fsPromises.rename).mockResolvedValue(undefined);
    vi.mocked(fsPromises.rm).mockResolvedValue(undefined);
    vi.mocked(fsPromises.copyFile).mockResolvedValue(undefined);
    vi.mocked(fsPromises.mkdtemp).mockResolvedValue(JSONL_TEMP_DIRECTORY);
    vi.mocked(fsPromises.lstat).mockRejectedValue(fileNotFoundError);
    vi.mocked(fsPromises.stat).mockRejectedValue(fileNotFoundError);
    consoleLogSpy = mockConsole('log');
    // @ts-expect-error getDb is mocked with a partial test double.
    vi.mocked(getDb).mockResolvedValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    vi.resetAllMocks();
  });

  it('writeOutput with CSV output', async () => {
    // @ts-expect-error getDb is mocked with a partial test double.
    vi.mocked(getDb).mockResolvedValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({ all: vi.fn().mockResolvedValue([]) }),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    const outputPath = 'output.csv';
    const results: EvaluateResult[] = [
      {
        success: true,
        failureReason: ResultFailureReason.NONE,
        score: 1.0,
        namedScores: {},
        latencyMs: 1000,
        provider: {
          id: 'foo',
        },
        prompt: {
          raw: 'Test prompt',
          label: '[display] Test prompt',
        },
        response: {
          output: 'Test output',
        },
        vars: {
          var1: 'value1',
          var2: 'value2',
        },
        promptIdx: 0,
        testIdx: 0,
        testCase: {},
        promptId: 'foo',
      },
    ];
    const eval_ = new Eval({});
    await eval_.addResult(results[0]);

    const shareableUrl = null;
    await writeOutput(outputPath, eval_, shareableUrl);

    // CSV uses file handle streaming for memory-efficient export
    // Headers are always written even when database returns no results
    expect(fsPromises.open).toHaveBeenCalledWith(outputPath, 'w');
    expect(mockFileHandle.write).toHaveBeenCalled(); // Headers written
    expect(mockFileHandle.close).toHaveBeenCalled();
  });

  it('writeOutput with JSON output', async () => {
    const outputPath = 'output.json';
    const eval_ = new Eval({});
    await writeOutput(outputPath, eval_, null);

    expect(fsPromises.writeFile).toHaveBeenCalledTimes(1);
  });

  it('redacts env and secret config fields in JSON output', async () => {
    const outputPath = 'output.json';
    const eval_ = new Eval({
      description: 'Test config',
      tests: 'az://account/container/tests.yaml?sp=r&sig=azure-secret',
      env: {
        AWS_BEARER_TOKEN_BEDROCK: 'bedrock-secret-token',
        ANTHROPIC_API_KEY: 'anthropic-secret-token',
        REGION: 'us-east-1',
      },
      providers: [
        {
          id: 'anthropic:claude-agent-sdk',
          config: {
            apiKey: 'sk-secret-value',
            max_turns: 2,
          },
        },
      ],
    });

    await writeOutput(outputPath, eval_, null);

    expect(fsPromises.writeFile).toHaveBeenCalledTimes(1);
    const outputJson = vi.mocked(fsPromises.writeFile).mock.calls[0][1] as string;
    const parsed = JSON.parse(outputJson);
    expect(parsed.config.env.AWS_BEARER_TOKEN_BEDROCK).toBe('[REDACTED]');
    expect(parsed.config.env.ANTHROPIC_API_KEY).toBe('[REDACTED]');
    expect(parsed.config.env.REGION).toBe('us-east-1');
    expect(parsed.config.providers[0].config.apiKey).toBe('[REDACTED]');
    expect(parsed.config.providers[0].config.max_turns).toBe(2);
    expect(parsed.config.description).toBe('Test config');
    expect(parsed.config.tests).toBe('az://account/container/tests.yaml?sp=r&sig=%5BREDACTED%5D');
  });

  it.each([
    {
      extension: 'json',
      parse: (value: string) => JSON.parse(value),
    },
    {
      extension: 'yaml',
      parse: (value: string) => yaml.load(value) as Record<string, any>,
    },
  ])('omits nested response metadata from $extension output when metadata stripping is enabled', async ({
    extension,
    parse,
  }) => {
    const restoreEnv = mockProcessEnv({ PROMPTFOO_STRIP_METADATA: 'true' });
    try {
      const eval_ = new Eval({});
      await eval_.addResult({
        success: true,
        failureReason: ResultFailureReason.NONE,
        score: 1,
        namedScores: {},
        latencyMs: 100,
        provider: { id: 'provider' },
        prompt: {
          raw: 'Test prompt',
          label: 'Test prompt',
        },
        response: {
          output: 'Test output',
          metadata: {
            transformedRequest: {
              headers: {
                Authorization: 'Bearer nested-secret',
              },
            },
          },
        },
        vars: {},
        promptIdx: 0,
        testIdx: 0,
        testCase: {},
        promptId: 'prompt',
        metadata: {
          debug: 'top-level-secret',
        },
      });

      await writeOutput(`output.${extension}`, eval_, null);

      const written = vi.mocked(fsPromises.writeFile).mock.calls[0][1] as string;
      const parsed = parse(written);
      const result = parsed.results.results[0];
      expect(result.metadata).toEqual({});
      expect(result.response.metadata).toBeUndefined();
      expect(written).not.toContain('nested-secret');
    } finally {
      restoreEnv();
    }
  });

  it.each([
    {
      extension: 'json',
      parse: (value: string) => JSON.parse(value),
    },
    {
      extension: 'yaml',
      parse: (value: string) => yaml.load(value) as Record<string, any>,
    },
  ])('redacts credential headers and secret vars from non-persisted $extension output', async ({
    extension,
    parse,
  }) => {
    // A non-persisted eval (new Eval) holds raw in-memory rows; header redaction normally
    // happens at the DB / JSONL boundary, so the file export must redact at its own boundary.
    const eval_ = new Eval({});
    await eval_.addResult({
      success: true,
      failureReason: ResultFailureReason.NONE,
      score: 1,
      namedScores: {},
      latencyMs: 100,
      provider: { id: 'provider' },
      prompt: { raw: 'Test prompt', label: 'Test prompt' },
      response: {
        output: 'Test output',
        metadata: {
          headers: {
            'x-request-id': 'legacy_should_not_persist',
            'x-safe-debug': 'keep-legacy',
          },
          http: {
            status: 200,
            statusText: 'OK',
            headers: {
              'set-cookie': 'session=secret',
              'x-request-id': 'req_should_not_persist',
            },
            requestHeaders: {
              authorization: 'Bearer sk-should-not-persist',
              'api-key': 'azure-api-key-should-not-persist',
              'x-safe-debug': 'keep-me',
            },
          },
        },
      },
      vars: { apiKey: 'sk-var-should-not-persist', safe: 'keep-me' },
      promptIdx: 0,
      testIdx: 0,
      testCase: { vars: { apiKey: 'sk-var-should-not-persist', safe: 'keep-me' } },
      promptId: 'prompt',
    });

    await writeOutput(`output.${extension}`, eval_, null);

    const written = vi.mocked(fsPromises.writeFile).mock.calls[0][1] as string;
    const parsed = parse(written);
    const result = parsed.results.results[0];
    expect(result.response.metadata.http.headers['set-cookie']).toBe('[REDACTED]');
    expect(result.response.metadata.http.requestHeaders.authorization).toBe('[REDACTED]');
    expect(result.response.metadata.http.requestHeaders['api-key']).toBe('[REDACTED]');
    expect(result.response.metadata.http.requestHeaders['x-safe-debug']).toBe('keep-me');
    expect(result.response.metadata.headers['x-request-id']).toBe('[REDACTED]');
    expect(result.response.metadata.headers['x-safe-debug']).toBe('keep-legacy');
    expect(result.vars.apiKey).toBe('[REDACTED]');
    expect(result.vars.safe).toBe('keep-me');
    expect(written).not.toContain('session=secret');
    expect(written).not.toContain('sk-should-not-persist');
    expect(written).not.toContain('azure-api-key-should-not-persist');
    expect(written).not.toContain('sk-var-should-not-persist');
  });

  it('honors prompt stripping across V3 summary prompt copies', async () => {
    const restoreEnv = mockProcessEnv({ PROMPTFOO_STRIP_PROMPT_TEXT: 'true' });

    try {
      const eval_ = new Eval({});
      await eval_.addPrompts([
        {
          id: 'a'.repeat(64),
          display: 'summary-prompt-display-secret',
          raw: 'summary-prompt-secret',
          label: 'summary-prompt-label-secret',
          provider: 'provider',
          config: { apiKey: 'summary-prompt-api-key-secret', temperature: 0.1 },
        },
      ]);
      await eval_.addResult({
        success: true,
        failureReason: ResultFailureReason.NONE,
        score: 1,
        namedScores: {},
        latencyMs: 100,
        provider: { id: 'provider' },
        prompt: { raw: 'summary-prompt-secret', label: 'summary-prompt-label-secret' },
        response: { output: 'Test output' },
        vars: {},
        promptIdx: 0,
        testIdx: 0,
        testCase: {},
        promptId: 'prompt',
      });

      await writeOutput('output.json', eval_, null);

      const written = vi.mocked(fsPromises.writeFile).mock.calls[0][1] as string;
      const summaryPrompt = JSON.parse(written).results.prompts[0];
      expect(summaryPrompt.raw).toBe('[prompt stripped]');
      expect(summaryPrompt.label).toBe('[prompt stripped]');
      expect(summaryPrompt.display).toBe('[prompt stripped]');
      expect(summaryPrompt.id).toBe('a'.repeat(64));
      expect(summaryPrompt.config.apiKey).toBe('[REDACTED]');
      expect(summaryPrompt.config.temperature).toBe(0.1);
      expect(written).not.toContain('summary-prompt-secret');
      expect(written).not.toContain('summary-prompt-label-secret');
      expect(written).not.toContain('summary-prompt-display-secret');
      expect(written).not.toContain('summary-prompt-api-key-secret');
    } finally {
      restoreEnv();
    }
  });

  it('honors prompt and test-var stripping in the exported config', async () => {
    const restoreEnv = mockProcessEnv({
      PROMPTFOO_STRIP_PROMPT_TEXT: 'true',
      PROMPTFOO_STRIP_TEST_VARS: 'true',
    });

    try {
      const eval_ = new Eval({
        prompts: [
          'inline prompt secret',
          {
            id: 'prompt-id',
            raw: 'raw prompt secret',
            label: 'prompt label secret',
          },
        ],
        tests: [
          { vars: { customer: 'test-var secret' }, assert: [{ type: 'contains', value: 'ok' }] },
        ],
        defaultTest: { vars: { defaultCustomer: 'default-var secret' } },
        scenarios: [
          {
            config: [{ vars: { scenarioDefault: 'scenario-config secret' } }],
            tests: [{ vars: { scenarioCustomer: 'scenario-test secret' } }],
          },
        ],
      });

      await writeOutput('output.json', eval_, null);

      const written = vi.mocked(fsPromises.writeFile).mock.calls[0][1] as string;
      const config = JSON.parse(written).config;
      expect(config.prompts).toEqual([
        '[prompt stripped]',
        {
          id: 'prompt-id',
          raw: '[prompt stripped]',
          label: '[prompt stripped]',
        },
      ]);
      expect(config.tests[0].vars).toBeUndefined();
      expect(config.defaultTest.vars).toBeUndefined();
      expect(config.scenarios[0].config[0].vars).toBeUndefined();
      expect(config.scenarios[0].tests[0].vars).toBeUndefined();
      expect(written).not.toContain('inline prompt secret');
      expect(written).not.toContain('raw prompt secret');
      expect(written).not.toContain('prompt label secret');
      expect(written).not.toContain('test-var secret');
      expect(written).not.toContain('default-var secret');
      expect(written).not.toContain('scenario-config secret');
      expect(written).not.toContain('scenario-test secret');
    } finally {
      restoreEnv();
    }
  });

  it('preserves malformed legacy summary rows instead of crashing export', async () => {
    const eval_ = new Eval({});
    const summary = await eval_.toEvaluateSummary();
    (summary as { results: unknown[] }).results = [
      null,
      'legacy-row',
      { success: true, response: {} },
    ];
    vi.spyOn(eval_, 'toEvaluateSummary').mockResolvedValue(summary);

    await writeOutput('output.json', eval_, null);

    const written = vi.mocked(fsPromises.writeFile).mock.calls[0][1] as string;
    expect(JSON.parse(written).results.results).toEqual([
      null,
      'legacy-row',
      expect.objectContaining({ success: true }),
    ]);
  });

  it.each([
    {
      extension: 'json',
      parse: (value: string) => JSON.parse(value),
    },
    {
      extension: 'yaml',
      parse: (value: string) => yaml.load(value) as Record<string, any>,
    },
  ])('projects a legacy V2 summary table on $extension export', async ({ extension, parse }) => {
    const eval_ = new Eval({});
    const v2Summary = createLegacyV2Summary();
    vi.spyOn(eval_, 'toEvaluateSummary').mockResolvedValue(
      v2Summary as unknown as Awaited<ReturnType<typeof eval_.toEvaluateSummary>>,
    );

    await writeOutput(`output.${extension}`, eval_, null);

    const written = vi.mocked(fsPromises.writeFile).mock.calls[0][1] as string;
    const parsed = parse(written);
    const table = parsed.results.table;
    const output = table.body[0].outputs[0];
    expect(table.head.prompts[0].raw).toBe('head-prompt-secret {{safe}}');
    expect(table.head.prompts[0].label).toBe('head-prompt-label-secret');
    expect(table.head.prompts[0].config.apiKey).toBe('[REDACTED]');
    expect(table.head.prompts[0].config.temperature).toBe(0.1);
    expect(table.body[0].vars).toEqual([
      '[REDACTED]',
      'keep-row',
      '{"apiKey":"[REDACTED]","safe":"keep-nested"}',
    ]);
    expect(output.response.metadata.http.headers['set-cookie']).toBe('[REDACTED]');
    expect(output.response.metadata.http.requestHeaders.authorization).toBe('[REDACTED]');
    expect(output.response.metadata.http.requestHeaders['api-key']).toBe('[REDACTED]');
    expect(output.response.metadata.http.requestHeaders['x-safe-debug']).toBe('keep-me');
    expect(output.response.metadata.headers['x-request-id']).toBe('[REDACTED]');
    expect(output.response.metadata.headers['x-safe-debug']).toBe('keep-legacy');
    expect(output.vars.apiKey).toBe('[REDACTED]');
    expect(output.vars.safe).toBe('keep-output');
    expect(output.vars.config.apiKey).toBe('[REDACTED]');
    expect(output.vars.config.safe).toBe('keep-nested-output');
    expect(output.testCase.vars.apiKey).toBe('[REDACTED]');
    expect(output.testCase.vars.safe).toBe('keep-me');
    expect(table.body[0].test.vars.apiKey).toBe('[REDACTED]');
    expect(output.prompt).toBe('rendered-prompt-secret');
    expect(output.text).toBe('response-text-secret');
    expect(output.audio.data).toBe('audio-output-secret');
    expect(output.video.url).toBe('video-output-secret');
    expect(output.images[0].data).toBe('image-output-secret');
    expect(written).not.toContain('session=secret');
    expect(written).not.toContain('sk-should-not-persist');
    expect(written).not.toContain('azure-api-key-should-not-persist');
    expect(written).not.toContain('head-prompt-api-key-secret');
    expect(written).not.toContain('row-api-key-secret');
    expect(written).not.toContain('nested-row-api-key-secret');
    expect(written).not.toContain('output-api-key-secret');
    expect(written).not.toContain('nested-output-api-key-secret');
    expect(written).not.toContain('test-api-key-secret');
  });

  it('honors strip flags across legacy V2 table copies', async () => {
    const restoreEnv = mockProcessEnv({
      PROMPTFOO_STRIP_PROMPT_TEXT: 'true',
      PROMPTFOO_STRIP_RESPONSE_OUTPUT: 'true',
      PROMPTFOO_STRIP_TEST_VARS: 'true',
    });

    try {
      const eval_ = new Eval({});
      const v2Summary = createLegacyV2Summary();
      vi.spyOn(eval_, 'toEvaluateSummary').mockResolvedValue(
        v2Summary as unknown as Awaited<ReturnType<typeof eval_.toEvaluateSummary>>,
      );

      await writeOutput('output.json', eval_, null);

      const written = vi.mocked(fsPromises.writeFile).mock.calls[0][1] as string;
      const table = JSON.parse(written).results.table;
      const output = table.body[0].outputs[0];
      expect(table.head.prompts[0].raw).toBe('[prompt stripped]');
      expect(table.head.prompts[0].label).toBe('[prompt stripped]');
      expect(table.head.prompts[0].display).toBe('[prompt stripped]');
      expect(table.body[0].vars).toEqual(['', '', '']);
      expect(table.body[0].test.vars).toBeUndefined();
      expect(output.vars).toEqual({});
      expect(output.testCase.vars).toBeUndefined();
      expect(output.prompt).toBe('[prompt stripped]');
      expect(output.text).toBe('[output stripped]');
      expect(output.response.output).toBe('[output stripped]');
      expect(output.response.prompt).toBe('[prompt stripped]');
      expect(output.response.audio).toBeUndefined();
      expect(output.response.images).toBeUndefined();
      expect(output.response.video).toBeUndefined();
      expect(output.response.metadata.blobUris).toBeUndefined();
      expect(output.audio).toBeUndefined();
      expect(output.video).toBeUndefined();
      expect(output.images).toBeUndefined();
      expect(written).not.toContain('head-prompt-secret');
      expect(written).not.toContain('head-prompt-label-secret');
      expect(written).not.toContain('head-prompt-display-secret');
      expect(written).not.toContain('rendered-prompt-secret');
      expect(written).not.toContain('response-text-secret');
      expect(written).not.toContain('response-output-secret');
      expect(written).not.toContain('provider-prompt-secret');
      expect(written).not.toContain('response-audio-secret');
      expect(written).not.toContain('response-image-secret');
      expect(written).not.toContain('response-video-secret');
      expect(written).not.toContain('promptfoo://blob/secret-media');
      expect(written).not.toContain('audio-output-secret');
      expect(written).not.toContain('video-output-secret');
      expect(written).not.toContain('image-output-secret');
      expect(written).not.toContain('keep-row');
      expect(written).not.toContain('keep-output');
    } finally {
      restoreEnv();
    }
  });

  it('preserves nullish and sparse legacy V2 table output cells', async () => {
    const eval_ = new Eval({});
    const v2Summary = createLegacyV2Summary();
    const output = v2Summary.table.body[0].outputs[0];
    const sparseOutputs: any[] = new Array(3);
    sparseOutputs[0] = null;
    sparseOutputs[2] = output;
    v2Summary.table.body[0].outputs = sparseOutputs;
    vi.spyOn(eval_, 'toEvaluateSummary').mockResolvedValue(
      v2Summary as unknown as Awaited<ReturnType<typeof eval_.toEvaluateSummary>>,
    );

    await writeOutput('output.json', eval_, null);

    const written = vi.mocked(fsPromises.writeFile).mock.calls[0][1] as string;
    const outputs = JSON.parse(written).results.table.body[0].outputs;
    expect(outputs).toHaveLength(3);
    expect(outputs[0]).toBeNull();
    expect(outputs[1]).toBeNull();
    expect(outputs[2].response.metadata.http.headers['set-cookie']).toBe('[REDACTED]');
  });

  it.each([
    { name: 'missing head', head: undefined },
    { name: 'missing prompts', head: { vars: [] } },
    { name: 'malformed prompts', head: { prompts: 'invalid', vars: [] } },
  ])('tolerates a legacy V2 table with $name', async ({ head }) => {
    const eval_ = new Eval({});
    const v2Summary = createLegacyV2Summary();
    (v2Summary.table as any).head = head;
    vi.spyOn(eval_, 'toEvaluateSummary').mockResolvedValue(
      v2Summary as unknown as Awaited<ReturnType<typeof eval_.toEvaluateSummary>>,
    );

    await writeOutput('output.json', eval_, null);

    const written = vi.mocked(fsPromises.writeFile).mock.calls[0][1] as string;
    const table = JSON.parse(written).results.table;
    expect(table.body[0].outputs[0].response.metadata.http.headers['set-cookie']).toBe(
      '[REDACTED]',
    );
  });

  it.each([
    {
      extension: 'json',
      parse: (value: string) => JSON.parse(value),
    },
    {
      extension: 'yaml',
      parse: (value: string) => yaml.load(value) as Record<string, any>,
    },
  ])('omits test-case metadata from $extension output when metadata stripping is enabled', async ({
    extension,
    parse,
  }) => {
    const restoreEnv = mockProcessEnv({
      PROMPTFOO_STRIP_METADATA: 'true',
      PROMPTFOO_STRIP_TEST_VARS: 'true',
    });

    try {
      const eval_ = new Eval({});
      await eval_.addResult({
        success: true,
        failureReason: ResultFailureReason.NONE,
        score: 1,
        namedScores: {},
        latencyMs: 100,
        provider: { id: 'provider' },
        prompt: {
          raw: 'Test prompt',
          label: 'Test prompt',
        },
        response: {
          output: 'Test output',
        },
        vars: {
          customerEmail: 'secret@example.com',
        },
        promptIdx: 0,
        testIdx: 0,
        testCase: {
          vars: {
            customerEmail: 'secret@example.com',
          },
          metadata: {
            goal: 'goal testcase-secret',
            pluginConfig: {
              policy: 'policy testcase-secret',
            },
            inputMaterialization: {
              source: 'source testcase-secret',
            },
          },
        },
        promptId: 'prompt',
        metadata: {
          debug: 'top-level-secret',
        },
      });

      await writeOutput(`output.${extension}`, eval_, null);

      const written = vi.mocked(fsPromises.writeFile).mock.calls[0][1] as string;
      const parsed = parse(written);
      const result = parsed.results.results[0];
      expect(result.metadata).toEqual({});
      expect(result.testCase.metadata).toBeUndefined();
      expect(result.testCase.vars).toBeUndefined();
      expect(written).not.toContain('testcase-secret');
    } finally {
      restoreEnv();
    }
  });

  it('omits trace vars from JSON output when test variable stripping is enabled', async () => {
    const restoreEnv = mockProcessEnv({ PROMPTFOO_STRIP_TEST_VARS: 'true' });
    const traceSpy = vi.spyOn(getTraceStore(), 'getTracesByEvaluation').mockResolvedValue([
      {
        traceId: 'trace-strip-vars',
        evaluationId: 'eval-strip-vars',
        testCaseId: 'case-strip-vars',
        metadata: {
          testIdx: 0,
          promptIdx: 0,
          source: 'trace export',
          vars: {
            customerEmail: 'trace-var-secret@example.com',
          },
        },
        spans: [],
      },
    ]);

    try {
      await writeOutput('output.json', new Eval({}), null);

      const written = vi.mocked(fsPromises.writeFile).mock.calls[0][1] as string;
      const parsed = JSON.parse(written);
      expect(parsed.traces[0].metadata).toEqual({
        testIdx: 0,
        promptIdx: 0,
        source: 'trace export',
      });
      expect(written).not.toContain('trace-var-secret@example.com');
    } finally {
      traceSpy.mockRestore();
      restoreEnv();
    }
  });

  it('omits trace metadata when stripped vars are the only metadata', async () => {
    const restoreEnv = mockProcessEnv({ PROMPTFOO_STRIP_TEST_VARS: 'true' });
    const traceSpy = vi.spyOn(getTraceStore(), 'getTracesByEvaluation').mockResolvedValue([
      {
        traceId: 'trace-strip-only-vars',
        evaluationId: 'eval-strip-only-vars',
        testCaseId: 'case-strip-only-vars',
        metadata: {
          vars: {
            customerEmail: 'trace-only-var-secret@example.com',
          },
        },
        spans: [],
      },
    ]);

    try {
      await writeOutput('output.json', new Eval({}), null);

      const written = vi.mocked(fsPromises.writeFile).mock.calls[0][1] as string;
      const parsed = JSON.parse(written);
      expect(parsed.traces[0]).not.toHaveProperty('metadata');
      expect(written).not.toContain('trace-only-var-secret@example.com');
    } finally {
      traceSpy.mockRestore();
      restoreEnv();
    }
  });

  it('omits trace metadata from JSON output when metadata stripping is enabled', async () => {
    const restoreEnv = mockProcessEnv({ PROMPTFOO_STRIP_METADATA: 'true' });
    const traceSpy = vi.spyOn(getTraceStore(), 'getTracesByEvaluation').mockResolvedValue([
      {
        traceId: 'trace-strip-metadata',
        evaluationId: 'eval-strip-metadata',
        testCaseId: 'case-strip-metadata',
        metadata: {
          note: 'trace-metadata-secret',
          vars: {
            customerEmail: 'trace-var-secret@example.com',
          },
        },
        spans: [],
      },
    ]);

    try {
      await writeOutput('output.json', new Eval({}), null);

      const written = vi.mocked(fsPromises.writeFile).mock.calls[0][1] as string;
      const parsed = JSON.parse(written);
      expect(parsed.traces[0]).not.toHaveProperty('metadata');
      expect(written).not.toContain('trace-metadata-secret');
      expect(written).not.toContain('trace-var-secret@example.com');
    } finally {
      traceSpy.mockRestore();
      restoreEnv();
    }
  });

  it('omits stripped prompt and response bodies from trace span attributes', async () => {
    const restoreEnv = mockProcessEnv({
      PROMPTFOO_STRIP_PROMPT_TEXT: 'true',
      PROMPTFOO_STRIP_RESPONSE_OUTPUT: 'true',
    });
    const traceSpy = vi.spyOn(getTraceStore(), 'getTracesByEvaluation').mockResolvedValue([
      {
        traceId: 'trace-strip-bodies',
        evaluationId: 'eval-strip-bodies',
        testCaseId: 'case-strip-bodies',
        spans: [
          {
            spanId: 'span-strip-bodies',
            name: 'provider',
            startTime: 1,
            attributes: {
              'promptfoo.request.body': 'trace-prompt-secret',
              'promptfoo.response.body': 'trace-response-secret',
              operation: 'provider-call',
            },
          },
        ],
      },
    ]);

    try {
      await writeOutput('output.json', new Eval({}), null);

      const written = vi.mocked(fsPromises.writeFile).mock.calls[0][1] as string;
      const parsed = JSON.parse(written);
      expect(parsed.traces[0].spans[0].attributes).toEqual({ operation: 'provider-call' });
      expect(written).not.toContain('trace-prompt-secret');
      expect(written).not.toContain('trace-response-secret');
    } finally {
      traceSpy.mockRestore();
      restoreEnv();
    }
  });

  it('preserves deep non-secret config fields in JSON output', async () => {
    const outputPath = 'output.json';
    const eval_ = new Eval({
      defaultTest: {
        options: {
          deepConfig: {
            l1: {
              l2: {
                l3: {
                  l4: {
                    l5: {
                      l6: {
                        value: 'deep-public-value',
                        apiKey: 'sk-secret-value',
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    await writeOutput(outputPath, eval_, null);

    expect(fsPromises.writeFile).toHaveBeenCalledTimes(1);
    const outputJson = vi.mocked(fsPromises.writeFile).mock.calls[0][1] as string;
    const parsed = JSON.parse(outputJson);
    expect(parsed.config.defaultTest.options.deepConfig.l1.l2.l3.l4.l5.l6.value).toBe(
      'deep-public-value',
    );
    expect(parsed.config.defaultTest.options.deepConfig.l1.l2.l3.l4.l5.l6.apiKey).toBe(
      '[REDACTED]',
    );
  });

  it('writeOutput with YAML output', async () => {
    const outputPath = 'output.yaml';
    const eval_ = new Eval({});
    await writeOutput(outputPath, eval_, null);

    expect(fsPromises.writeFile).toHaveBeenCalledTimes(1);
  });

  it.each([
    'yaml',
    'txt',
  ])('sanitizes runtime options before writing %s output for in-memory evals', async (extension) => {
    const eval_ = new Eval(
      {},
      {
        runtimeOptions: {
          cache: false,
          abortSignal: new AbortController().signal,
          progressCallback: vi.fn(),
        },
      },
    );

    await writeOutput(`output.${extension}`, eval_, null);

    const written = vi.mocked(fsPromises.writeFile).mock.calls[0][1] as string;
    const parsed = yaml.load(written) as { runtimeOptions: Record<string, unknown> };
    expect(parsed.runtimeOptions).toEqual({ cache: false });
  });

  it('redacts env and secret config fields in YAML output', async () => {
    const outputPath = 'output.yaml';
    const eval_ = new Eval({
      env: {
        AWS_BEARER_TOKEN_BEDROCK: 'bedrock-token',
        ANTHROPIC_API_KEY: 'anthropic-token',
        AWS_REGION: 'us-east-1',
      },
      defaultTest: {
        options: {
          apiKey: 'another-secret',
          temperature: 0.1,
        },
      },
    });

    await writeOutput(outputPath, eval_, null);

    expect(fsPromises.writeFile).toHaveBeenCalledTimes(1);
    const outputYaml = vi.mocked(fsPromises.writeFile).mock.calls[0][1] as string;
    const parsed = yaml.load(outputYaml) as Record<string, any>;
    expect(parsed.config.env.AWS_BEARER_TOKEN_BEDROCK).toBe('[REDACTED]');
    expect(parsed.config.env.ANTHROPIC_API_KEY).toBe('[REDACTED]');
    expect(parsed.config.env.AWS_REGION).toBe('us-east-1');
    expect(parsed.config.defaultTest.options.apiKey).toBe('[REDACTED]');
    expect(parsed.config.defaultTest.options.temperature).toBe(0.1);
  });

  it('writeOutput with XML output', async () => {
    const outputPath = 'output.xml';
    const eval_ = new Eval({});
    await writeOutput(outputPath, eval_, null);

    expect(fsPromises.writeFile).toHaveBeenCalledTimes(1);
  });

  it('writes compact JUnit XML grouped by provider and prompt', async () => {
    const eval_ = new Eval({});
    await eval_.addResult({
      success: true,
      failureReason: ResultFailureReason.NONE,
      score: 1,
      namedScores: {},
      latencyMs: 1250,
      provider: { id: 'echo' },
      prompt: { raw: 'Hello {{name}}', label: 'Hello prompt' },
      response: { output: 'Hello Alice' },
      vars: { name: 'Alice' },
      promptIdx: 0,
      testIdx: 0,
      testCase: { description: 'passing test' },
      promptId: 'prompt-1',
    });
    await eval_.addResult({
      success: false,
      failureReason: ResultFailureReason.ASSERT,
      score: 0.5,
      namedScores: {},
      latencyMs: 2500,
      provider: { id: 'echo' },
      prompt: { raw: 'Hello {{name}}', label: 'Hello prompt' },
      response: { output: 'SECRET MODEL OUTPUT' },
      vars: { name: 'Bob' },
      promptIdx: 0,
      testIdx: 1,
      testCase: { description: 'failing test' },
      gradingResult: {
        pass: false,
        score: 0.5,
        reason: 'Expected output to contain Bob',
        componentResults: [
          {
            pass: true,
            score: 1,
            reason: 'Assertion passed',
            assertion: { type: 'contains', value: 'Hello' },
          },
          {
            pass: false,
            score: 0,
            reason: 'Expected output to contain Bob',
            assertion: { type: 'contains', value: 'Bob' },
          },
        ],
      },
      promptId: 'prompt-1',
    });
    await eval_.addResult({
      success: false,
      failureReason: ResultFailureReason.ERROR,
      score: 0,
      namedScores: {},
      latencyMs: 500,
      provider: { id: 'echo' },
      prompt: { raw: 'Hello {{name}}', label: 'Hello prompt' },
      response: { output: '' },
      error: 'provider request failed',
      vars: { name: 'Carol' },
      promptIdx: 0,
      testIdx: 2,
      testCase: {},
      promptId: 'prompt-1',
    });

    await writeOutput('promptfoo.junit.xml', eval_, null);

    const xml = vi.mocked(fsPromises.writeFile).mock.calls[0][1] as string;
    expect(xml).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>/);
    const parsed = new XMLParser({ ignoreAttributes: false }).parse(xml);
    expect(parsed.testsuites).toMatchObject({
      '@_errors': '1',
      '@_failures': '1',
      '@_name': 'promptfoo',
      '@_skipped': '0',
      '@_tests': '3',
      '@_time': '4.25',
    });
    expect(parsed.testsuites.testsuite).toMatchObject({
      '@_errors': '1',
      '@_failures': '1',
      '@_name': '[echo] prompt 1',
      '@_skipped': '0',
      '@_tests': '3',
      '@_time': '4.25',
    });
    expect(parsed.testsuites.testsuite.testcase).toEqual([
      expect.objectContaining({
        '@_classname': '[echo] prompt 1',
        '@_name': 'test 1: passing test',
        '@_time': '1.25',
      }),
      expect.objectContaining({
        '@_classname': '[echo] prompt 1',
        '@_name': 'test 2: failing test',
        '@_time': '2.5',
        failure: expect.objectContaining({
          '#text': 'Score: 0.5\nReason: Assertion failed\nFailed assertions:\n- contains',
          '@_message': 'Assertion failed',
          '@_type': 'assertion',
        }),
      }),
      expect.objectContaining({
        '@_classname': '[echo] prompt 1',
        '@_name': 'test 3',
        '@_time': '0.5',
        error: expect.objectContaining({
          '#text': 'Reason: Evaluation error',
          '@_message': 'Evaluation error',
          '@_type': 'error',
        }),
      }),
    ]);
    expect(xml).not.toContain('SECRET MODEL OUTPUT');
    expect(xml).not.toContain('Alice');
    expect(xml).not.toContain('Carol');
  });

  it('keeps Promptfoo XML separate from JUnit XML', async () => {
    const eval_ = new Eval({});

    await writeOutput('output.xml', eval_, null);
    await writeOutput('output.junit.xml', eval_, null);

    const promptfooXml = vi.mocked(fsPromises.writeFile).mock.calls[0][1] as string;
    const junitXml = vi.mocked(fsPromises.writeFile).mock.calls[1][1] as string;
    expect(promptfooXml).toContain('<promptfoo>');
    expect(junitXml).toContain('<testsuites');
  });

  it('serializes legacy eval results into JUnit XML', async () => {
    const legacyResult: EvaluateResult = {
      success: false,
      failureReason: ResultFailureReason.ASSERT,
      score: 0,
      namedScores: {},
      latencyMs: 0,
      provider: { label: 'legacy provider' },
      prompt: { raw: 'Legacy raw prompt', label: '' },
      response: { output: '' },
      vars: {},
      promptIdx: 0,
      testIdx: 0,
      testCase: {},
      promptId: 'legacy-prompt',
    };
    const eval_ = {
      createdAt: 'not-a-date',
      fetchResultsBatched: vi.fn(),
      getResults: vi.fn().mockResolvedValue([legacyResult]),
      persisted: false,
      results: [],
      useOldResults: () => true,
    } as unknown as Eval;

    const xml = await createJunitXml(eval_);
    const parsed = new XMLParser({ ignoreAttributes: false }).parse(xml);

    expect(eval_.getResults).toHaveBeenCalledTimes(1);
    expect(eval_.fetchResultsBatched).not.toHaveBeenCalled();
    expect(parsed.testsuites.testsuite).toMatchObject({
      '@_name': '[legacy provider] prompt 1',
    });
    expect(parsed.testsuites.testsuite).not.toHaveProperty('@_timestamp');
    expect(parsed.testsuites.testsuite.testcase.failure).toMatchObject({
      '#text': 'Score: 0\nReason: Assertion failed',
      '@_message': 'Assertion failed',
    });
  });

  it('keeps legacy prompts without ids in separate suites', async () => {
    const makeLegacyResult = (promptIdx: number, raw: string): EvaluateResult => ({
      success: true,
      failureReason: ResultFailureReason.NONE,
      score: 1,
      namedScores: {},
      latencyMs: 0,
      provider: { id: 'echo' },
      prompt: { raw, label: '' },
      response: { output: '' },
      vars: {},
      promptIdx,
      testIdx: 0,
      testCase: {},
      promptId: '',
    });
    const eval_ = {
      createdAt: '2026-05-03T15:00:00.000Z',
      fetchResultsBatched: vi.fn(),
      getResults: vi
        .fn()
        .mockResolvedValue([makeLegacyResult(0, 'Prompt A'), makeLegacyResult(1, 'Prompt B')]),
      persisted: false,
      results: [],
      useOldResults: () => true,
    } as unknown as Eval;

    const xml = await createJunitXml(eval_);
    const parsed = new XMLParser({ ignoreAttributes: false }).parse(xml);

    expect(parsed.testsuites.testsuite).toEqual([
      expect.objectContaining({ '@_name': '[echo] prompt 1' }),
      expect.objectContaining({ '@_name': '[echo] prompt 2' }),
    ]);
  });

  it('does not use prompt text or labels as JUnit suite names', async () => {
    const eval_ = new Eval({});
    await eval_.addResult({
      success: true,
      failureReason: ResultFailureReason.NONE,
      score: 1,
      namedScores: {},
      latencyMs: 0,
      provider: { id: 'echo' },
      prompt: { raw: 'Sensitive system prompt', label: 'Sensitive label' },
      response: { output: '' },
      vars: {},
      promptIdx: 0,
      testIdx: 0,
      testCase: {},
      promptId: 'sensitive-prompt',
    });

    const xml = await createJunitXml(eval_);
    const parsed = new XMLParser({ ignoreAttributes: false }).parse(xml);

    expect(parsed.testsuites.testsuite).toMatchObject({
      '@_name': '[echo] prompt 1',
    });
    expect(xml).not.toContain('Sensitive system prompt');
    expect(xml).not.toContain('Sensitive label');
  });

  it('serializes persisted batched eval results into JUnit XML', async () => {
    const persistedResult: EvaluateResult = {
      success: false,
      failureReason: ResultFailureReason.ERROR,
      score: 0,
      namedScores: {},
      latencyMs: Number.NaN,
      provider: { id: '', label: '' },
      prompt: { raw: '', label: '' },
      response: { output: '' },
      vars: {},
      promptIdx: 0,
      testIdx: 0,
      testCase: {},
      gradingResult: {
        pass: false,
        score: 0,
        reason: 'grader unavailable',
      },
      promptId: 'persisted-prompt',
    };
    const eval_ = {
      createdAt: '2026-05-03T15:00:00.000Z',
      async *fetchResultsBatched() {
        yield [persistedResult];
      },
      getResults: vi.fn(),
      persisted: true,
      results: [],
      useOldResults: () => false,
    } as unknown as Eval;

    const xml = await createJunitXml(eval_);
    const parsed = new XMLParser({ ignoreAttributes: false }).parse(xml);

    expect(eval_.getResults).not.toHaveBeenCalled();
    expect(parsed.testsuites.testsuite).toMatchObject({
      '@_name': '[unknown provider] prompt 1',
      '@_time': '0',
      '@_timestamp': '2026-05-03T15:00:00.000Z',
    });
    expect(parsed.testsuites.testsuite.testcase.error).toMatchObject({
      '#text': 'Reason: Evaluation error',
      '@_message': 'Evaluation error',
    });
  });

  it('keeps JUnit failure messages compact when raw assertion reasons are long', async () => {
    const longReason = 'x'.repeat(600);
    const eval_ = new Eval({});
    await eval_.addResult({
      success: false,
      failureReason: ResultFailureReason.ASSERT,
      score: 0,
      namedScores: {},
      latencyMs: 0,
      provider: { id: 'echo' },
      prompt: { raw: 'Prompt', label: 'Prompt' },
      response: { output: '' },
      vars: {},
      promptIdx: 0,
      testIdx: 0,
      testCase: {},
      gradingResult: {
        pass: false,
        score: 0,
        reason: longReason,
      },
      promptId: 'long-message',
    });

    const xml = await createJunitXml(eval_);
    const parsed = new XMLParser({ ignoreAttributes: false }).parse(xml);

    expect(parsed.testsuites.testsuite.testcase.failure['@_message']).toBe('Assertion failed');
    expect(xml).not.toContain(longReason);
  });

  it('separates JUnit suites for providers that share an id but differ by label', async () => {
    const eval_ = new Eval({});
    await eval_.addResult({
      success: true,
      failureReason: ResultFailureReason.NONE,
      score: 1,
      namedScores: {},
      latencyMs: 100,
      provider: { id: 'echo', label: 'target-A' },
      prompt: { raw: 'Greet {{name}}', label: 'Greet prompt' },
      response: { output: '' },
      vars: { name: 'Alice' },
      promptIdx: 0,
      testIdx: 0,
      testCase: {},
      promptId: 'prompt-shared',
    });
    await eval_.addResult({
      success: false,
      failureReason: ResultFailureReason.ASSERT,
      score: 0,
      namedScores: {},
      latencyMs: 200,
      provider: { id: 'echo', label: 'target-B' },
      prompt: { raw: 'Greet {{name}}', label: 'Greet prompt' },
      response: { output: '' },
      vars: { name: 'Alice' },
      promptIdx: 1,
      testIdx: 0,
      testCase: {},
      gradingResult: { pass: false, score: 0, reason: 'B failed' },
      promptId: 'prompt-shared',
    });

    const xml = await createJunitXml(eval_);
    const parsed = new XMLParser({ ignoreAttributes: false }).parse(xml);

    expect(parsed.testsuites.testsuite).toEqual([
      expect.objectContaining({ '@_name': '[target-A] prompt 1', '@_tests': '1' }),
      expect.objectContaining({
        '@_name': '[target-B] prompt 1',
        '@_tests': '1',
        '@_failures': '1',
      }),
    ]);
  });

  it('keeps JUnit testcase classnames consistent within a suite when promptIdx varies', async () => {
    const baseResult = (promptIdx: number, testIdx: number, promptId: string): EvaluateResult => ({
      success: true,
      failureReason: ResultFailureReason.NONE,
      score: 1,
      namedScores: {},
      latencyMs: 100,
      provider: { id: 'echo' },
      prompt: { raw: `prompt ${promptId}`, label: '' },
      response: { output: '' },
      vars: {},
      promptIdx,
      testIdx,
      testCase: {},
      promptId,
    });
    const eval_ = {
      createdAt: '2026-05-03T15:00:00.000Z',
      fetchResultsBatched: vi.fn(),
      // Same promptId across non-contiguous promptIdx values would previously
      // produce mixed classnames inside a single suite.
      getResults: vi
        .fn()
        .mockResolvedValue([baseResult(0, 0, 'shared'), baseResult(2, 1, 'shared')]),
      persisted: false,
      results: [],
      useOldResults: () => true,
    } as unknown as Eval;

    const xml = await createJunitXml(eval_);
    const parsed = new XMLParser({ ignoreAttributes: false }).parse(xml);

    expect(parsed.testsuites.testsuite).toMatchObject({
      '@_name': '[echo] prompt 1',
      '@_tests': '2',
    });
    for (const testcase of parsed.testsuites.testsuite.testcase) {
      expect(testcase['@_classname']).toBe('[echo] prompt 1');
    }
  });

  it('omits raw JUnit error text when it matches the inline reason', async () => {
    const eval_ = new Eval({});
    await eval_.addResult({
      success: false,
      failureReason: ResultFailureReason.ERROR,
      score: 0,
      namedScores: {},
      latencyMs: 100,
      provider: { id: 'echo' },
      prompt: { raw: 'p', label: '' },
      response: { output: '' },
      error: 'request failed: 500',
      vars: {},
      promptIdx: 0,
      testIdx: 0,
      testCase: {},
      promptId: 'collapsed-error',
    });

    const xml = await createJunitXml(eval_);
    const parsed = new XMLParser({ ignoreAttributes: false }).parse(xml);

    expect(parsed.testsuites.testsuite.testcase.error).toMatchObject({
      '#text': 'Reason: Evaluation error',
      '@_message': 'Evaluation error',
    });
    expect(xml).not.toContain('request failed: 500');
  });

  it('omits multiline raw JUnit error payloads', async () => {
    const eval_ = new Eval({});
    await eval_.addResult({
      success: false,
      failureReason: ResultFailureReason.ERROR,
      score: 0,
      namedScores: {},
      latencyMs: 100,
      provider: { id: 'echo' },
      prompt: { raw: 'p', label: '' },
      response: { output: '' },
      error: 'API error: 401\n{"code":"invalid_api_key"}',
      vars: {},
      promptIdx: 0,
      testIdx: 0,
      testCase: {},
      promptId: 'multiline-error',
    });

    const xml = await createJunitXml(eval_);
    const parsed = new XMLParser({ ignoreAttributes: false }).parse(xml);

    expect(parsed.testsuites.testsuite.testcase.error).toMatchObject({
      '#text': 'Reason: Evaluation error',
      '@_message': 'Evaluation error',
    });
    expect(xml).not.toContain('invalid_api_key');
  });

  it('omits raw model outputs from JUnit assertion details', async () => {
    const eval_ = new Eval({});
    await eval_.addResult({
      success: false,
      failureReason: ResultFailureReason.ASSERT,
      score: 0,
      namedScores: {},
      latencyMs: 100,
      provider: { id: 'echo' },
      prompt: { raw: 'p', label: '' },
      response: { output: 'TOP_SECRET_OUTPUT_42' },
      vars: {},
      promptIdx: 0,
      testIdx: 0,
      testCase: {},
      gradingResult: {
        pass: false,
        score: 0,
        reason: 'Expected output "TOP_SECRET_OUTPUT_42" to equal "safe"',
        componentResults: [
          {
            pass: false,
            score: 0,
            reason: 'Expected output "TOP_SECRET_OUTPUT_42" to equal "safe"',
            assertion: { type: 'equals', value: 'safe' },
          },
        ],
      },
      promptId: 'output-leak',
    });

    const xml = await createJunitXml(eval_);
    const parsed = new XMLParser({ ignoreAttributes: false }).parse(xml);

    expect(parsed.testsuites.testsuite.testcase.failure).toMatchObject({
      '#text': 'Score: 0\nReason: Assertion failed\nFailed assertions:\n- equals',
      '@_message': 'Assertion failed',
    });
    expect(xml).not.toContain('TOP_SECRET_OUTPUT_42');
  });

  it('does not sanitize config for CSV output', async () => {
    const outputPath = 'output.csv';
    // @ts-expect-error getDb is mocked with a partial test double.
    vi.mocked(getDb).mockResolvedValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({ all: vi.fn().mockResolvedValue([]) }),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    const config: Record<string, unknown> = {};
    Object.defineProperty(config, 'bad', {
      enumerable: true,
      get() {
        throw new Error('getter boom');
      },
    });

    const eval_ = new Eval(config);
    await expect(writeOutput(outputPath, eval_, null)).resolves.toBeUndefined();
    expect(fsPromises.open).toHaveBeenCalledWith(outputPath, 'w');
  });

  it('does not sanitize config for JSONL output', async () => {
    const outputPath = 'output.jsonl';
    // @ts-expect-error getDb is mocked with a partial test double.
    vi.mocked(getDb).mockResolvedValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({ all: vi.fn().mockResolvedValue([]) }),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    const config: Record<string, unknown> = {};
    Object.defineProperty(config, 'bad', {
      enumerable: true,
      get() {
        throw new Error('getter boom');
      },
    });

    const eval_ = new Eval(config);
    await expect(writeOutput(outputPath, eval_, null)).resolves.toBeUndefined();
    expect(fsPromises.writeFile).toHaveBeenCalledWith(expect.stringMatching(/\.tmp$/), '');
    expect(fsPromises.rename).toHaveBeenCalledWith(expect.stringMatching(/\.tmp$/), outputPath);
  });

  it('rewrites JSONL through an external backup when the output directory is not writable', async () => {
    const permissionError = Object.assign(new Error('EACCES'), { code: 'EACCES' });
    vi.mocked(fsPromises.writeFile)
      .mockRejectedValueOnce(permissionError)
      .mockResolvedValueOnce(undefined);

    const outputPath = 'output.jsonl';
    await writeOutput(outputPath, new Eval({}), null);

    expect(fsPromises.writeFile).toHaveBeenNthCalledWith(1, expect.stringMatching(/\.tmp$/), '');
    expect(fsPromises.copyFile).toHaveBeenNthCalledWith(1, outputPath, JSONL_BACKUP_PATH);
    expect(fsPromises.writeFile).toHaveBeenNthCalledWith(2, JSONL_REPLACEMENT_PATH, '');
    expect(fsPromises.copyFile).toHaveBeenNthCalledWith(2, JSONL_REPLACEMENT_PATH, outputPath);
    expect(fsPromises.rename).not.toHaveBeenCalled();
  });

  it('warns when the temporary JSONL backup directory cannot be removed', async () => {
    const permissionError = Object.assign(new Error('EACCES'), { code: 'EACCES' });
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    vi.mocked(fsPromises.writeFile)
      .mockRejectedValueOnce(permissionError)
      .mockResolvedValueOnce(undefined);
    vi.mocked(fsPromises.rm).mockRejectedValueOnce(new Error('rm failed'));

    await writeOutput('output.jsonl', new Eval({}), null);

    expect(warnSpy).toHaveBeenCalledWith(
      '[Output] Failed to remove temporary JSONL backup directory',
      expect.objectContaining({
        tempDirectory: JSONL_TEMP_DIRECTORY,
      }),
    );
    warnSpy.mockRestore();
  });

  it('rewrites JSONL through an external backup when replacing the output file is not permitted', async () => {
    const permissionError = Object.assign(new Error('EPERM'), { code: 'EPERM' });
    vi.mocked(fsPromises.rename).mockRejectedValueOnce(permissionError);

    const outputPath = 'output.jsonl';
    const eval_ = new Eval({});
    const fetchResultsBatchedSpy = vi.spyOn(eval_, 'fetchResultsBatched');
    await writeOutput(outputPath, eval_, null);

    expect(fsPromises.rename).toHaveBeenCalledWith(expect.stringMatching(/\.tmp$/), outputPath);
    expect(fsPromises.rm).toHaveBeenCalledWith(expect.stringMatching(/\.tmp$/), { force: true });
    expect(fetchResultsBatchedSpy).toHaveBeenCalledTimes(1);
    expect(fsPromises.copyFile).toHaveBeenNthCalledWith(1, outputPath, JSONL_BACKUP_PATH);
    expect(fsPromises.copyFile).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(/\.tmp$/),
      JSONL_REPLACEMENT_PATH,
    );
    expect(fsPromises.copyFile).toHaveBeenNthCalledWith(3, JSONL_REPLACEMENT_PATH, outputPath);
  });

  it('warns when a populated JSONL sidecar cannot be removed after an external rewrite', async () => {
    const permissionError = Object.assign(new Error('EPERM'), { code: 'EPERM' });
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    vi.mocked(fsPromises.rename).mockRejectedValueOnce(permissionError);
    vi.mocked(fsPromises.rm)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('rm failed'));

    await writeOutput('output.jsonl', new Eval({}), null);

    expect(warnSpy).toHaveBeenCalledWith(
      '[Output] Failed to remove temporary JSONL output',
      expect.objectContaining({
        tempOutputPath: expect.stringMatching(/\.tmp$/),
      }),
    );
    warnSpy.mockRestore();
  });

  it('rewrites the target of a dangling JSONL symlink', async () => {
    const fileNotFoundError = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    const outputPath = path.join('artifacts', 'output.jsonl');
    const symlinkTarget = path.join('nested', 'missing.jsonl');
    const resolvedTarget = path.resolve(path.dirname(outputPath), symlinkTarget);
    vi.mocked(fsPromises.lstat).mockResolvedValueOnce({
      isSymbolicLink: () => true,
    } as never);
    vi.mocked(fsPromises.realpath).mockRejectedValueOnce(fileNotFoundError);
    vi.mocked(fsPromises.readlink).mockResolvedValueOnce(symlinkTarget);

    await writeOutput(outputPath, new Eval({}), null);

    expect(fsPromises.rename).toHaveBeenCalledWith(expect.stringMatching(/\.tmp$/), resolvedTarget);
  });

  it('creates the resolved target directory when rewriting a dangling JSONL symlink', async () => {
    const fileNotFoundError = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    const outputPath = path.join('artifacts', 'output.jsonl');
    const symlinkTarget = path.join('nested', 'missing.jsonl');
    const resolvedTarget = path.resolve(path.dirname(outputPath), symlinkTarget);
    vi.mocked(fsPromises.lstat).mockResolvedValueOnce({
      isSymbolicLink: () => true,
    } as never);
    vi.mocked(fsPromises.realpath).mockRejectedValueOnce(fileNotFoundError);
    vi.mocked(fsPromises.readlink).mockResolvedValueOnce(symlinkTarget);

    await writeOutput(outputPath, new Eval({}), null);

    // The link's resolved target may live in a directory that does not exist yet; it must be
    // created so the sibling temp-file rewrite can land next to it (otherwise the temp-file
    // write fails with ENOENT instead of preserving the symlink).
    expect(fsPromises.mkdir).toHaveBeenCalledWith(path.dirname(resolvedTarget), {
      recursive: true,
    });
    expect(fsPromises.rename).toHaveBeenCalledWith(expect.stringMatching(/\.tmp$/), resolvedTarget);
  });

  it('surfaces the permission error when a first-time JSONL write hits a read-only directory', async () => {
    const accessError = Object.assign(new Error('EACCES'), { code: 'EACCES' });
    const fileNotFoundError = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    // The output file does not exist yet and its directory is not writable: the temp-file
    // create fails with EACCES, routing into the external-backup fallback.
    vi.mocked(fsPromises.writeFile)
      .mockRejectedValueOnce(accessError) // temp file in the read-only output directory
      .mockResolvedValueOnce(undefined); // replacement file in the OS temp directory
    // There is no existing artifact to back up (ENOENT); the replacement copy back into the
    // read-only directory then fails with the real EACCES, which must be what surfaces.
    vi.mocked(fsPromises.copyFile)
      .mockRejectedValueOnce(fileNotFoundError) // copyFile(outputPath, backup) → ENOENT (absent)
      .mockRejectedValueOnce(accessError); // copyFile(replacement, outputPath) → EACCES

    await expect(writeOutput('output.jsonl', new Eval({}), null)).rejects.toThrow('EACCES');

    // No backup was ever created, so the restore copy must be skipped (exactly two copies).
    expect(fsPromises.copyFile).toHaveBeenCalledTimes(2);
  });

  it('restores the JSONL backup when an external rewrite fails', async () => {
    const permissionError = Object.assign(new Error('EACCES'), { code: 'EACCES' });
    const copyError = new Error('copy failed');
    vi.mocked(fsPromises.writeFile)
      .mockRejectedValueOnce(permissionError)
      .mockResolvedValueOnce(undefined);
    vi.mocked(fsPromises.copyFile)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(copyError)
      .mockResolvedValueOnce(undefined);

    const outputPath = 'output.jsonl';
    await expect(writeOutput(outputPath, new Eval({}), null)).rejects.toThrow('copy failed');

    expect(fsPromises.copyFile).toHaveBeenNthCalledWith(3, JSONL_BACKUP_PATH, outputPath);
  });

  it('preserves the existing JSONL artifact when an external backup cannot be created', async () => {
    const permissionError = Object.assign(new Error('EACCES'), { code: 'EACCES' });
    vi.mocked(fsPromises.writeFile).mockRejectedValueOnce(permissionError);
    vi.mocked(fsPromises.copyFile).mockRejectedValueOnce(new Error('backup failed'));

    const outputPath = 'output.jsonl';
    await expect(writeOutput(outputPath, new Eval({}), null)).rejects.toThrow('backup failed');

    expect(fsPromises.copyFile).toHaveBeenCalledTimes(1);
  });

  it('retains the external JSONL backup when restoration fails', async () => {
    const permissionError = Object.assign(new Error('EACCES'), { code: 'EACCES' });
    vi.mocked(fsPromises.writeFile)
      .mockRejectedValueOnce(permissionError)
      .mockResolvedValueOnce(undefined);
    vi.mocked(fsPromises.copyFile)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('copy failed'))
      .mockRejectedValueOnce(new Error('restore failed'));

    const outputPath = 'output.jsonl';
    await expect(writeOutput(outputPath, new Eval({}), null)).rejects.toThrow(
      `Backup retained at ${JSONL_BACKUP_PATH}`,
    );

    expect(fsPromises.rm).not.toHaveBeenCalledWith(JSONL_TEMP_DIRECTORY, {
      recursive: true,
      force: true,
    });
  });

  it('preserves the existing output file permissions across the atomic JSONL rewrite', async () => {
    const outputPath = 'output.jsonl';
    vi.mocked(fsPromises.stat).mockResolvedValueOnce({ mode: 0o600 } as Awaited<
      ReturnType<typeof fsPromises.stat>
    >);

    const eval_ = new Eval({});
    await expect(writeOutput(outputPath, eval_, null)).resolves.toBeUndefined();

    // The temp file is chmod'd to the destination's prior mode before the rename, so a
    // restricted (0600) reused path is not silently widened to the umask default.
    expect(fsPromises.chmod).toHaveBeenCalledWith(expect.stringMatching(/\.tmp$/), 0o600);
    expect(fsPromises.rename).toHaveBeenCalledWith(expect.stringMatching(/\.tmp$/), outputPath);
  });

  it('skips the chmod when the JSONL output file does not yet exist', async () => {
    const outputPath = 'output.jsonl';
    vi.mocked(fsPromises.stat).mockRejectedValueOnce(
      Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
    );

    const eval_ = new Eval({});
    await expect(writeOutput(outputPath, eval_, null)).resolves.toBeUndefined();

    expect(fsPromises.chmod).not.toHaveBeenCalled();
    expect(fsPromises.rename).toHaveBeenCalledWith(expect.stringMatching(/\.tmp$/), outputPath);
  });

  it('keeps newly streamed retry rows ahead of stale persisted rows after a save failure', async () => {
    const outputPath = 'output.jsonl';
    const staleResult: EvaluateResult = {
      success: false,
      failureReason: ResultFailureReason.ERROR,
      score: 0,
      namedScores: {},
      latencyMs: 100,
      provider: { id: 'provider' },
      prompt: { raw: 'Test prompt', label: 'Test prompt' },
      response: { error: 'stale persisted error' },
      vars: {},
      promptIdx: 0,
      testIdx: 0,
      testCase: {},
      promptId: 'prompt',
    };
    const retriedResult: EvaluateResult = {
      ...staleResult,
      success: true,
      failureReason: ResultFailureReason.NONE,
      score: 1,
      response: { output: 'fresh streamed retry' },
    };
    const eval_ = new Eval({});
    eval_.recordResultPersistenceFailure(retriedResult);
    vi.mocked(fsPromises.readFile).mockResolvedValue(
      `${JSON.stringify(staleResult)}\n${JSON.stringify(retriedResult)}\n`,
    );
    vi.spyOn(eval_, 'fetchResultsBatched').mockImplementation(async function* () {
      yield [staleResult as any];
    });

    await writeOutput(outputPath, eval_, null);

    const written = vi.mocked(fsPromises.appendFile).mock.calls[0][1] as string;
    expect(
      written
        .trim()
        .split(/\r?\n/)
        .map((line) => JSON.parse(line)),
    ).toEqual([
      expect.objectContaining({
        failureReason: ResultFailureReason.NONE,
        response: { output: 'fresh streamed retry' },
        score: 1,
        success: true,
      }),
    ]);
  });

  it('skips a malformed (truncated) streamed JSONL row during recovery instead of aborting', async () => {
    const outputPath = 'output.jsonl';
    const goodResult: EvaluateResult = {
      success: true,
      failureReason: ResultFailureReason.NONE,
      score: 1,
      namedScores: {},
      latencyMs: 10,
      provider: { id: 'provider' },
      prompt: { raw: 'Test prompt', label: 'Test prompt' },
      response: { output: 'recovered streamed row' },
      vars: {},
      promptIdx: 0,
      testIdx: 0,
      testCase: {},
      promptId: 'prompt',
    };
    const eval_ = new Eval({});
    eval_.resultPersistenceFailed = true;
    // A complete row followed by a truncated final row, as a killed/crashed run can leave.
    vi.mocked(fsPromises.readFile).mockResolvedValue(
      `${JSON.stringify(goodResult)}\n{"testIdx":1,"promptIdx":0,"resp`,
    );
    vi.spyOn(eval_, 'fetchResultsBatched').mockImplementation(async function* () {});

    await expect(writeOutput(outputPath, eval_, null)).resolves.toBeUndefined();

    const written = vi.mocked(fsPromises.appendFile).mock.calls[0][1] as string;
    expect(
      written
        .trim()
        .split(/\r?\n/)
        .map((line) => JSON.parse(line)),
    ).toEqual([
      expect.objectContaining({ testIdx: 0, response: { output: 'recovered streamed row' } }),
    ]);
  });

  it('writeOutput with json and txt output', async () => {
    const outputPath = ['output.json', 'output.txt'];
    const eval_ = new Eval({});

    await writeMultipleOutputs(outputPath, eval_, null);

    expect(fsPromises.writeFile).toHaveBeenCalledTimes(2);
  });

  it('waits for every output write before rejecting', async () => {
    let resolveSlowWrite: () => void;
    const slowWrite = new Promise<void>((resolve) => {
      resolveSlowWrite = resolve;
    });
    vi.mocked(fsPromises.writeFile).mockImplementation(async (outputPath) => {
      if (outputPath === 'output.json') {
        throw new Error('json write failed');
      }
      if (outputPath === 'output.txt') {
        await slowWrite;
      }
    });

    let settled = false;
    const writePromise = writeMultipleOutputs(['output.json', 'output.txt'], new Eval({}), null);
    void writePromise.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );

    await vi.waitFor(() => {
      expect(fsPromises.writeFile).toHaveBeenCalledTimes(2);
    });
    expect(settled).toBe(false);

    resolveSlowWrite!();
    await expect(writePromise).rejects.toThrow('One or more output writes failed');
  });

  it('writeOutput with HTML template escapes special characters', async () => {
    // Use the real fs module to read the template
    const realFs = await vi.importActual<typeof import('fs')>('fs');
    const templatePath = path.resolve(__dirname, '../../src/tableOutput.html');
    const templateContent = realFs.readFileSync(templatePath, 'utf-8');

    // Check that the template has escape filters on all user-provided content
    expect(templateContent).toContain("{{ config.description | default('Eval Output') | escape }}");
    expect(templateContent).toContain('{{ header | escape }}');
    expect(templateContent).toContain('{{ cell.text | escape }}');
    expect(templateContent).toContain('{{ cell.reason | escape }}');
    expect(templateContent).toContain('{{ cell.error | escape }}');
    expect(templateContent).toContain('{{ cell.description | escape }}');

    // Ensure structured output content and derived search fields are escaped.
    expect(templateContent).toContain('data-search="{{ cell.statusLabel | escape }}');
    expect(templateContent).toContain('{{ cell.error | escape }}"');
    expect(templateContent).toContain('data-report-search');
    expect(templateContent).toContain('data-status-filter');
    expect(templateContent).toContain('data-visible-count');
    expect(templateContent).toContain('data-output-cell="true"');
    expect(templateContent).toContain('data-status="{{ cell.status | escape }}"');
    expect(templateContent).toContain('data-variable-name="{{ cell.name | escape }}"');
    expect(templateContent).toContain('status-pill {{ cell.status | escape }}');
    expect(templateContent).toContain('data-open-detail');
    expect(templateContent).toContain('data-detail-drawer');
    expect(templateContent).toContain('data-detail-template');
    expect(templateContent).toContain('appendVariableDetails(trigger);');
    expect(templateContent).not.toContain('{% for variable in cell.variables %}');
  });

  it('writeOutput with HTML includes report summary values', async () => {
    const realFs = await vi.importActual<typeof import('fs')>('fs');
    const templatePath = path.resolve(__dirname, '../../src/tableOutput.html');
    const templateContent = realFs.readFileSync(templatePath, 'utf-8');
    vi.mocked(fsPromises.readFile).mockResolvedValue(templateContent);

    const eval_ = new Eval({ description: 'HTML facelift report' });
    await eval_.addPrompts([{ raw: 'Prompt', label: 'Prompt', provider: 'provider' }]);
    eval_.setVars(['input']);

    await eval_.addResult({
      success: true,
      failureReason: ResultFailureReason.NONE,
      score: 1,
      namedScores: {},
      latencyMs: 100,
      provider: { id: 'provider' },
      prompt: { raw: 'Prompt', label: 'Prompt' },
      response: { output: 'Passing output' },
      vars: { input: 'one' },
      promptIdx: 0,
      testIdx: 0,
      testCase: { vars: { input: 'one' }, description: 'Passing <test> description' },
      promptId: 'prompt',
      gradingResult: {
        pass: true,
        score: 1,
        reason: 'Passing reason',
      },
    });
    await eval_.addResult({
      success: false,
      failureReason: ResultFailureReason.ASSERT,
      score: 0,
      namedScores: {},
      latencyMs: 100,
      provider: { id: 'provider' },
      prompt: { raw: 'Prompt', label: 'Prompt' },
      response: { output: 'Failing output' },
      vars: { input: 'two' },
      promptIdx: 0,
      testIdx: 1,
      testCase: { vars: { input: 'two' } },
      promptId: 'prompt',
      gradingResult: {
        pass: false,
        score: 0,
        reason: 'Failing reason',
      },
    });

    await writeOutput('output.html', eval_, null);

    const html = vi.mocked(fsPromises.writeFile).mock.calls[0][1] as string;
    expect(html).toContain('HTML facelift report');
    expect(html).toContain('<p class="metric-label">Total Results</p>');
    expect(html).toContain('<p class="metric-value">2</p>');
    expect(html).toContain('50.0%');
    expect(html).toContain('>PASS<');
    expect(html).toContain('>FAIL<');
    expect(html).toContain('Score 1.00');
    expect(html).toContain('Score 0.00');
    expect(html).toContain('Passing output');
    expect(html).toContain('Failing output');
    expect(html).toContain('Passing &lt;test&gt; description');
    expect(html).not.toContain('Passing <test> description');
    expect(html).toContain('Passing reason');
    expect(html).toContain('Failing reason');
    expect(html).toContain('View detail');
    expect(html).toContain('Result detail - row 1, prompt 1');
    expect(html).toContain('Prompt');
    expect(html).toContain('Variables');
    expect(html).toContain('data-report-search');
    expect(html).toContain('No rows match the current search and status filters.');
  });

  it('writeOutput with HTML projects legacy table data and tolerates nullish cells', async () => {
    const realFs = await vi.importActual<typeof import('fs')>('fs');
    const templatePath = path.resolve(__dirname, '../../src/tableOutput.html');
    const templateContent = realFs.readFileSync(templatePath, 'utf-8');
    vi.mocked(fsPromises.readFile).mockResolvedValue(templateContent);
    const restoreEnv = mockProcessEnv({
      PROMPTFOO_STRIP_PROMPT_TEXT: 'true',
      PROMPTFOO_STRIP_RESPONSE_OUTPUT: 'true',
      PROMPTFOO_STRIP_TEST_VARS: 'true',
    });

    try {
      const eval_ = new Eval({ description: 'Legacy HTML projection' });
      const v2Summary = createLegacyV2Summary();
      const output = v2Summary.table.body[0].outputs[0];
      v2Summary.table.body[0].outputs = [null, output] as any[];
      vi.spyOn(eval_, 'getTable').mockResolvedValue(
        v2Summary.table as unknown as Awaited<ReturnType<typeof eval_.getTable>>,
      );
      vi.spyOn(eval_, 'toEvaluateSummary').mockResolvedValue(
        v2Summary as unknown as Awaited<ReturnType<typeof eval_.toEvaluateSummary>>,
      );

      await writeOutput('output.html', eval_, null);

      const html = vi.mocked(fsPromises.writeFile).mock.calls[0][1] as string;
      expect(html).toContain('[prompt stripped]');
      expect(html).toContain('[output stripped]');
      expect(html).toContain('Result detail - row 1, prompt 2');
      expect(html).not.toContain('rendered-prompt-secret');
      expect(html).not.toContain('response-text-secret');
      expect(html).not.toContain('row-api-key-secret');
      expect(html).not.toContain('keep-row');
    } finally {
      restoreEnv();
    }
  });

  it('writeOutput with HTML classifies non-error failures as failures', async () => {
    const realFs = await vi.importActual<typeof import('fs')>('fs');
    const templatePath = path.resolve(__dirname, '../../src/tableOutput.html');
    const templateContent = realFs.readFileSync(templatePath, 'utf-8');
    vi.mocked(fsPromises.readFile).mockResolvedValue(templateContent);

    const eval_ = new Eval({ description: 'HTML failure classification' });
    await eval_.addPrompts([{ raw: 'Prompt', label: 'Prompt', provider: 'provider' }]);
    eval_.setVars(['input']);

    await eval_.addResult({
      success: false,
      failureReason: ResultFailureReason.NONE,
      score: 0,
      namedScores: {},
      latencyMs: 100,
      provider: { id: 'provider' },
      prompt: { raw: 'Prompt', label: 'Prompt' },
      response: { output: '' },
      vars: { input: 'missing-output' },
      promptIdx: 0,
      testIdx: 0,
      testCase: { vars: { input: 'missing-output' } },
      promptId: 'prompt',
    });

    await writeOutput('output.html', eval_, null);

    const html = vi.mocked(fsPromises.writeFile).mock.calls[0][1] as string;
    expect(html).toContain('data-status="fail"');
    expect(html).toContain('>FAIL<');
  });

  it('writeOutput with HTML keeps visible runtime errors searchable without pre-rendering row variables per output', async () => {
    const realFs = await vi.importActual<typeof import('fs')>('fs');
    const templatePath = path.resolve(__dirname, '../../src/tableOutput.html');
    const templateContent = realFs.readFileSync(templatePath, 'utf-8');
    vi.mocked(fsPromises.readFile).mockResolvedValue(templateContent);

    const eval_ = new Eval({ description: 'HTML error search' });
    await eval_.addPrompts([{ raw: 'Prompt', label: 'Prompt', provider: 'provider' }]);
    eval_.setVars(['input']);

    await eval_.addResult({
      success: false,
      failureReason: ResultFailureReason.ERROR,
      score: 0,
      namedScores: {},
      latencyMs: 100,
      provider: { id: 'provider' },
      prompt: { raw: 'Prompt', label: 'Prompt' },
      response: { output: 'Visible output despite failure' },
      error: 'provider timed out',
      vars: { input: 'shared value' },
      promptIdx: 0,
      testIdx: 0,
      testCase: { vars: { input: 'shared value' } },
      promptId: 'prompt',
      gradingResult: {
        pass: false,
        score: 0,
        reason: 'Evaluation failed',
      },
    });

    await writeOutput('output.html', eval_, null);

    const html = vi.mocked(fsPromises.writeFile).mock.calls[0][1] as string;
    expect(html).toContain(
      'data-search="ERROR 0.00 provider timed out Evaluation failed provider timed out"',
    );
    expect(html).toContain('data-variable-name="input"');
    expect(html).not.toContain('<span class="detail-variable-name">');
    expect(html).toContain('appendVariableDetails(trigger);');
  });

  it('writes output to Google Sheets', async () => {
    const outputPath = 'https://docs.google.com/spreadsheets/d/1234567890/edit#gid=0';

    const config = { description: 'Test config' };
    const shareableUrl = null;
    const eval_ = new Eval(config);

    await writeOutput(outputPath, eval_, shareableUrl);

    expect(googleSheets.writeCsvToGoogleSheet).toHaveBeenCalledTimes(1);
  });

  it('writes Google Sheets output with provider in column headers', async () => {
    const outputPath = 'https://docs.google.com/spreadsheets/d/1234567890/edit#gid=0';

    const eval_ = new Eval({});
    await eval_.addPrompts([{ raw: 'prompt1', label: 'First Prompt', provider: 'openai:gpt-4' }]);
    eval_.setVars(['input']);

    const result: EvaluateResult = {
      success: true,
      failureReason: ResultFailureReason.NONE,
      score: 1.0,
      namedScores: {},
      latencyMs: 100,
      provider: { id: 'openai:gpt-4' },
      prompt: { raw: 'prompt1', label: 'First Prompt' },
      response: { output: 'Test output' },
      vars: { input: 'test input' },
      promptIdx: 0,
      testIdx: 0,
      testCase: { vars: { input: 'test input' } },
      promptId: 'prompt1',
    };
    await eval_.addResult(result);

    await writeOutput(outputPath, eval_, null);

    expect(googleSheets.writeCsvToGoogleSheet).toHaveBeenCalledTimes(1);
    const rows = vi.mocked(googleSheets.writeCsvToGoogleSheet).mock.calls[0][0];
    expect(rows.length).toBeGreaterThan(0);

    const columnKeys = Object.keys(rows[0]);
    expect(columnKeys).toContain('[openai:gpt-4] First Prompt');
  });

  it('writes Google Sheets output with multiple providers in column headers', async () => {
    const outputPath = 'https://docs.google.com/spreadsheets/d/1234567890/edit#gid=0';

    const eval_ = new Eval({});
    await eval_.addPrompts([
      { raw: 'prompt1', label: 'Test Prompt', provider: 'openai:gpt-4' },
      { raw: 'prompt1', label: 'Test Prompt', provider: 'anthropic:claude-3' },
    ]);
    eval_.setVars(['input']);

    await eval_.addResult({
      success: true,
      failureReason: ResultFailureReason.NONE,
      score: 1.0,
      namedScores: {},
      latencyMs: 100,
      provider: { id: 'openai:gpt-4' },
      prompt: { raw: 'prompt1', label: 'Test Prompt' },
      response: { output: 'GPT-4 output' },
      vars: { input: 'test input' },
      promptIdx: 0,
      testIdx: 0,
      testCase: { vars: { input: 'test input' } },
      promptId: 'prompt1',
    });
    await eval_.addResult({
      success: true,
      failureReason: ResultFailureReason.NONE,
      score: 0.8,
      namedScores: {},
      latencyMs: 150,
      provider: { id: 'anthropic:claude-3' },
      prompt: { raw: 'prompt1', label: 'Test Prompt' },
      response: { output: 'Claude output' },
      vars: { input: 'test input' },
      promptIdx: 1,
      testIdx: 0,
      testCase: { vars: { input: 'test input' } },
      promptId: 'prompt1',
    });

    await writeOutput(outputPath, eval_, null);

    expect(googleSheets.writeCsvToGoogleSheet).toHaveBeenCalledTimes(1);
    const rows = vi.mocked(googleSheets.writeCsvToGoogleSheet).mock.calls[0][0];
    expect(rows.length).toBeGreaterThan(0);

    const columnKeys = Object.keys(rows[0]);
    expect(columnKeys).toContain('[openai:gpt-4] Test Prompt');
    expect(columnKeys).toContain('[anthropic:claude-3] Test Prompt');
  });
});

describe('warnOnDegradedJsonlRecovery', () => {
  it('warns once when a row failed to persist and a JSONL artifact is being reconciled', () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    const eval_ = new Eval({});
    eval_.resultPersistenceFailed = true;

    warnOnDegradedJsonlRecovery(eval_, [
      'results.jsonl',
      'results.JSONL',
      'results.json',
      'results.yaml',
    ]);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });

  it('does not warn when no row failed to persist', () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    const eval_ = new Eval({});

    warnOnDegradedJsonlRecovery(eval_, ['results.jsonl', 'results.json']);

    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('does not warn when the persistence failure does not touch a JSONL artifact', () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    const eval_ = new Eval({});
    eval_.resultPersistenceFailed = true;

    warnOnDegradedJsonlRecovery(eval_, ['results.json', 'results.yaml']);

    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe('createOutputMetadata', () => {
  it('should create metadata with all fields when evalRecord has all data', async () => {
    const evalRecord = {
      createdAt: new Date('2025-01-01T12:00:00.000Z').getTime(),
      author: 'test-author',
    } as any as Eval;

    const metadata = createOutputMetadata(evalRecord);

    expect(metadata).toMatchObject({
      promptfooVersion: expect.any(String),
      nodeVersion: expect.stringMatching(/^v\d+\.\d+\.\d+/),
      platform: expect.any(String),
      arch: expect.any(String),
      exportedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
      evaluationCreatedAt: '2025-01-01T12:00:00.000Z',
      author: 'test-author',
    });
  });

  it('should handle missing createdAt gracefully', async () => {
    const evalRecord = {
      author: 'test-author',
    } as any as Eval;

    const metadata = createOutputMetadata(evalRecord);

    expect(metadata).toMatchObject({
      promptfooVersion: expect.any(String),
      nodeVersion: expect.stringMatching(/^v\d+\.\d+\.\d+/),
      platform: expect.any(String),
      arch: expect.any(String),
      exportedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
      evaluationCreatedAt: undefined,
      author: 'test-author',
    });
  });

  it('should handle missing author', async () => {
    const evalRecord = {
      createdAt: new Date('2025-01-01T12:00:00.000Z').getTime(),
    } as any as Eval;

    const metadata = createOutputMetadata(evalRecord);

    expect(metadata).toMatchObject({
      promptfooVersion: expect.any(String),
      nodeVersion: expect.stringMatching(/^v\d+\.\d+\.\d+/),
      platform: expect.any(String),
      arch: expect.any(String),
      exportedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
      evaluationCreatedAt: '2025-01-01T12:00:00.000Z',
      author: undefined,
    });
  });

  it('should handle invalid date in createdAt', async () => {
    const evalRecord = {
      createdAt: 'invalid-date',
      author: 'test-author',
    } as any as Eval;

    const metadata = createOutputMetadata(evalRecord);

    // When new Date() is given invalid input, it returns "Invalid Date"
    expect(metadata).toMatchObject({
      promptfooVersion: expect.any(String),
      nodeVersion: expect.stringMatching(/^v\d+\.\d+\.\d+/),
      platform: expect.any(String),
      arch: expect.any(String),
      exportedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
      evaluationCreatedAt: undefined,
      author: 'test-author',
    });
  });

  it('should create consistent exportedAt timestamps', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-15T10:30:00.000Z'));

    const evalRecord = {} as any as Eval;
    const metadata = createOutputMetadata(evalRecord);

    expect(metadata.exportedAt).toBe('2025-01-15T10:30:00.000Z');

    vi.useRealTimers();
  });
});
