import './setup';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'crypto';

import { expect, it, vi } from 'vitest';
import * as blobExtractor from '../../src/blobs/extractor';
import { evaluate } from '../../src/evaluator';
import Eval from '../../src/models/eval';
import { type ApiProvider, ResultFailureReason, type TestSuite } from '../../src/types/index';
import {
  mockApiProvider,
  mockGradingApiProviderFails,
  mockGradingApiProviderPasses,
  toPrompt,
} from './helpers';
import { describeEvaluator } from './lifecycle';

describeEvaluator('evaluator assertions', () => {
  it.each(
    (['coding-agent:trace-redaction', 'harness:artifact-redaction'] as const).flatMap((plugin) =>
      [1, 2].map((maxConcurrency) => ({ plugin, maxConcurrency })),
    ),
  )(
    'snapshots all $plugin receipts before targets run at concurrency $maxConcurrency',
    async ({ plugin, maxConcurrency }) => {
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'protected-receipts-'));
      try {
        const secrets = ['PRIVATE_FIRST_RECEIPT_VALUE', 'PRIVATE_SECOND_RECEIPT_VALUE'];
        const receipts = secrets.map((secret, index) => {
          const receipt = path.join(directory, `receipt-${index}`);
          fs.writeFileSync(receipt, secret);
          return receipt;
        });
        const artifacts = secrets.map((_, index) => path.join(directory, `report-${index}`));
        let targetCalls = 0;
        vi.mocked(mockApiProvider.callApi).mockImplementation(async () => {
          if (targetCalls++ === 0) {
            receipts.forEach((receipt, index) => {
              fs.copyFileSync(receipt, artifacts[index]);
              fs.writeFileSync(receipt, 'DECOY_RECEIPT_FROM_TARGET');
            });
          }
          return { output: 'Clean public report' };
        });
        const testSuite: TestSuite = {
          providers: [mockApiProvider],
          prompts: [toPrompt('Inspect the public report')],
          tests: receipts.map((receipt, index) => ({
            vars: { receipt },
            assert: [
              {
                type: 'assert-set',
                assert: [
                  {
                    type: `promptfoo:redteam:${plugin}`,
                    value:
                      index === 0
                        ? { rawReceiptPaths: [receipt], redactedArtifactPath: artifacts[index] }
                        : { redactedArtifact: { receiptPath: receipt, path: artifacts[index] } },
                  },
                ],
              },
            ],
          })),
        };
        const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
        await evaluate(testSuite, evalRecord, { maxConcurrency });
        const summary = await evalRecord.toEvaluateSummary();
        expect(targetCalls).toBe(2);
        expect(summary.results).toHaveLength(2);
        for (const result of summary.results) {
          expect(result).toMatchObject({
            success: false,
            failureReason: ResultFailureReason.ASSERT,
          });
          expect(result.gradingResult?.reason).toContain('raw sensitive value');
        }
        for (const secret of secrets) {
          expect(JSON.stringify(summary)).not.toContain(secret);
        }
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    },
  );

  it.each(['missing', 'invalid'])(
    'rejects a receipt that was %s before the target supplied a decoy',
    async (initial) => {
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'missing-receipt-'));
      try {
        const receipt = path.join(directory, 'receipt');
        if (initial === 'invalid') {
          fs.writeFileSync(receipt, '');
        }
        vi.mocked(mockApiProvider.callApi).mockImplementation(async () => {
          fs.writeFileSync(receipt, 'DECOY_RECEIPT_FROM_TARGET');
          return { output: 'Clean public report' };
        });
        const testSuite: TestSuite = {
          providers: [mockApiProvider],
          prompts: [toPrompt('Inspect the public report')],
          tests: [
            {
              assert: [
                {
                  type: 'promptfoo:redteam:coding-agent:trace-redaction',
                  value: { rawReceiptPath: receipt },
                },
              ],
            },
          ],
        };
        const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
        await evaluate(testSuite, evalRecord, { maxConcurrency: 1 });
        const summary = await evalRecord.toEvaluateSummary();
        expect(summary.results[0]).toMatchObject({
          success: false,
          failureReason: ResultFailureReason.ASSERT,
        });
        expect(JSON.stringify(summary)).toContain('verifier-sidecar-failed');
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    },
  );

  it.each(['coding-agent:trace-redaction', 'harness:artifact-redaction'] as const)(
    'keeps %s output out of later conversation and register state',
    async (plugin) => {
      const secret = 'PRIVATE_STATE_RECEIPT';
      vi.mocked(mockApiProvider.callApi)
        .mockResolvedValueOnce({ output: secret })
        .mockResolvedValueOnce({ output: 'Clean' });
      const testSuite: TestSuite = {
        providers: [mockApiProvider],
        prompts: [toPrompt('Inspect report. {{ saved }} {{ _conversation[0].response.output }}')],
        tests: [
          {
            options: { storeOutputAs: 'saved' },
            assert: [{ type: `promptfoo:redteam:${plugin}`, value: { rawReceipt: secret } }],
          },
          { assert: [{ type: 'equals', value: 'Clean' }] },
        ],
      };
      const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
      await evaluate(testSuite, evalRecord, { maxConcurrency: 1 });
      const summary = await evalRecord.toEvaluateSummary();
      expect(mockApiProvider.callApi).toHaveBeenCalledTimes(2);
      expect(vi.mocked(mockApiProvider.callApi).mock.calls[1][0]).not.toContain(secret);
      expect(summary.results[0].failureReason).toBe(ResultFailureReason.ASSERT);
      expect(summary.results[1].success).toBe(true);
      expect(JSON.stringify(summary)).not.toContain(secret);
    },
  );

  it.each(['coding-agent:trace-redaction', 'harness:artifact-redaction'] as const)(
    'does not write private output media to blobs for %s',
    async (plugin) => {
      const extract = vi.spyOn(blobExtractor, 'extractAndStoreBinaryData');
      try {
        const output = `data:image/png;base64,${Buffer.alloc(2048, 1).toString('base64')}`;
        vi.mocked(mockApiProvider.callApi).mockResolvedValue({ output });
        const testSuite: TestSuite = {
          providers: [mockApiProvider],
          prompts: [toPrompt('Inspect the public report')],
          tests: [{ assert: [{ type: `promptfoo:redteam:${plugin}` }] }],
        };
        const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
        await evaluate(testSuite, evalRecord, { maxConcurrency: 1 });
        const summary = await evalRecord.toEvaluateSummary();
        expect(
          extract.mock.calls.some(([response]) => JSON.stringify(response)?.includes(output)),
        ).toBe(false);
        expect(summary.results[0]).toMatchObject({
          success: false,
          failureReason: ResultFailureReason.ERROR,
        });
        expect(JSON.stringify(summary)).not.toContain(output);
        expect(JSON.stringify(summary)).not.toContain('promptfoo://blob/');
      } finally {
        extract.mockRestore();
      }
    },
  );

  it.each(['failed', 'aborted'])(
    'preserves completed audio output when grading is %s',
    async (outcome) => {
      const abortController = new AbortController();
      vi.mocked(mockApiProvider.callApi).mockResolvedValue({
        output: 'Hello.',
        audio: { data: Buffer.alloc(2048, 1).toString('base64'), format: 'wav' },
        cost: 0.25,
        tokenUsage: { prompt: 5, completion: 10, total: 15, numRequests: 1 },
      });
      const grader: ApiProvider = {
        id: () => 'audio-grader',
        getAudioInputFormat: () => 'openai',
        callApi: vi.fn(async () => {
          const error = new Error('Grading interrupted');
          if (outcome === 'aborted') {
            error.name = 'AbortError';
            abortController.abort(error);
          }
          throw error;
        }),
      };
      const testSuite: TestSuite = {
        providers: [mockApiProvider],
        prompts: [toPrompt('Say hello')],
        tests: [
          { assert: [{ type: 'llm-rubric', value: 'The speaker sounds calm.', provider: grader }] },
        ],
      };
      const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
      await evaluate(testSuite, evalRecord, {
        maxConcurrency: 1,
        abortSignal: abortController.signal,
      });
      const summary = await evalRecord.toEvaluateSummary();
      expect(summary.results).toHaveLength(1);
      const row = summary.results[0];
      expect(row.success).toBe(false);
      expect(row.failureReason).toBe(ResultFailureReason.ERROR);
      expect(row.error).toContain('Grading interrupted');
      expect(row.response?.output).toBe('Hello.');
      expect(row.response?.audio?.blobRef).toBeDefined();
      expect(row.response?.audio?.data).toBeUndefined();
      expect(row.cost).toBe(0.25);
      expect(row.tokenUsage?.total).toBe(15);
    },
  );

  it('runs different audio graders serially at maxConcurrency 1', async () => {
    vi.mocked(mockApiProvider.callApi).mockResolvedValue({
      output: 'Hello.',
      audio: { data: Buffer.alloc(2048, 1).toString('base64'), format: 'wav' },
    });
    let activeCalls = 0;
    let maximumActiveCalls = 0;
    const graders: ApiProvider[] = ['first-grader', 'second-grader'].map((id) => ({
      id: () => id,
      getAudioInputFormat: () => 'openai',
      callApi: vi.fn(async () => {
        maximumActiveCalls = Math.max(maximumActiveCalls, ++activeCalls);
        await new Promise<void>((resolve) => setImmediate(resolve));
        activeCalls--;
        return { output: '{"pass":true,"score":1}' };
      }),
    }));
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Say hello')],
      tests: [
        {
          assert: graders.map((provider) => ({
            type: 'llm-rubric',
            value: 'The speaker sounds calm.',
            provider,
          })),
        },
      ],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, { maxConcurrency: 1 });
    const summary = await evalRecord.toEvaluateSummary();
    expect(summary.stats.successes).toBe(1);
    for (const grader of graders) {
      expect(grader.callApi).toHaveBeenCalledTimes(1);
    }
    expect(maximumActiveCalls).toBe(1);
  });

  it('finishes audio grading before collecting the next serial target response', async () => {
    const callOrder: string[] = [];
    vi.mocked(mockApiProvider.callApi).mockImplementation(async () => {
      callOrder.push('target');
      return {
        output: 'Hello.',
        audio: { data: Buffer.alloc(2048, 1).toString('base64'), format: 'wav' },
      };
    });
    const grader: ApiProvider = {
      id: () => 'audio-grader',
      getAudioInputFormat: () => 'openai',
      callApi: vi.fn(async () => {
        callOrder.push('grader');
        return { output: '{"pass":true,"score":1}' };
      }),
    };
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Say hello')],
      tests: Array.from({ length: 3 }, () => ({
        assert: [{ type: 'llm-rubric', value: 'The speaker sounds calm.', provider: grader }],
      })),
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, { maxConcurrency: 1 });
    const summary = await evalRecord.toEvaluateSummary();
    expect(summary.stats.successes).toBe(3);
    expect(callOrder).toEqual(['target', 'grader', 'target', 'grader', 'target', 'grader']);
    for (const row of summary.results) {
      expect(row.response?.audio?.blobRef).toBeDefined();
      expect(row.response?.audio?.data).toBeUndefined();
    }
  });

  it('processes mixed audio and text rows once across grading flushes', async () => {
    const kinds = ['text', 'audio', 'text', 'audio', 'text'];
    const callOrder: string[] = [];
    vi.mocked(mockApiProvider.callApi).mockImplementation(async (prompt) => {
      callOrder.push(`target:${prompt}`);
      return {
        output: prompt,
        ...(prompt.includes('audio') && {
          audio: { data: Buffer.alloc(2048, 1).toString('base64'), format: 'wav' },
        }),
      };
    });
    const grader: ApiProvider = {
      id: () => 'mixed-grader',
      getAudioInputFormat: () => 'openai',
      callApi: vi.fn(async (_prompt, context) => {
        callOrder.push(`grader:${context?.vars.output}`);
        return { output: '{"pass":true,"score":1}' };
      }),
    };
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('{{index}} {{kind}}')],
      tests: kinds.map((kind, index) => ({
        vars: { kind, index },
        assert: [{ type: 'llm-rubric', value: 'The response is clear.', provider: grader }],
      })),
    };
    const progress = vi.fn();
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, { maxConcurrency: 1, progressCallback: progress });
    const summary = await evalRecord.toEvaluateSummary();
    expect(summary.stats.successes).toBe(kinds.length);
    expect(summary.results).toHaveLength(kinds.length);
    expect(grader.callApi).toHaveBeenCalledTimes(kinds.length);
    expect(progress).toHaveBeenCalledTimes(kinds.length);
    expect(callOrder).toEqual([
      'target:0 text',
      'target:1 audio',
      'grader:0 text',
      'grader:1 audio',
      'target:2 text',
      'target:3 audio',
      'grader:2 text',
      'grader:3 audio',
      'target:4 text',
      'grader:4 text',
    ]);
  });

  it.each([1, 2])(
    'grades native audio after blob extraction with concurrency %s',
    async (maxConcurrency) => {
      const audioData = Buffer.alloc(2048, 1).toString('base64');
      vi.mocked(mockApiProvider.callApi).mockResolvedValue({
        output: 'Hello.',
        audio: { data: audioData, format: 'wav', transcript: 'Hello.' },
      });
      const grader: ApiProvider = {
        ...mockGradingApiProviderPasses,
        getAudioInputFormat: () => 'openai',
      };
      const testSuite: TestSuite = {
        providers: [mockApiProvider],
        prompts: [toPrompt('Say hello')],
        tests: [
          { assert: [{ type: 'llm-rubric', value: 'The speaker sounds calm.', provider: grader }] },
        ],
      };
      const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
      await evaluate(testSuite, evalRecord, { maxConcurrency });
      const summary = await evalRecord.toEvaluateSummary();
      expect(summary.results[0].success).toBe(true);
      expect(summary.results[0].response?.audio?.blobRef).toBeDefined();
      expect(summary.results[0].response?.audio?.data).toBeUndefined();
      const messages = JSON.parse(vi.mocked(grader.callApi).mock.calls[0][0]);
      expect(messages.flatMap((message: { content: unknown }) => message.content)).toContainEqual({
        type: 'input_audio',
        input_audio: { data: audioData, format: 'wav' },
      });
    },
  );

  it('evaluate with expected value matching output', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [
        {
          assert: [
            {
              type: 'equals',
              value: 'Test output',
            },
          ],
        },
      ],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
    expect(summary.stats.successes).toBe(1);
    expect(summary.stats.failures).toBe(0);
    expect(summary.results[0].success).toBe(true);
    expect(summary.results[0].response?.output).toBe('Test output');
  });

  it('evaluate with expected value not matching output', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [
        {
          assert: [
            {
              type: 'equals',
              value: 'Different output',
            },
          ],
        },
      ],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
    expect(summary.stats.successes).toBe(0);
    expect(summary.stats.failures).toBe(1);
    expect(summary.results[0].success).toBe(false);
    expect(summary.results[0].response?.output).toBe('Test output');
  });

  it('evaluate with fn: expected value', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [
        {
          assert: [
            {
              type: 'javascript',
              value: 'output === "Test output";',
            },
          ],
        },
      ],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
    expect(summary.stats.successes).toBe(1);
    expect(summary.stats.failures).toBe(0);
    expect(summary.results[0].success).toBe(true);
    expect(summary.results[0].response?.output).toBe('Test output');
  });

  it('evaluate with fn: expected value not matching output', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [
        {
          assert: [
            {
              type: 'javascript',
              value: 'output === "Different output";',
            },
          ],
        },
      ],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
    expect(summary.stats.successes).toBe(0);
    expect(summary.stats.failures).toBe(1);
    expect(summary.results[0].success).toBe(false);
    expect(summary.results[0].response?.output).toBe('Test output');
  });

  it('evaluate with grading expected value', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [
        {
          assert: [
            {
              type: 'llm-rubric',
              value: 'output is a test output',
            },
          ],
        },
      ],
      defaultTest: {
        options: {
          provider: mockGradingApiProviderPasses,
        },
      },
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
    expect(summary.stats.successes).toBe(1);
    expect(summary.stats.failures).toBe(0);
    expect(summary.results[0].success).toBe(true);
    expect(summary.results[0].response?.output).toBe('Test output');
  });

  it('reuses a configured LiteLLM provider ID for both G-Eval calls', async () => {
    const configuredLiteLLM: ApiProvider = {
      id: vi.fn().mockReturnValue('litellm:gemini-pro'),
      config: { apiBaseUrl: 'http://localhost:4000', temperature: 0 },
      callApi: vi.fn().mockImplementation(async (_prompt, context) => ({
        output:
          context?.prompt?.label === 'g-eval-steps'
            ? JSON.stringify({ steps: ['Check factual accuracy'] })
            : JSON.stringify({ score: 10, reason: 'The answer is accurate' }),
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
      })),
    };
    const testSuite: TestSuite = {
      providers: [mockApiProvider, configuredLiteLLM],
      prompts: [toPrompt('What is the capital of France?')],
      tests: [
        {
          providers: ['test-provider'],
          assert: [
            {
              type: 'g-eval',
              value: 'The answer identifies the capital correctly',
              provider: 'litellm:gemini-pro',
            },
          ],
        },
      ],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
    expect(configuredLiteLLM.callApi).toHaveBeenCalledTimes(2);
    expect(
      vi.mocked(configuredLiteLLM.callApi).mock.calls.map(([, context]) => context?.prompt?.label),
    ).toEqual(['g-eval-steps', 'g-eval']);
    expect(summary.stats.successes).toBe(1);
  });

  it('reuses configured graders in typed defaults and scenario assertion sets', async () => {
    const configuredGrader: ApiProvider = {
      id: vi.fn().mockReturnValue('litellm:judge'),
      label: 'Configured grader',
      callApi: vi.fn().mockResolvedValue({
        output: JSON.stringify({ pass: true, score: 1, reason: 'The output passes' }),
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
      }),
    };
    const testSuite: TestSuite = {
      providers: [mockApiProvider, configuredGrader],
      prompts: [toPrompt('Test prompt')],
      defaultTest: {
        options: { provider: { text: 'Configured grader' } },
      },
      scenarios: [
        {
          config: [{}],
          tests: [
            {
              providers: ['test-provider'],
              assert: [
                {
                  type: 'assert-set',
                  assert: [
                    { type: 'llm-rubric', value: 'Use the default grader option' },
                    {
                      type: 'llm-rubric',
                      value: 'Use the explicit configured grader ID option',
                      provider: { text: { id: 'litellm:judge' } },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
    expect(configuredGrader.callApi).toHaveBeenCalledTimes(2);
    expect(summary.stats.successes).toBe(1);
  });

  it('routes an assertion provider id to the id-matching provider when a sibling label collides', async () => {
    const judgeById: ApiProvider = {
      id: vi.fn().mockReturnValue('judge'),
      callApi: vi.fn().mockResolvedValue({
        output: JSON.stringify({ pass: true, score: 1, reason: 'Passes via id-matched judge.' }),
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
      }),
    };
    const judgeByLabel: ApiProvider = {
      id: vi.fn().mockReturnValue('litellm:judge'),
      label: 'judge',
      callApi: vi.fn().mockResolvedValue({
        output: JSON.stringify({ pass: false, score: 0, reason: 'Should never be called.' }),
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
      }),
    };
    const testSuite: TestSuite = {
      providers: [mockApiProvider, judgeById, judgeByLabel],
      prompts: [toPrompt('Test prompt')],
      tests: [
        {
          providers: ['test-provider'],
          assert: [{ type: 'llm-rubric', value: 'Use the id-matched judge', provider: 'judge' }],
        },
      ],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(judgeById.callApi).toHaveBeenCalledTimes(1);
    expect(judgeByLabel.callApi).not.toHaveBeenCalled();
    expect(summary.stats.successes).toBe(1);
  });

  it('preserves suite env for typed graders inherited from defaultTest assertions', async () => {
    const testSuite: TestSuite = {
      env: { LITELLM_API_BASE: 'echo' },
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [{ providers: ['test-provider'] }],
      defaultTest: {
        assert: [
          {
            type: 'llm-rubric',
            value: 'Grade the test output',
            rubricPrompt: '{"pass":true,"score":1,"reason":"Resolved suite env"}',
            provider: {
              text: {
                id: '{{ env.LITELLM_API_BASE }}',
              },
            },
          },
        ],
      },
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(summary.stats.successes).toBe(1);
    expect(summary.results[0].success).toBe(true);
  });

  it('reuses configured text and embedding graders for answer relevance', async () => {
    const textJudge: ApiProvider = {
      id: vi.fn().mockReturnValue('litellm:text-judge'),
      callApi: vi.fn().mockResolvedValue({ output: 'Test prompt' }),
    };
    const embeddingJudge: ApiProvider = {
      id: vi.fn().mockReturnValue('litellm:embedding:judge'),
      callApi: vi.fn().mockResolvedValue({ output: '' }),
      callEmbeddingApi: vi.fn().mockResolvedValue({ embedding: [1, 0] }),
    };
    const testSuite: TestSuite = {
      providers: [mockApiProvider, textJudge, embeddingJudge],
      prompts: [toPrompt('Test prompt')],
      tests: [
        {
          providers: ['test-provider'],
          assert: [
            {
              type: 'answer-relevance',
              threshold: 0.8,
              provider: {
                text: 'litellm:text-judge',
                embedding: 'litellm:embedding:judge',
              },
            },
          ],
        },
      ],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(textJudge.callApi).toHaveBeenCalledTimes(3);
    expect(embeddingJudge.callEmbeddingApi).toHaveBeenCalledTimes(4);
    expect(summary.stats.successes).toBe(1);
  });

  it('evaluate with grading expected value does not pass', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [
        {
          assert: [
            {
              type: 'llm-rubric',
              value: 'output is a test output',
            },
          ],
        },
      ],
      defaultTest: {
        options: {
          provider: mockGradingApiProviderFails,
        },
      },
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
    expect(summary.stats.successes).toBe(0);
    expect(summary.stats.failures).toBe(1);
    expect(summary.results[0].success).toBe(false);
    expect(summary.results[0].response?.output).toBe('Test output');
  });
});
