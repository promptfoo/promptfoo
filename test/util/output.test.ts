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
  filterOutputPathsAfterStreaming,
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
    const symlinkTarget = path.join('nested', 'missing.jsonl');
    const resolvedTarget = path.resolve(symlinkTarget);
    vi.mocked(fsPromises.lstat).mockResolvedValueOnce({
      isSymbolicLink: () => true,
    } as never);
    vi.mocked(fsPromises.realpath).mockRejectedValueOnce(fileNotFoundError);
    vi.mocked(fsPromises.readlink).mockResolvedValueOnce(symlinkTarget);

    await writeOutput('output.jsonl', new Eval({}), null);

    expect(fsPromises.rename).toHaveBeenCalledWith(expect.stringMatching(/\.tmp$/), resolvedTarget);
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

  it('writeOutput with json and txt output', async () => {
    const outputPath = ['output.json', 'output.txt'];
    const eval_ = new Eval({});

    await writeMultipleOutputs(outputPath, eval_, null);

    expect(fsPromises.writeFile).toHaveBeenCalledTimes(2);
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

describe('filterOutputPathsAfterStreaming', () => {
  it('keeps streamed JSONL artifacts intact after a row persistence failure', () => {
    const eval_ = new Eval({});
    eval_.resultPersistenceFailed = true;

    expect(
      filterOutputPathsAfterStreaming(eval_, [
        'results.jsonl',
        'results.JSONL',
        'results.json',
        'results.yaml',
      ]),
    ).toEqual(['results.json', 'results.yaml']);
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
