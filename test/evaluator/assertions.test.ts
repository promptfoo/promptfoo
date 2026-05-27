import './setup';

import { randomUUID } from 'crypto';

import { expect, it, vi } from 'vitest';
import { evaluate } from '../../src/evaluator';
import Eval from '../../src/models/eval';
import { type ApiProvider, type TestSuite } from '../../src/types/index';
import {
  mockApiProvider,
  mockGradingApiProviderFails,
  mockGradingApiProviderPasses,
  toPrompt,
} from './helpers';
import { describeEvaluator } from './lifecycle';

describeEvaluator('evaluator assertions', () => {
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
                      value: 'Use the explicit configured grader ID',
                      provider: { text: 'litellm:judge' },
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
