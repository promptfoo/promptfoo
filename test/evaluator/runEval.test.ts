import { createTokenOutput } from '../factories/literalFixtures';
import './setup';

import { getEventListeners } from 'node:events';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import fs from 'fs/promises';

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCache } from '../../src/cache';
import { runEval } from '../../src/evaluator';
import logger from '../../src/logger';
import { geminiFormatAndSystemInstructions } from '../../src/providers/google/util';
import { PromptfooSimulatedUserProvider } from '../../src/providers/promptfoo';
import { SequenceProvider } from '../../src/providers/sequence';
import { SimulatedUser } from '../../src/providers/simulatedUser';
import { RedteamGraderBase } from '../../src/redteam/plugins/base';
import { callTargetProvider } from '../../src/redteam/providers/shared';
import { RateLimitRegistry } from '../../src/scheduler/rateLimitRegistry';
import {
  type ApiProvider,
  type CallApiContextParams,
  type Prompt,
  ResultFailureReason,
  type TestSuite,
} from '../../src/types/index';
import * as fileExtensions from '../../src/util/fileExtensions';
import { sleep } from '../../src/util/time';
import { TRUSTED_REDACTION_GRADER } from '../../src/util/traceRedaction';
import { mockGradingApiProviderPasses, resetMockProviders } from './helpers';

const createEmptyEvaluationConfig = () => ({
  providers: [],
  prompts: [],
});

const createAsciiSmugglingMetadata = () => ({
  pluginId: 'ascii-smuggling',
});

const createInitialRunOptions = () => ({
  delay: 0,
  testIdx: 0,
  promptIdx: 0,
  repeatIndex: 0,
  isRedteam: false,
});

const createCappedRedteamConfig = () => ({
  providers: [],
  prompts: [],
  redteam: {
    maxCharsPerMessage: 10,
  },
});

describe('runEval', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockProviders();
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.clearAllMocks();
    await clearCache();
  });

  afterAll(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  const mockProvider: ApiProvider = {
    id: vi.fn().mockReturnValue('test-provider'),
    callApi: vi.fn().mockResolvedValue(createTokenOutput()),
  };

  const defaultOptions = createInitialRunOptions();

  it.each(['missing', 'failed', 'no-evidence'])(
    'checks local evidence for a %s response',
    async (state) => {
      const dir = fsSync.mkdtempSync(path.join(os.tmpdir(), 'evidence-'));
      const ledger = path.join(dir, 'ledger');
      const judge = vi.spyOn(RedteamGraderBase.prototype, 'getResult');
      try {
        fsSync.writeFileSync(ledger, '');
        const [row] = await runEval({
          ...defaultOptions,
          provider: {
            id: () => 'fixture',
            callApi: async () => {
              if (state !== 'no-evidence') {
                fsSync.appendFileSync(ledger, JSON.stringify({ canaryInParameters: true }) + '\n');
              }
              return state === 'missing' ? {} : { error: 'Target failed' };
            },
          },
          prompt: { raw: 'Inspect local report', label: 'report' },
          test: {
            assert: [
              {
                type: 'promptfoo:redteam:coding-agent:connector-parameter-exfil',
                value: { connectorSinkLedgerPath: ledger },
              },
            ],
          },
        });
        expect(judge).not.toHaveBeenCalled();
        expect(row.success).toBe(false);
        if (state === 'no-evidence') {
          expect(row.failureReason).toBe(ResultFailureReason.ERROR);
        } else {
          expect(row.failureReason).toBe(ResultFailureReason.ASSERT);
          expect(row.gradingResult?.metadata?.deterministicFailure).toBe(true);
        }
      } finally {
        judge.mockRestore();
        fsSync.rmSync(dir, { recursive: true, force: true });
      }
    },
  );

  it.each(
    (['adaptive', 'sequence', 'simulation'] as const).flatMap((kind) => [
      { kind, verifier: true, cached: true },
      { kind, verifier: true, cached: false },
      { kind, verifier: false, cached: true },
    ]),
  )(
    'checks all $kind target turns for freshness (verifier=$verifier, cached=$cached)',
    async ({ kind, verifier, cached }) => {
      const directory = fsSync.mkdtempSync(path.join(os.tmpdir(), 'nested-ledger-'));
      const connectorSinkLedgerPath = path.join(directory, 'ledger');
      const judge = vi.spyOn(RedteamGraderBase.prototype, 'getResult').mockResolvedValue({
        grade: { pass: true, score: 1, reason: 'No finding' },
        rubric: 'Fixture',
      });
      try {
        fsSync.writeFileSync(connectorSinkLedgerPath, '');
        const target: ApiProvider = {
          id: () => 'target',
          callApi: vi
            .fn()
            .mockResolvedValueOnce({ output: 'First', cached })
            .mockResolvedValueOnce({ output: 'Last' }),
        };
        const adaptive: ApiProvider = {
          id: () => 'promptfoo:redteam:hydra',
          callApi: async (prompt, context, options) => {
            await callTargetProvider(target, prompt, context, options);
            return callTargetProvider(target, prompt, context, options);
          },
        };
        // Cached simulated users must not invalidate fresh target evidence.
        vi.spyOn(PromptfooSimulatedUserProvider.prototype, 'callApi').mockResolvedValue({
          output: 'Next',
          cached: true,
        });
        const providers = {
          adaptive,
          sequence: new SequenceProvider({ id: 'sequence', config: { inputs: ['First', 'Last'] } }),
          simulation: new SimulatedUser({
            id: 'promptfoo:simulated-user',
            config: { maxTurns: 2 },
          }),
        };
        const expected = {
          adaptive: 'Last',
          sequence: 'First\n---\nLast',
          simulation: 'User: Next\n---\nAssistant: First\n---\nUser: Next\n---\nAssistant: Last',
        }[kind];
        const [row] = await runEval({
          ...defaultOptions,
          provider: target,
          prompt: { raw: 'Inspect local report', label: 'report' },
          test: {
            provider: providers[kind],
            assert: verifier
              ? [
                  {
                    type: 'promptfoo:redteam:coding-agent:connector-parameter-exfil',
                    value: { connectorSinkLedgerPath },
                  },
                ]
              : [{ type: 'equals', value: expected }],
          },
        });
        expect(target.callApi).toHaveBeenCalledTimes(2);
        expect(row.success).toBe(!(verifier && cached));
        if (verifier && cached) {
          expect(row.failureReason).toBe(ResultFailureReason.ERROR);
          expect(row.error).toContain('requires a fresh target call');
          expect(judge).not.toHaveBeenCalled();
        } else {
          expect(row.response?.output).toBe(expected);
          expect(row.response?.cached).not.toBe(true);
          if (kind !== 'adaptive') {
            const usage = row.response?.tokenUsage;
            expect(usage?.numRequests).toBe(kind === 'simulation' ? 4 : 2);
            expect((usage?.incurredTokenUsage ?? usage)?.numRequests).toBe(cached ? 1 : 2);
          }
        }
      } finally {
        judge.mockRestore();
        fsSync.rmSync(directory, { recursive: true, force: true });
      }
    },
  );

  it('rejects cached target evidence after a protected receipt rotates', async () => {
    const directory = fsSync.mkdtempSync(path.join(os.tmpdir(), 'rotating-receipt-'));
    try {
      const receipt = path.join(directory, 'receipt');
      fsSync.writeFileSync(receipt, 'PRIVATE_RECEIPT_B');
      const [result] = await runEval({
        ...defaultOptions,
        provider: {
          id: () => 'cached-target',
          callApi: async () => ({ output: 'PRIVATE_RECEIPT_A', cached: true }),
        },
        prompt: { raw: 'Inspect report', label: 'report' },
        test: {
          assert: [
            {
              type: 'promptfoo:redteam:coding-agent:trace-redaction',
              value: { rawReceiptPath: receipt },
            },
          ],
        },
        conversations: {},
        registers: {},
      });
      expect(result.success).toBe(false);
      expect(result.failureReason).toBe(ResultFailureReason.ERROR);
      expect(result.error).toBe('Error details omitted for trace/artifact redaction.');
    } finally {
      fsSync.rmSync(directory, { recursive: true, force: true });
    }
  });

  it.each(['coding-agent:trace-redaction', 'harness:artifact-redaction'] as const)(
    'omits %s provider errors from logs and returned results',
    async (plugin) => {
      const error = Object.assign(new Error('PRIVATE_ERROR_RECEIPT'), {
        response: { data: 'PRIVATE_BODY_RECEIPT' },
      });
      const log = vi.spyOn(logger, 'error');
      const [result] = await runEval({
        ...defaultOptions,
        provider: {
          id: () => 'private-error-target',
          callApi: async () => {
            throw error;
          },
        },
        prompt: { raw: 'Inspect report', label: 'report' },
        test: {
          assert: [
            {
              type: `promptfoo:redteam:${plugin}`,
              value: { rawReceipt: 'PRIVATE_ERROR_RECEIPT' },
            },
          ],
        },
        conversations: {},
        registers: {},
      });
      expect(result.success).toBe(false);
      expect(result.failureReason).toBe(ResultFailureReason.ERROR);
      expect(result.error).toBe('Error details omitted for trace/artifact redaction.');
      expect(JSON.stringify(result)).not.toContain('PRIVATE_ERROR_RECEIPT');
      expect(JSON.stringify(result)).not.toContain('PRIVATE_BODY_RECEIPT');
      expect(log).toHaveBeenCalledWith(
        'Provider call failed during eval',
        expect.objectContaining({ error: 'Private provider error omitted.' }),
      );
      expect(JSON.stringify(log.mock.calls)).not.toContain('PRIVATE_ERROR_RECEIPT');
      expect(JSON.stringify(log.mock.calls)).not.toContain('PRIVATE_BODY_RECEIPT');
    },
  );

  it('snapshots protected receipts for standalone target calls', async () => {
    const directory = fsSync.mkdtempSync(path.join(os.tmpdir(), 'standalone-receipt-'));
    try {
      const receipt = path.join(directory, 'receipt');
      const secret = 'ORIGINAL_STANDALONE_RECEIPT';
      fsSync.writeFileSync(receipt, secret);
      const results = await runEval({
        ...defaultOptions,
        provider: {
          id: () => 'receipt-target',
          async callApi() {
            fsSync.unlinkSync(receipt);
            return { output: secret };
          },
        },
        prompt: { raw: 'Inspect report', label: 'report' },
        test: {
          assert: [
            {
              type: 'promptfoo:redteam:coding-agent:trace-redaction',
              value: { rawReceiptPath: receipt },
            },
          ],
        },
        conversations: {},
        registers: {},
      });
      expect(results[0].success).toBe(false);
      expect(JSON.stringify(results[0].gradingResult)).toContain(
        'redacted-artifact-sensitive-value',
      );
      expect(JSON.stringify(results[0].gradingResult)).not.toContain(secret);
    } finally {
      fsSync.rmSync(directory, { recursive: true, force: true });
    }
  });

  it.each(
    ['json', 'yaml'].flatMap((extension) =>
      ['overwrite', 'delete', 'create'].map((mode) => ({ extension, mode })),
    ),
  )(
    'keeps a static $extension assertion plan fixed when the target uses $mode',
    async ({ extension, mode }) => {
      const directory = fsSync.mkdtempSync(path.join(os.tmpdir(), 'static-assertion-plan-'));
      try {
        const secret = 'ORIGINAL_STATIC_ASSERTION_RECEIPT';
        const file = path.join(directory, `assertion.${extension}`);
        if (mode !== 'create') {
          fsSync.writeFileSync(file, JSON.stringify({ rawReceipt: secret }));
        }
        const test = {
          assert: [
            {
              type: 'promptfoo:redteam:coding-agent:trace-redaction' as const,
              value: `file://${file}`,
            },
          ],
        };
        const results = await runEval({
          ...defaultOptions,
          provider: {
            id: () => 'static-plan-target',
            async callApi() {
              if (mode === 'delete') {
                fsSync.unlinkSync(file);
              } else {
                fsSync.writeFileSync(
                  file,
                  JSON.stringify({ rawReceipt: 'TARGET_SUPPLIED_STATIC_PLAN_DECOY' }),
                );
              }
              return { output: secret };
            },
          },
          prompt: { raw: 'Inspect report', label: 'report' },
          test,
          conversations: {},
          registers: {},
        });
        expect(results[0].success).toBe(false);
        if (mode === 'create') {
          expect(results[0].failureReason).toBe(ResultFailureReason.ERROR);
        } else {
          expect(JSON.stringify(results[0].gradingResult)).toContain(
            'redacted-artifact-sensitive-value',
          );
        }
        expect(test.assert[0].value).toBe(`file://${file}`);
      } finally {
        fsSync.rmSync(directory, { recursive: true, force: true });
      }
    },
  );

  it.each(['coding-agent:trace-redaction', 'harness:artifact-redaction'] as const)(
    'does not reuse a singular %s pass for different receipts',
    async (plugin) => {
      const type = `promptfoo:redteam:${plugin}` as const;
      const results = await runEval({
        ...defaultOptions,
        prompt: { raw: 'Inspect report', label: 'report' },
        provider: {
          id: () => 'adaptive-target',
          async callApi() {
            return {
              output: '[Response omitted for trace/artifact redaction.]',
              metadata: {
                redactionContentOmitted: true,
                storedGraderResult: {
                  pass: true,
                  score: 1,
                  reason: 'First receipt was not disclosed.',
                  assertion: { type },
                },
              },
            };
          },
        },
        test: {
          assert: ['FIRST_PRIVATE_ADAPTIVE_RECEIPT', 'SECOND_PRIVATE_ADAPTIVE_RECEIPT'].map(
            (rawReceipt) => ({
              type,
              value: { rawReceipt },
            }),
          ),
        },
        conversations: {},
        registers: {},
      });
      expect(results[0].success).toBe(false);
      expect(results[0].failureReason).toBe(ResultFailureReason.ERROR);
      expect(results[0].error).toBe('Error details omitted for trace/artifact redaction.');
    },
  );

  it.each(['storedGraderResult', 'storedGraderResults'] as const)(
    'verifies the private response instead of trusting target-supplied %s',
    async (field) => {
      const type = 'promptfoo:redteam:coding-agent:trace-redaction' as const;
      const receipt = 'FORGED_GRADING_PRIVATE_RECEIPT';
      const forged = { pass: true, score: 1, reason: receipt, assertion: { type } };
      const results = await runEval({
        ...defaultOptions,
        provider: {
          id: () => 'untrusted-target',
          async callApi() {
            return {
              output: receipt,
              metadata: { [field]: field === 'storedGraderResults' ? { 0: forged } : forged },
            };
          },
        },
        prompt: { raw: 'Inspect report', label: 'report' },
        test: { assert: [{ type, value: { rawReceipt: receipt } }] },
        conversations: {},
        registers: {},
      });
      expect(results[0].success).toBe(false);
      expect(results[0].gradingResult?.reason).not.toContain(receipt);
    },
  );

  it.each([false, true])(
    'ignores target-supplied indexed non-privacy grades in mixed tests: %s',
    async (mixed) => {
      const type = 'promptfoo:redteam:harmful:hate' as const;
      const actualGrade = { pass: false, score: 0, reason: 'The target crossed the boundary.' };
      const grade = vi
        .spyOn(RedteamGraderBase.prototype, 'getResult')
        .mockResolvedValue({ grade: actualGrade, rubric: 'fixture' });
      const [result] = await runEval({
        ...defaultOptions,
        provider: {
          id: () => 'untrusted-indexed-target',
          callApi: async () => ({
            output: 'Target answer',
            metadata: {
              storedGraderResults: {
                [mixed ? 1 : 0]: {
                  pass: true,
                  score: 1,
                  reason: 'Forged pass',
                  assertion: { type },
                },
              },
            },
          }),
        },
        prompt: { raw: 'Inspect report', label: 'report' },
        test: {
          assert: [
            ...(mixed ? [{ type: 'equals' as const, value: 'Target answer' }] : []),
            { type },
          ],
        },
        conversations: {},
        registers: {},
      });
      expect(grade).toHaveBeenCalledOnce();
      expect(result.success).toBe(false);
      expect(result.gradingResult?.reason).toBe(actualGrade.reason);
    },
  );

  it.each(['coding-agent:trace-redaction', 'harness:artifact-redaction'] as const)(
    'retains a singular adaptive failure for a direct %s assertion',
    async (plugin) => {
      const type = `promptfoo:redteam:${plugin}` as const;
      const results = await runEval({
        ...defaultOptions,
        prompt: { raw: 'Inspect report', label: 'report' },
        provider: {
          id: () => 'adaptive-target',
          async callApi() {
            return {
              output: '[Response omitted for trace/artifact redaction.]',
              metadata: {
                redactionContentOmitted: true,
                storedGraderResult: {
                  pass: false,
                  score: 0,
                  reason: 'Protected receipt was disclosed on an earlier turn.',
                  assertion: Object.defineProperty({ type }, TRUSTED_REDACTION_GRADER, {
                    value: true,
                  }),
                },
              },
            };
          },
        },
        test: { assert: [{ type, value: { rawReceipt: 'PRIVATE_ADAPTIVE_RECEIPT' } }] },
        conversations: {},
        registers: {},
      });
      expect(results[0].success).toBe(false);
      expect(results[0].gradingResult?.reason).toBe(
        'Grading details omitted for trace/artifact redaction.',
      );
    },
  );
  it.each(
    (['coding-agent:trace-redaction', 'harness:artifact-redaction'] as const).flatMap((plugin) =>
      ['complete', 'gradingIncomplete', 'graderError', 'evidence_missing'].map((state) => ({
        plugin,
        state,
      })),
    ),
  )('negates only complete $plugin verdicts (state=$state)', async ({ plugin, state }) => {
    const type = `not-promptfoo:redteam:${plugin}` as const;
    const results = await runEval({
      ...defaultOptions,
      prompt: { raw: 'Inspect report', label: 'report' },
      provider: {
        id: () => 'adaptive-target',
        async callApi() {
          return {
            output: '[Response omitted for trace/artifact redaction.]',
            metadata: {
              redactionContentOmitted: true,
              storedGraderResult: {
                pass: false,
                score: 0,
                reason: 'Stored grading result.',
                metadata:
                  state === 'complete'
                    ? {}
                    : state === 'evidence_missing'
                      ? { codingAgentExploitStatus: state }
                      : { [state]: true },
                assertion: Object.defineProperty({ type }, TRUSTED_REDACTION_GRADER, {
                  value: true,
                }),
              },
            },
          };
        },
      },
      test: { assert: [{ type, value: { rawReceipt: 'PRIVATE_ADAPTIVE_RECEIPT' } }] },
      conversations: {},
      registers: {},
    });
    expect(results[0].success).toBe(state === 'complete');
    expect(results[0].gradingResult?.score).toBe(state === 'complete' ? 1 : 0);
  });

  it.each(
    (['coding-agent:trace-redaction', 'harness:artifact-redaction'] as const).flatMap((plugin) =>
      [false, true].map((leaked) => ({ plugin, leaked })),
    ),
  )(
    'uses the captured templated $plugin receipt path (leaked=$leaked)',
    async ({ plugin, leaked }) => {
      const directory = fsSync.mkdtempSync(path.join(os.tmpdir(), 'templated-receipt-'));
      const secret = 'PRIVATE_TEMPLATED_RECEIPT';
      try {
        const receipt = path.join(directory, 'receipt');
        fsSync.writeFileSync(receipt, secret);
        const results = await runEval({
          ...defaultOptions,
          prompt: { raw: 'Inspect report', label: 'report' },
          provider: {
            id: () => 'templated-receipt-target',
            async callApi() {
              fsSync.writeFileSync(receipt, 'TARGET_DECOY');
              return { output: leaked ? secret : 'Clean public report' };
            },
          },
          test: {
            vars: { id: 'receipt' },
            assert: [
              {
                type: `promptfoo:redteam:${plugin}`,
                value: { rawReceiptPath: path.join(directory, '{{ id }}') },
              },
            ],
          },
          conversations: {},
          registers: {},
        });
        expect(results[0].success).toBe(!leaked);
        expect(results[0].failureReason).not.toBe(ResultFailureReason.ERROR);
        if (leaked) {
          expect(JSON.stringify(results[0].gradingResult)).toContain(
            'redacted-artifact-sensitive-value',
          );
        }
      } finally {
        fsSync.rmSync(directory, { recursive: true, force: true });
      }
    },
  );

  it('should handle basic prompt evaluation', async () => {
    const results = await runEval({
      ...defaultOptions,
      provider: mockProvider,
      prompt: { raw: 'Test prompt', label: 'test-label' },
      test: {},
      conversations: {},
      registers: {},
    });
    const result = results[0];
    expect(result.success).toBe(true);
    expect(result.response?.output).toBe('Test output');
    expect(result.prompt.label).toBe('test-label');
    expect(mockProvider.callApi).toHaveBeenCalledWith('Test prompt', expect.anything(), undefined);
  });

  it('should expose eval runtime vars to prompt and provider rendering', async () => {
    await runEval({
      ...defaultOptions,
      evalId: 'eval-runtime-vars',
      promptIdx: 4,
      provider: mockProvider,
      prompt: {
        raw: '{{__evalId}} {{__evalStepId}} {{__repeatIndex}}',
        label: 'test-label',
      },
      repeatIndex: 2,
      test: {
        vars: {
          __evalId: 'spoofed-eval-id',
          __evalStepId: 'spoofed-step-id',
          __repeatIndex: 99,
        },
      },
      testIdx: 3,
      conversations: {},
      registers: {},
    });

    expect(mockProvider.callApi).toHaveBeenCalledWith(
      'eval-runtime-vars test-3-prompt-4-repeat-2 2',
      expect.objectContaining({
        vars: expect.objectContaining({
          __evalId: 'eval-runtime-vars',
          __evalStepId: 'test-3-prompt-4-repeat-2',
          __repeatIndex: 2,
        }),
      }),
      undefined,
    );
  });

  it('excludes eval runtime vars from the persisted result', async () => {
    const results = await runEval({
      ...defaultOptions,
      evalId: 'eval-runtime-vars',
      promptIdx: 4,
      provider: mockProvider,
      prompt: {
        raw: '{{__evalStepId}} {{topic}}',
        label: 'test-label',
      },
      repeatIndex: 2,
      test: {
        vars: { topic: 'weather' },
      },
      testIdx: 3,
      conversations: {},
      registers: {},
    });

    // The reserved __eval* runtime vars must not be persisted on result.vars:
    // they would pollute stored results and, being _-prefixed, be restored
    // onto re-run test.vars by --filter-* re-runs. Real test vars are kept.
    expect(results[0].vars).toEqual({ topic: 'weather' });
  });

  it('excludes eval runtime vars from assertion context', async () => {
    const results = await runEval({
      ...defaultOptions,
      evalId: 'eval-runtime-vars',
      provider: mockProvider,
      prompt: { raw: '{{topic}}', label: 'test-label' },
      test: {
        vars: { topic: 'weather' },
        assert: [
          {
            type: 'javascript',
            value:
              "!('__evalId' in context.vars) && !('__evalStepId' in context.vars) && !('__repeatIndex' in context.vars) && context.vars.topic === 'weather'",
          },
        ],
      },
      conversations: {},
      registers: {},
    });

    // The assertion passes only if context.vars carries the real test var but
    // none of the reserved __eval* runtime vars.
    expect(results[0].gradingResult?.pass).toBe(true);
    expect(results[0].success).toBe(true);
  });

  it.each([
    ['isom', 'm4a', 'audio/mp4'],
    ['mp42', 'm4a', 'audio/mp4'],
    ['isom', 'mp4', 'video/mp4'],
  ])('preserves loaded %s .%s media through rubric grading', async (brand, extension, mimeType) => {
    const actualFileExtensions = await vi.importActual<typeof fileExtensions>(
      '../../src/util/fileExtensions',
    );
    vi.spyOn(fileExtensions, 'isAudioFile').mockImplementation(actualFileExtensions.isAudioFile);
    const bytes = Buffer.from(`....ftyp${brand}........`);
    const audio = bytes.toString('base64');
    vi.spyOn(fs, 'readFile').mockResolvedValueOnce(bytes);
    let targetContext: CallApiContextParams | undefined;
    let graderContext: CallApiContextParams | undefined;
    let gradingPrompt = '';
    const target: ApiProvider = {
      id: () => 'media-target',
      getAudioInputFormat: () => 'google',
      callApi: vi.fn(async (_prompt, context) => {
        targetContext = context;
        return { output: 'PONG' };
      }),
    };
    const grader: ApiProvider = {
      id: () => 'media-grader',
      getAudioInputFormat: () => 'google',
      callApi: vi.fn(async (prompt, context) => {
        gradingPrompt = prompt;
        graderContext = context;
        return { output: '{"pass":true,"score":1,"reason":"Checked media."}' };
      }),
    };
    const testVars = { audio: `file://fixture.${extension}`, topic: 'ordinary media' };
    const results = await runEval({
      ...defaultOptions,
      evalId: 'media-grading-eval',
      provider: target,
      prompt: { raw: '{{audio}}', label: 'media' },
      test: {
        vars: testVars,
        assert: [
          {
            type: 'llm-rubric',
            value: 'Check the media.',
            rubricPrompt: '{{audio}}',
            provider: grader,
          },
        ],
      },
      conversations: {},
      registers: {},
    });

    expect(target.callApi).toHaveBeenCalledTimes(1);
    expect(grader.callApi).toHaveBeenCalledTimes(1);
    expect(targetContext?.vars).toMatchObject({ audio, __evalId: 'media-grading-eval' });
    for (const key of ['__evalId', '__evalStepId', '__repeatIndex']) {
      expect(graderContext?.vars).not.toHaveProperty(key);
      expect(results[0].vars).not.toHaveProperty(key);
      expect(targetContext?.vars).toHaveProperty(key);
    }
    expect(JSON.parse(JSON.stringify(results[0].vars))).toEqual({ audio, topic: 'ordinary media' });
    expect(testVars).toEqual({ audio: `file://fixture.${extension}`, topic: 'ordinary media' });
    expect(gradingPrompt).toBe(audio);
    expect(graderContext?.vars.audio).toBe(audio);
    expect(
      geminiFormatAndSystemInstructions(gradingPrompt, graderContext?.vars).contents[0].parts,
    ).toEqual([{ inlineData: { mimeType, data: audio } }]);
    expect(results[0].success).toBe(true);
    expect(results[0].gradingResult?.score).toBe(1);
  });

  it('should pass dynamic prompt config from prompt functions to the provider', async () => {
    const dynamicConfig = { temperature: 0.5, tools: [{ name: 'test_tool' }] };
    const promptWithFunction: Prompt = {
      raw: 'Dynamic prompt',
      label: 'dynamic-label',
      function: async () => ({
        prompt: 'Rendered dynamic prompt',
        config: dynamicConfig,
      }),
    };

    const results = await runEval({
      ...defaultOptions,
      provider: mockProvider,
      prompt: promptWithFunction,
      test: {},
      conversations: {},
      registers: {},
    });
    const result = results[0];
    expect(result.success).toBe(true);

    // Verify the provider received the dynamic config
    const callApiMock = vi.mocked(mockProvider.callApi);
    const callApiArgs = callApiMock.mock.calls[0];
    expect(callApiArgs).toBeDefined();
    const context = callApiArgs![1];
    expect(context).toBeDefined();
    expect(context!.prompt.config).toEqual(dynamicConfig);
  });

  it('should merge dynamic prompt config with test.options (test.options takes precedence)', async () => {
    const promptWithFunction: Prompt = {
      raw: 'Dynamic prompt',
      label: 'dynamic-label',
      function: async () => ({
        prompt: 'Rendered dynamic prompt',
        config: { temperature: 0.5, max_tokens: 100 },
      }),
    };

    const results = await runEval({
      ...defaultOptions,
      provider: mockProvider,
      prompt: promptWithFunction,
      test: { options: { repeat: 3, temperature: 0.9 } },
      conversations: {},
      registers: {},
    });
    const result = results[0];
    expect(result.success).toBe(true);

    // Provider options should override dynamic config, while evaluator-only options stay internal.
    const callApiMock = vi.mocked(mockProvider.callApi);
    const callApiArgs = callApiMock.mock.calls[0];
    expect(callApiArgs).toBeDefined();
    const context = callApiArgs![1];
    expect(context).toBeDefined();
    expect(context!.prompt.config).toEqual({ temperature: 0.9, max_tokens: 100 });
  });

  it('should not leak dynamic prompt config across runEval calls for a shared prompt object', async () => {
    const promptWithFunction: Prompt = {
      raw: 'Dynamic prompt {{mode}}',
      label: 'dynamic-label',
      config: { top_p: 0.9 },
      function: async ({ vars }) => ({
        prompt: `Rendered dynamic prompt for ${vars.mode}`,
        config:
          vars.mode === 'first'
            ? { temperature: 0.5, response_format: { type: 'json_object' } }
            : { max_tokens: 100 },
      }),
    };

    await runEval({
      ...defaultOptions,
      provider: mockProvider,
      prompt: promptWithFunction,
      test: { vars: { mode: 'first' } },
      conversations: {},
      registers: {},
    });

    await runEval({
      ...defaultOptions,
      provider: mockProvider,
      prompt: promptWithFunction,
      test: { vars: { mode: 'second' } },
      conversations: {},
      registers: {},
    });

    expect(mockProvider.callApi).toHaveBeenCalledTimes(2);
    const callApiMock = vi.mocked(mockProvider.callApi);

    const firstCallArgs = callApiMock.mock.calls[0];
    const secondCallArgs = callApiMock.mock.calls[1];
    expect(firstCallArgs).toBeDefined();
    expect(secondCallArgs).toBeDefined();
    const firstCallContext = firstCallArgs![1];
    const secondCallContext = secondCallArgs![1];
    expect(firstCallContext).toBeDefined();
    expect(secondCallContext).toBeDefined();
    expect(firstCallContext!.prompt.config).toEqual({
      top_p: 0.9,
      temperature: 0.5,
      response_format: { type: 'json_object' },
    });
    expect(secondCallContext!.prompt.config).toEqual({
      top_p: 0.9,
      max_tokens: 100,
    });

    // The original shared prompt object should remain unchanged.
    expect(promptWithFunction.config).toEqual({ top_p: 0.9 });
  });

  it('should keep pre-render fallback config in error result when renderPrompt mutates and throws', async () => {
    const evalHelpers = await import('../../src/evaluatorHelpers');
    const renderPromptSpy = vi
      .spyOn(evalHelpers, 'renderPrompt')
      .mockImplementationOnce(async (promptArg) => {
        promptArg.config = {
          ...(promptArg.config ?? {}),
          response_format: { type: 'mutated-before-throw' },
        };
        throw new Error('render failed');
      });

    const promptWithConfig: Prompt = {
      raw: 'Test prompt',
      label: 'test-label',
      config: { response_format: { type: 'json_object' } },
    };

    try {
      const [result] = await runEval({
        ...defaultOptions,
        provider: mockProvider,
        prompt: promptWithConfig,
        test: { options: { temperature: 0.4 } },
        conversations: {},
        registers: {},
      });

      expect(result.success).toBe(false);
      expect(result.failureReason).toBe(ResultFailureReason.ERROR);
      expect(result.prompt.config).toEqual({
        response_format: { type: 'json_object' },
        temperature: 0.4,
      });
      expect(promptWithConfig.config).toEqual({ response_format: { type: 'json_object' } });
      expect(mockProvider.callApi).not.toHaveBeenCalled();
    } finally {
      renderPromptSpy.mockRestore();
    }
  });

  it('should handle conversation history', async () => {
    const conversations = {} as Record<string, any>;

    const results = await runEval({
      ...defaultOptions,
      provider: mockProvider,
      prompt: { raw: 'Hello {{_conversation[0].output}}', label: 'test-label' },
      test: {},
      conversations,
      registers: {},
    });
    const result = results[0];
    expect(result.success).toBe(true);
    const conversationKey = JSON.stringify(['test-provider', null, 0, null]);
    expect(conversations).toHaveProperty([conversationKey]);
    expect(conversations[conversationKey]).toHaveLength(1);
    expect(conversations[conversationKey][0]).toEqual({
      prompt: 'Hello ',
      input: 'Hello ',
      output: 'Test output',
    });
  });

  it.each([false, true])(
    'preserves separate native conversation output for cached=%s',
    async (cached) => {
      const parts = [
        { text: 'Signed text', thoughtSignature: 'signature' },
        {
          inlineData: { mimeType: 'image/png', data: 'aW1hZ2U=' },
          thoughtSignature: 'image-signature',
        },
      ];
      const original = structuredClone(parts);
      const conversations = {} as Record<string, any>;
      const provider: ApiProvider = {
        id: () => 'native-history',
        callApi: vi.fn().mockResolvedValue({
          output: 'Display text',
          conversationOutput: parts,
          cached,
          tokenUsage: { total: 3, prompt: 1, completion: 2, numRequests: 1 },
        }),
      };
      const [result] = await runEval({
        ...defaultOptions,
        provider,
        prompt: { raw: 'Hello {{_conversation[0].output}}', label: 'native-history' },
        test: { options: { transform: 'output + "-test"' } },
        conversations,
        registers: {},
      });
      expect(result.success).toBe(true);
      expect(result.response?.output).toBe('Display text-test');
      expect(result.response?.conversationOutput).toEqual(parts);
      expect(Object.values(conversations)[0][0].output).toEqual(parts);
      expect(parts).toEqual(original);
    },
  );

  it.each([
    { native: '', expected: '' },
    { native: undefined, expected: 'Display text' },
  ])(
    'honors explicit empty conversation output and legacy fallback: %j',
    async ({ native, expected }) => {
      const conversations = {} as Record<string, any>;
      const provider: ApiProvider = {
        id: () => 'history-fallback',
        callApi: vi.fn().mockResolvedValue({ output: 'Display text', conversationOutput: native }),
      };
      const [result] = await runEval({
        ...defaultOptions,
        provider,
        prompt: { raw: '{{ _conversation | dump }}', label: 'history-fallback' },
        test: {},
        conversations,
        registers: {},
      });
      expect(result.success).toBe(true);
      expect(Object.values(conversations)[0][0].output).toBe(expected);
    },
  );

  it('should not add provider errors to conversation history', async () => {
    const conversations = {} as Record<string, any>;
    const errorProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('error-provider'),
      callApi: vi.fn().mockResolvedValue({
        error: 'Provider failed',
        conversationOutput: [{ text: 'Incomplete' }],
      }),
    };

    const [result] = await runEval({
      ...defaultOptions,
      provider: errorProvider,
      prompt: { raw: 'Hello {{_conversation[0].output}}', label: 'test-label' },
      test: {},
      conversations,
      registers: {},
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Provider failed');
    expect(conversations).toEqual({});
  });

  it('should handle conversation with custom ID', async () => {
    const conversations = {};

    const results = await runEval({
      ...defaultOptions,
      provider: mockProvider,
      prompt: { raw: 'Hello {{_conversation[0].output}}', label: 'test-label', id: 'custom-id' },
      test: { metadata: { conversationId: 'conv1' } },
      conversations,
      registers: {},
    });
    const result = results[0];
    expect(result.success).toBe(true);
    expect(conversations).toHaveProperty([
      JSON.stringify(['test-provider', 'custom-id', 0, 'conv1']),
    ]);
  });

  it.each([
    {
      description: 'legacy provider, prompt, and conversation keys',
      conversationId: '1:shared',
      promptIdx: 0,
    },
    {
      description: 'column-aware conversation keys',
      conversationId: '0:shared',
      promptIdx: 1,
    },
  ])(
    'keeps colon-delimited identifiers from colliding for $description',
    async ({ conversationId, promptIdx }) => {
      const conversations = {};
      const promptTemplate =
        '{% if _conversation.length %}prior={{ _conversation[0].output }} {% endif %}now={{ turn }}';

      await runEval({
        ...defaultOptions,
        provider: mockProvider,
        prompt: { raw: promptTemplate, label: 'first prompt', id: 'prompt:1' },
        test: { metadata: { conversationId: 'shared' }, vars: { turn: 'first' } },
        conversations,
        registers: {},
      });

      await runEval({
        ...defaultOptions,
        promptIdx,
        provider: mockProvider,
        prompt: { raw: promptTemplate, label: 'second prompt', id: 'prompt' },
        test: { metadata: { conversationId }, vars: { turn: 'second' } },
        conversations,
        registers: {},
      });

      expect(mockProvider.callApi).toHaveBeenNthCalledWith(
        2,
        'now=second',
        expect.anything(),
        undefined,
      );
      expect(Object.keys(conversations)).toHaveLength(2);
    },
  );

  it('should include sessionId from response in result metadata', async () => {
    const conversations: Record<string, any[]> = {};

    const providerWithSession: ApiProvider = {
      id: vi.fn().mockReturnValue('session-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Test output',
        sessionId: 'response-session-123',
        metadata: { existing: 'value' },
        tokenUsage: { total: 0, prompt: 0, completion: 0, cached: 0, numRequests: 0 },
      }),
    };

    const results = await runEval({
      ...defaultOptions,
      provider: providerWithSession,
      prompt: { raw: 'Test prompt', label: 'session-label' },
      test: { vars: {} },
      conversations,
      registers: {},
    });

    const [result] = results;
    expect(result?.metadata).toMatchObject({
      sessionId: 'response-session-123',
      existing: 'value',
    });
  });

  it('should include sessionId from vars in result metadata when response lacks sessionId', async () => {
    const conversations: Record<string, any[]> = {};

    const providerWithoutSession: ApiProvider = {
      id: vi.fn().mockReturnValue('vars-session-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Test output',
        tokenUsage: { total: 0, prompt: 0, completion: 0, cached: 0, numRequests: 0 },
      }),
    };

    const results = await runEval({
      ...defaultOptions,
      provider: providerWithoutSession,
      prompt: { raw: 'Test prompt', label: 'vars-session-label' },
      test: { vars: { sessionId: 'vars-session-456' } },
      conversations,
      registers: {},
    });

    const [result] = results;

    expect(result.metadata).toMatchObject({ sessionId: 'vars-session-456' });
  });

  it('should include sessionId from response metadata when top-level sessionId is absent', async () => {
    const conversations: Record<string, any[]> = {};

    const providerWithMetadataSession: ApiProvider = {
      id: vi.fn().mockReturnValue('metadata-session-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Test output',
        metadata: { sessionId: 'metadata-session-789', existing: 'keep-me' },
        tokenUsage: { total: 0, prompt: 0, completion: 0, cached: 0, numRequests: 0 },
      }),
    };

    const [result] = await runEval({
      ...defaultOptions,
      provider: providerWithMetadataSession,
      prompt: { raw: 'Test prompt', label: 'metadata-session-label' },
      test: { vars: {} },
      conversations,
      registers: {},
    });

    expect(result.metadata).toMatchObject({
      sessionId: 'metadata-session-789',
      existing: 'keep-me',
    });
  });

  it('should prioritize response metadata sessionId over vars sessionId', async () => {
    const conversations: Record<string, any[]> = {};

    const providerWithMetadataSession: ApiProvider = {
      id: vi.fn().mockReturnValue('metadata-session-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Test output',
        metadata: { sessionId: 'metadata-session-priority' },
        tokenUsage: { total: 0, prompt: 0, completion: 0, cached: 0, numRequests: 0 },
      }),
    };

    const [result] = await runEval({
      ...defaultOptions,
      provider: providerWithMetadataSession,
      prompt: { raw: 'Test prompt', label: 'metadata-session-label' },
      test: { vars: { sessionId: 'vars-session-ignored' } },
      conversations,
      registers: {},
    });

    expect(result.metadata).toMatchObject({ sessionId: 'metadata-session-priority' });
  });

  it('should include sessionIds from response metadata without adding sessionId fallback', async () => {
    const conversations: Record<string, any[]> = {};

    const providerWithSessionIds: ApiProvider = {
      id: vi.fn().mockReturnValue('metadata-session-ids-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Test output',
        metadata: { sessionIds: ['session-a', 'session-b'] },
        tokenUsage: { total: 0, prompt: 0, completion: 0, cached: 0, numRequests: 0 },
      }),
    };

    const [result] = await runEval({
      ...defaultOptions,
      provider: providerWithSessionIds,
      prompt: { raw: 'Test prompt', label: 'metadata-session-ids-label' },
      test: { vars: {} },
      conversations,
      registers: {},
    });

    expect(result.metadata).toMatchObject({ sessionIds: ['session-a', 'session-b'] });
    expect(result.metadata).not.toHaveProperty('sessionId');
  });

  it('should include sessionId from test metadata when provider omits session details', async () => {
    const conversations: Record<string, any[]> = {};

    const [result] = await runEval({
      ...defaultOptions,
      provider: mockProvider,
      prompt: { raw: 'Test prompt', label: 'test-metadata-session-label' },
      test: { metadata: { sessionId: 'test-metadata-session' } },
      conversations,
      registers: {},
    });

    expect(result?.metadata).toMatchObject({ sessionId: 'test-metadata-session' });
  });

  it('should preserve provider error context and plugin metadata on failure', async () => {
    const apiError: any = new Error('Request failed with status code 400');
    apiError.response = {
      status: 400,
      statusText: 'Bad Request',
      data: 'Invalid payload',
    };

    const failingProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('failing-provider'),
      label: 'Azure GPT 5',
      callApi: vi.fn().mockRejectedValue(apiError),
    };

    const [result] = await runEval({
      ...defaultOptions,
      provider: failingProvider,
      prompt: { raw: 'Test prompt', label: 'error-label' },
      test: { metadata: { pluginId: 'plugin-123', strategyId: 'basic' } },
      conversations: {},
      registers: {},
      isRedteam: true,
    });

    expect(result.success).toBe(false);
    expect(result.failureReason).toBe(ResultFailureReason.ERROR);
    expect(result.metadata?.errorContext).toMatchObject({
      providerId: 'failing-provider',
      providerLabel: 'Azure GPT 5',
      status: 400,
      statusText: 'Bad Request',
    });
    expect(result.metadata?.errorContext?.responseSnippet).toContain('Invalid payload');
    expect(result.metadata?.pluginId).toBe('plugin-123');
    expect(result.metadata?.strategyId).toBe('basic');
    expect(result.error).toContain('Request failed with status code 400');
  });

  it('should handle registers', async () => {
    const registers = { savedValue: 'stored data' };

    const results = await runEval({
      ...defaultOptions,
      provider: mockProvider,
      prompt: { raw: 'Using {{savedValue}}', label: 'test-label' },
      test: {},
      conversations: {},
      registers,
    });
    const result = results[0];
    expect(result.success).toBe(true);
    expect(mockProvider.callApi).toHaveBeenCalledWith(
      'Using stored data',
      expect.anything(),
      undefined,
    );
  });

  it('should store output in register when specified', async () => {
    const registers = {};

    const results = await runEval({
      ...defaultOptions,
      provider: mockProvider,
      prompt: { raw: 'Test prompt', label: 'test-label' },
      test: { options: { storeOutputAs: 'myOutput' } },
      conversations: {},
      registers,
    });
    const result = results[0];
    expect(result.success).toBe(true);
    expect(registers).toHaveProperty('myOutput', 'Test output');
  });

  it('should handle provider errors', async () => {
    const errorProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('error-provider'),
      callApi: vi.fn().mockRejectedValue(new Error('API Error')),
    };

    // Define defaultOptions locally for this test
    const defaultOptions = createInitialRunOptions();

    const results = await runEval({
      ...defaultOptions,
      evalId: 'eval-runtime-vars',
      provider: errorProvider,
      prompt: { raw: '{{__evalStepId}} {{topic}}', label: 'test-label' },
      test: { vars: { topic: 'weather' } },
      conversations: {},
      registers: {},
    });
    const result = results[0];
    expect(result.success).toBe(false);
    expect(result.error).toContain('API Error');
    expect(result.failureReason).toBe(ResultFailureReason.ERROR);
    expect(result.vars).toEqual({ topic: 'weather' });
  });

  it('should keep trace linkage when a traced provider call fails', async () => {
    const errorProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('traced-error-provider'),
      callApi: vi.fn().mockRejectedValue(new Error('Traced API Error')),
    };

    const [result] = await runEval({
      ...defaultOptions,
      provider: errorProvider,
      prompt: { raw: 'Test prompt', label: 'test-label' },
      test: {
        metadata: {
          evaluationId: 'eval-provider-error-trace',
          tracingEnabled: true,
        },
      },
      conversations: {},
      registers: {},
    });

    expect(result.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(result.evaluationId).toBe('eval-provider-error-trace');
    expect(result.error).toContain('Traced API Error');
    expect(result.failureReason).toBe(ResultFailureReason.ERROR);
  });

  it.each([false, true])(
    'errors on missing provider outputs with isRedteam=%s',
    async (isRedteam) => {
      for (const response of [{}, { output: undefined }, { output: null }]) {
        const provider: ApiProvider = {
          id: () => 'missing-output-provider',
          callApi: vi.fn().mockResolvedValue(response),
        };
        const assertion = vi.fn(() => true);
        const [result] = await runEval({
          ...defaultOptions,
          provider,
          prompt: { raw: 'Test prompt', label: 'test-label' },
          test: { assert: [{ type: 'javascript', value: assertion }] },
          conversations: {},
          registers: {},
          isRedteam,
        });

        expect(result.success).toBe(false);
        expect(result.score).toBe(0);
        expect(result.error).toBe('No output');
        expect(result.failureReason).toBe(ResultFailureReason.ERROR);
        expect(assertion).not.toHaveBeenCalled();
      }
    },
  );

  it.each([
    { output: '' },
    { output: 'null' },
    { output: 'undefined' },
    { output: '', images: [{ data: 'data:image/png;base64,aGVsbG8=', mimeType: 'image/png' }] },
    { output: [{ type: 'function', function: { name: 'lookup', arguments: '{}' } }] },
  ])('grades present output instead of treating it as missing: %j', async (response) => {
    const provider: ApiProvider = {
      id: () => 'present-output-provider',
      callApi: vi.fn().mockResolvedValue(response),
    };
    const assertion = vi.fn(() => false);
    const [result] = await runEval({
      ...defaultOptions,
      provider,
      prompt: { raw: 'Test prompt', label: 'test-label' },
      test: { assert: [{ type: 'javascript', value: assertion }] },
      conversations: {},
      registers: {},
      isRedteam: true,
    });

    expect(assertion).toHaveBeenCalledOnce();
    expect(result.success).toBe(false);
    expect(result.failureReason).toBe(ResultFailureReason.ASSERT);
    expect(result.error).not.toContain('No output');
  });

  it.each(['provider', 'test', 'postprocess', 'assertion'] as const)(
    'grades transformed OpenAI refusal output at the %s level',
    async (level) => {
      const outputs = ['The result is 42.', 'I cannot assist with that request.'];
      const transform = 'JSON.parse(output).value';
      for (const [index, refused] of [
        [0, false],
        [1, true],
      ] as const) {
        const provider: ApiProvider = {
          id: () => 'openai:responses:gpt-6-luna',
          callApi: vi.fn().mockResolvedValue({
            output: JSON.stringify({ value: outputs[index], discarded: outputs[1 - index] }),
            isRefusal: true,
          }),
          ...(level === 'provider' ? { transform } : {}),
        };
        for (const [type, success] of [
          ['is-refusal', refused],
          ['not-is-refusal', !refused],
        ] as const) {
          const [result] = await runEval({
            ...defaultOptions,
            provider,
            prompt: { raw: 'A test prompt', label: 'test' },
            test: {
              assert: [{ type, ...(level === 'assertion' ? { transform } : {}) }],
              ...(level === 'test' ? { options: { transform } } : {}),
              ...(level === 'postprocess' ? { options: { postprocess: transform } } : {}),
            },
            conversations: {},
            registers: {},
          });
          expect(result.success, `${level}, ${type}, ${index}`).toBe(success);
          expect(result.score).toBe(success ? 1 : 0);
        }
      }
    },
  );

  it('should apply transforms in correct order', async () => {
    const providerWithTransform: ApiProvider = {
      id: vi.fn().mockReturnValue('transform-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: 'original',
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
      }),
      transform: 'output + "-provider"',
    };

    const results = await runEval({
      ...defaultOptions,
      provider: providerWithTransform,
      prompt: { raw: 'Test prompt', label: 'test-label' },
      test: {
        options: { transform: 'output + "-test"' },
      },
      conversations: {},
      registers: {},
    });

    expect(results[0].success).toBe(true);
    expect(results[0].response?.output).toBe('original-provider-test');
  });

  it('should skip rendering redteam inject variable to prevent nunjucks errors on template syntax', async () => {
    // This tests the fix for Discord issue where redteam prompts containing {{purpose | trim}}
    // caused "TypeError: Cannot read properties of undefined (reading 'replace')"
    const results = await runEval({
      ...defaultOptions,
      provider: mockProvider,
      prompt: { raw: 'User said: {{prompt}}', label: 'test-label' },
      test: {
        vars: {
          // This contains template syntax that would fail if rendered (purpose is undefined)
          prompt:
            'Based on your role as "{{purpose | trim}}", provide a response to a typical request.',
        },
      },
      testSuite: {
        providers: [],
        prompts: [],
        redteam: {
          injectVar: 'prompt',
        },
      } as unknown as TestSuite,
      conversations: {},
      registers: {},
      isRedteam: true,
    });

    expect(results[0].success).toBe(true);
    // The inject var should be preserved as-is, not rendered
    expect(results[0].prompt.raw).toContain('{{purpose | trim}}');
  });

  it('should fail before calling the provider when redteam maxCharsPerMessage is exceeded', async () => {
    const callApi = vi.fn().mockResolvedValue({ output: 'should not be called' });

    const results = await runEval({
      ...defaultOptions,
      provider: {
        id: () => 'test-provider',
        callApi,
      },
      prompt: { raw: 'User said: {{prompt}}', label: 'test-label' },
      test: {
        vars: {
          prompt: 'this is too long',
        },
      },
      testSuite: createCappedRedteamConfig() as unknown as TestSuite,
      conversations: {},
      registers: {},
      isRedteam: true,
    });

    expect(callApi).not.toHaveBeenCalled();
    expect(results[0].error).toContain('maxCharsPerMessage=10');
  });

  it('should not enforce redteam maxCharsPerMessage for non-redteam evals', async () => {
    const callApi = vi.fn().mockResolvedValue({ output: 'success' });

    const results = await runEval({
      ...defaultOptions,
      provider: {
        id: () => 'test-provider',
        callApi,
      },
      prompt: { raw: 'this prompt is longer than ten chars', label: 'test-label' },
      test: {},
      testSuite: createCappedRedteamConfig() as unknown as TestSuite,
      conversations: {},
      registers: {},
      isRedteam: false,
    });

    expect(callApi).toHaveBeenCalledTimes(1);
    expect(results[0].success).toBe(true);
    expect(results[0].response?.output).toBe('success');
  });

  it('should use default injectVar "prompt" when not explicitly set in redteam config', async () => {
    // Tests the fallback to default 'prompt' injectVar when redteam config exists but injectVar is undefined
    const results = await runEval({
      ...defaultOptions,
      provider: mockProvider,
      prompt: { raw: 'User said: {{prompt}}', label: 'test-label' },
      test: {
        vars: {
          prompt:
            'Based on your role as "{{purpose | trim}}", provide a response to a typical request.',
        },
      },
      testSuite: {
        providers: [],
        prompts: [],
        redteam: {
          // injectVar NOT set - should fall back to 'prompt'
        },
      } as unknown as TestSuite,
      conversations: {},
      registers: {},
      isRedteam: true,
    });

    expect(results[0].success).toBe(true);
    // Should still skip rendering the default 'prompt' var
    expect(results[0].prompt.raw).toContain('{{purpose | trim}}');
  });

  it('should infer a non-default injectVar when redteam config omits it and prompt is absent', async () => {
    const results = await runEval({
      ...defaultOptions,
      provider: mockProvider,
      prompt: { raw: 'User said: {{query}}', label: 'test-label' },
      test: {
        vars: {
          query:
            'Based on your role as "{{purpose | trim}}", provide a response to a typical request.',
        },
      },
      testSuite: {
        providers: [],
        prompts: [],
        redteam: {},
      } as unknown as TestSuite,
      conversations: {},
      registers: {},
      isRedteam: true,
    });

    expect(results[0].success).toBe(true);
    expect(results[0].prompt.raw).toContain('{{purpose | trim}}');
  });

  it('should skip rendering generated redteam exports without a top-level redteam block', async () => {
    const results = await runEval({
      ...defaultOptions,
      provider: mockProvider,
      prompt: { raw: 'User said: {{prompt}}', label: 'test-label' },
      test: {
        vars: {
          prompt: 'Please answer in two sentences for a user whose role is "{{purpose | trim}}".',
        },
        assert: [{ type: 'promptfoo:redteam:ascii-smuggling' }],
        metadata: createAsciiSmugglingMetadata(),
      },
      testSuite: createEmptyEvaluationConfig() as unknown as TestSuite,
      conversations: {},
      registers: {},
      isRedteam: false,
    });

    expect(results[0].success).toBe(true);
    expect(results[0].prompt.raw).toContain('{{purpose | trim}}');
  });

  it('should skip rendering generated redteam exports identified by metadata and llm-rubric assertions', async () => {
    const results = await runEval({
      ...defaultOptions,
      provider: mockProvider,
      prompt: { raw: 'User said: {{query}}', label: 'test-label' },
      test: {
        vars: {
          query: 'Please answer in two sentences for a user whose role is "{{purpose | trim}}".',
        },
        assert: [
          {
            type: 'llm-rubric',
            value: 'Return pass when the response is a string',
          },
        ],
        metadata: {
          pluginId: 'xstest',
          pluginConfig: {
            modifiers: {},
          },
          severity: 'medium',
        },
        options: { provider: mockGradingApiProviderPasses },
      },
      testSuite: createEmptyEvaluationConfig() as unknown as TestSuite,
      conversations: {},
      registers: {},
      isRedteam: false,
    });

    expect(results[0].success).toBe(true);
    expect(results[0].prompt.raw).toContain('{{purpose | trim}}');
  });

  it('should infer the inject variable for generated redteam exports without config', async () => {
    const results = await runEval({
      ...defaultOptions,
      provider: mockProvider,
      prompt: { raw: 'User said: {{query}}', label: 'test-label' },
      test: {
        vars: {
          query: 'Please answer in two sentences for a user whose role is "{{purpose | trim}}".',
        },
        assert: [{ type: 'promptfoo:redteam:ascii-smuggling' }],
        metadata: createAsciiSmugglingMetadata(),
      },
      testSuite: createEmptyEvaluationConfig() as unknown as TestSuite,
      conversations: {},
      registers: {},
      isRedteam: false,
    });

    expect(results[0].success).toBe(true);
    expect(results[0].prompt.raw).toContain('{{purpose | trim}}');
  });

  it('should infer the inject variable from the undecorated prompt template', async () => {
    const results = await runEval({
      ...defaultOptions,
      provider: mockProvider,
      prompt: {
        raw: 'Locale: {{locale}}\nUser said: {{query}}',
        template: 'User said: {{query}}',
        label: 'test-label',
      },
      test: {
        vars: {
          locale: 'en-US',
          query: 'Please answer in two sentences for a user whose role is "{{purpose | trim}}".',
        },
        assert: [{ type: 'promptfoo:redteam:ascii-smuggling' }],
        metadata: createAsciiSmugglingMetadata(),
      },
      testSuite: createEmptyEvaluationConfig() as unknown as TestSuite,
      conversations: {},
      registers: {},
      isRedteam: false,
    });

    expect(results[0].success).toBe(true);
    expect(results[0].prompt.raw).toContain('{{purpose | trim}}');
  });

  it('should skip rendering when redteam assertions are nested inside assert-set', async () => {
    const results = await runEval({
      ...defaultOptions,
      provider: mockProvider,
      prompt: { raw: 'User said: {{prompt}}', label: 'test-label' },
      test: {
        vars: {
          prompt: 'Please answer in two sentences for a user whose role is "{{purpose | trim}}".',
        },
        assert: [
          {
            type: 'assert-set',
            assert: [{ type: 'promptfoo:redteam:ascii-smuggling' }],
          },
        ],
        metadata: createAsciiSmugglingMetadata(),
      },
      testSuite: createEmptyEvaluationConfig() as unknown as TestSuite,
      conversations: {},
      registers: {},
      isRedteam: false,
    });

    expect(results[0].success).toBe(true);
    expect(results[0].prompt.raw).toContain('{{purpose | trim}}');
  });

  it('should continue rendering non-redteam tests that only set pluginId metadata', async () => {
    const results = await runEval({
      ...defaultOptions,
      provider: mockProvider,
      prompt: { raw: 'User said: {{query}}', label: 'test-label' },
      test: {
        vars: {
          name: 'Alice',
          query: 'Hello {{name}}',
        },
        metadata: createAsciiSmugglingMetadata(),
      },
      testSuite: createEmptyEvaluationConfig() as unknown as TestSuite,
      conversations: {},
      registers: {},
      isRedteam: false,
    });

    expect(results[0].success).toBe(true);
    expect(results[0].prompt.raw).toContain('Hello Alice');
    expect(results[0].prompt.raw).not.toContain('{{name}}');
  });

  describe('latencyMs handling', () => {
    it('should use provider-supplied latencyMs when available', async () => {
      const providerWithLatency: ApiProvider = {
        id: vi.fn().mockReturnValue('latency-provider'),
        callApi: vi.fn().mockResolvedValue({
          output: 'Test output',
          latencyMs: 5000,
          tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
        }),
      };

      const results = await runEval({
        ...defaultOptions,
        provider: providerWithLatency,
        prompt: { raw: 'Test prompt', label: 'test-label' },
        test: {},
        conversations: {},
        registers: {},
      });

      expect(results[0].latencyMs).toBe(5000);
    });

    it('should use provider-supplied latencyMs for cached responses', async () => {
      const cachedProvider: ApiProvider = {
        id: vi.fn().mockReturnValue('cached-provider'),
        callApi: vi.fn().mockResolvedValue({
          output: 'Cached output',
          cached: true,
          latencyMs: 3500,
          tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
        }),
      };

      const results = await runEval({
        ...defaultOptions,
        provider: cachedProvider,
        prompt: { raw: 'Test prompt', label: 'test-label' },
        test: {},
        conversations: {},
        registers: {},
      });

      expect(results[0].latencyMs).toBe(3500);
      expect(results[0].response?.cached).toBe(true);
    });

    it('should fall back to measured latency when provider does not supply latencyMs', async () => {
      vi.useFakeTimers();

      const providerWithoutLatency: ApiProvider = {
        id: vi.fn().mockReturnValue('no-latency-provider'),
        callApi: vi.fn().mockImplementation(async () => {
          // Yield first so the test still validates that runEval awaits the
          // provider before computing elapsed time. Then advance the fake
          // clock so the latency measurement records ~50ms without relying
          // on a real timer.
          await Promise.resolve();
          vi.advanceTimersByTime(50);
          return createTokenOutput();
        }),
      };

      try {
        const resultPromise = runEval({
          ...defaultOptions,
          provider: providerWithoutLatency,
          prompt: { raw: 'Test prompt', label: 'test-label' },
          test: {},
          conversations: {},
          registers: {},
        });
        await vi.runAllTimersAsync();
        const results = await resultPromise;

        // Should have measured latency (>= 45ms accounting for timer precision)
        expect(results[0].latencyMs).toBeGreaterThanOrEqual(45);
      } finally {
        vi.useRealTimers();
      }
    });

    it.each([
      { output: 'Test output' },
      { output: 'Cached output', cached: true },
      { error: 'Provider error' },
    ])('measures elapsed latency across wall-clock rollback for %j', async (response) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));

      const provider: ApiProvider = {
        id: () => 'clock-rollback-provider',
        callApi: async () => {
          await Promise.resolve();
          vi.setSystemTime(Date.now() - 5000);
          vi.advanceTimersByTime(50);
          return response;
        },
      };

      const results = await runEval({
        ...defaultOptions,
        provider,
        prompt: { raw: 'Test prompt', label: 'test-label' },
        test: {},
        conversations: {},
        registers: {},
      });

      expect(results[0].latencyMs).toBe(50);
      expect(results[0].success).toBe(!('error' in response));
      expect(results[0].error).toBe('error' in response ? response.error : undefined);
    });

    it('reports measured latency in whole milliseconds', async () => {
      vi.useFakeTimers();

      const provider: ApiProvider = {
        id: () => 'fractional-latency-provider',
        callApi: async () => {
          await Promise.resolve();
          // performance.now() is fractional; shared results are stored as integers.
          vi.advanceTimersByTime(12.6);
          return { output: 'Test output' };
        },
      };

      const results = await runEval({
        ...defaultOptions,
        provider,
        prompt: { raw: 'Test prompt', label: 'test-label' },
        test: {},
        conversations: {},
        registers: {},
      });

      expect(results[0].latencyMs).toBe(13);
      expect(Number.isInteger(results[0].latencyMs)).toBe(true);
    });

    it('should respect provider latencyMs of 0', async () => {
      const providerWithZeroLatency: ApiProvider = {
        id: vi.fn().mockReturnValue('zero-latency-provider'),
        callApi: vi.fn().mockResolvedValue({
          output: 'Test output',
          latencyMs: 0,
          tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
        }),
      };

      const results = await runEval({
        ...defaultOptions,
        provider: providerWithZeroLatency,
        prompt: { raw: 'Test prompt', label: 'test-label' },
        test: {},
        conversations: {},
        registers: {},
      });

      expect(results[0].latencyMs).toBe(0);
    });
  });

  it.each(['already-aborted', 'during-delay', 'ordinary', 'cached'] as const)(
    'preserves completed provider diagnostics through %s delay handling',
    async (phase) => {
      const actualTime =
        await vi.importActual<typeof import('../../src/util/time')>('../../src/util/time');
      vi.mocked(sleep).mockImplementation(actualTime.sleep);
      vi.useFakeTimers({
        toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
      });
      const registry = new RateLimitRegistry({ maxConcurrency: 1 });
      const controller = new AbortController();
      const reason = Object.freeze(
        Object.assign(new Error('caller stopped'), { name: 'AbortException' }),
      );
      const response = {
        error: 'Completed callback diagnostic',
        cost: 0.25,
        tokenUsage: { prompt: 2, completion: 3, total: 5, numRequests: 1 },
        metadata: { errorOrigin: 'tool' as const },
        cached: phase === 'cached',
      };
      const provider: ApiProvider = {
        id: () => 'completed-diagnostic',
        delay: 60000,
        callApi: vi.fn(async () => {
          if (phase === 'already-aborted') {
            controller.abort(reason);
          }
          return response;
        }),
      };
      let outcome: { rows: Awaited<ReturnType<typeof runEval>> } | { error: unknown } | undefined;
      const pending = runEval({
        ...defaultOptions,
        provider,
        prompt: { raw: 'Test prompt', label: 'test-label' },
        test: {},
        abortSignal: controller.signal,
        rateLimitRegistry: registry,
      }).then(
        (rows) => {
          outcome = { rows };
        },
        (error: unknown) => {
          outcome = { error };
        },
      );
      try {
        await vi.advanceTimersByTimeAsync(0);
        expect(provider.callApi).toHaveBeenCalledOnce();
        if (phase === 'ordinary' || phase === 'during-delay') {
          expect(outcome).toBeUndefined();
        }
        if (phase === 'during-delay') {
          controller.abort(reason);
          await vi.advanceTimersByTimeAsync(0);
        } else if (phase === 'ordinary') {
          await vi.advanceTimersByTimeAsync(59999);
          expect(outcome).toBeUndefined();
          await vi.advanceTimersByTimeAsync(1);
        }
        await pending;
        expect(outcome).toBeDefined();
        if (!outcome || 'error' in outcome) {
          throw new Error('runEval did not settle with a result');
        }
        const [row] = outcome.rows;
        expect(row.error).toBe(response.error);
        expect(row.response?.cost).toBe(0.25);
        expect(row.response?.tokenUsage).toMatchObject({ prompt: 2, completion: 3, total: 5 });
        expect(row.success).toBe(false);
        expect(row.failureReason).toBe(ResultFailureReason.ERROR);
        expect(provider.callApi).toHaveBeenCalledOnce();
        expect(
          Object.values(registry.getMetrics()).every(
            (m) => m.activeRequests === 0 && m.queueDepth === 0,
          ),
        ).toBe(true);
        // Check this evaluation's cleanup without counting unrelated worker timers.
        expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
      } finally {
        registry.dispose();
        await vi.advanceTimersByTimeAsync(60000);
        await pending;
        vi.mocked(sleep).mockReset();
      }
    },
  );

  it.each([
    { description: 'caller AbortException', name: 'AbortException', aborted: true, logged: false },
    { description: 'independent SDK AbortError', name: 'AbortError', aborted: false, logged: true },
    {
      description: 'unrelated error during caller cancellation',
      name: 'SyntaxError',
      aborted: true,
      logged: true,
    },
  ])('classifies provider logging for $description', async ({ name, aborted, logged }) => {
    const controller = new AbortController();
    const error = Object.freeze(Object.assign(new Error('Exact provider diagnostic'), { name }));
    const errorLog = vi.spyOn(logger, 'error').mockImplementation(() => logger);
    const provider: ApiProvider = {
      id: () => 'logging-control',
      callApi: vi.fn(async () => {
        if (aborted) {
          controller.abort(error);
        }
        throw error;
      }),
    };
    const [row] = await runEval({
      ...defaultOptions,
      provider,
      prompt: { raw: 'Test prompt', label: 'test-label' },
      test: {},
      abortSignal: controller.signal,
    });
    expect(row.error).toContain('Exact provider diagnostic');
    expect(row.failureReason).toBe(ResultFailureReason.ERROR);
    expect(row.success).toBe(false);
    expect(provider.callApi).toHaveBeenCalledOnce();
    expect(error.name).toBe(name);
    if (aborted) {
      expect(controller.signal.reason).toBe(error);
    }
    expect(
      errorLog.mock.calls.filter(([message]) => message === 'Provider call failed during eval'),
    ).toHaveLength(logged ? 1 : 0);
  });
});
