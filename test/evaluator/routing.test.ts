import './setup';

import { randomUUID } from 'crypto';

import { expect, it, vi } from 'vitest';
import { evaluate } from '../../src/evaluator';
import Eval from '../../src/models/eval';
import { type ApiProvider, type TestSuite } from '../../src/types/index';
import { mockApiProvider, toPrompt } from './helpers';
import { describeEvaluator } from './lifecycle';

describeEvaluator('evaluator prompt and provider routing', () => {
  it('evaluate with providerPromptMap', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt 1'), toPrompt('Test prompt 2')],
      providerPromptMap: {
        'test-provider': ['Test prompt 1'],
      },
      tests: [
        {
          vars: { var1: 'value1', var2: 'value2' },
        },
      ],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
    expect(summary.stats.successes).toBe(1);
    expect(summary.stats.failures).toBe(0);
    expect(summary.stats.tokenUsage).toEqual({
      total: 10,
      prompt: 5,
      completion: 5,
      cached: 0,
      numRequests: 1,
      completionDetails: {
        reasoning: 0,
        acceptedPrediction: 0,
        rejectedPrediction: 0,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
      },
      assertions: {
        total: 0,
        prompt: 0,
        completion: 0,
        cached: 0,
        numRequests: 0,
        completionDetails: {
          reasoning: 0,
          acceptedPrediction: 0,
          rejectedPrediction: 0,
          cacheReadInputTokens: 0,
          cacheCreationInputTokens: 0,
        },
      },
    });
    expect(summary.results[0].prompt.raw).toBe('Test prompt 1');
    expect(summary.results[0].prompt.label).toBe('Test prompt 1');
    expect(summary.results[0].response?.output).toBe('Test output');
  });

  it('evaluate with allowed prompts filtering', async () => {
    const mockApiProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('test-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Test output',
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
      }),
    };

    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [
        { raw: 'Test prompt 1', label: 'prompt1' },
        { raw: 'Test prompt 2', label: 'prompt2' },
        { raw: 'Test prompt 3', label: 'group1:prompt3' },
      ],
      providerPromptMap: {
        'test-provider': ['prompt1', 'group1'],
      },
      tests: [
        {
          vars: { var1: 'value1', var2: 'value2' },
        },
      ],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(2);
    expect(summary).toMatchObject({
      stats: {
        successes: 2,
        failures: 0,
      },
      results: [{ prompt: { label: 'prompt1' } }, { prompt: { label: 'group1:prompt3' } }],
    });
  });

  it('evaluate with labeled and unlabeled providers and providerPromptMap', async () => {
    const mockLabeledProvider: ApiProvider = {
      id: () => 'labeled-provider-id',
      label: 'Labeled Provider',
      callApi: vi.fn().mockResolvedValue({
        output: 'Labeled Provider Output',
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
      }),
    };

    const mockUnlabeledProvider: ApiProvider = {
      id: () => 'unlabeled-provider-id',
      callApi: vi.fn().mockResolvedValue({
        output: 'Unlabeled Provider Output',
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
      }),
    };

    const testSuite: TestSuite = {
      providers: [mockLabeledProvider, mockUnlabeledProvider],
      prompts: [
        {
          raw: 'Prompt 1',
          label: 'prompt1',
        },
        {
          raw: 'Prompt 2',
          label: 'prompt2',
        },
      ],
      providerPromptMap: {
        'Labeled Provider': ['prompt1'],
        'unlabeled-provider-id': ['prompt2'],
      },
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();
    expect(summary).toMatchObject({
      stats: expect.objectContaining({
        successes: 2,
        failures: 0,
      }),
      results: [
        expect.objectContaining({
          provider: expect.objectContaining({
            id: 'labeled-provider-id',
            label: 'Labeled Provider',
          }),
          response: expect.objectContaining({
            output: 'Labeled Provider Output',
          }),
        }),
        expect.objectContaining({
          provider: expect.objectContaining({
            id: 'unlabeled-provider-id',
            label: undefined,
          }),
          response: expect.objectContaining({
            output: 'Unlabeled Provider Output',
          }),
        }),
      ],
    });
    expect(evalRecord.prompts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: 'Labeled Provider',
        }),
        expect.objectContaining({
          provider: 'unlabeled-provider-id',
        }),
      ]),
    );

    expect(mockLabeledProvider.callApi).toHaveBeenCalledTimes(1);
    expect(mockUnlabeledProvider.callApi).toHaveBeenCalledTimes(1);
  });

  it('evaluate with test-level providers filter', async () => {
    const mockProvider1: ApiProvider = {
      id: () => 'provider-1',
      label: 'fast-model',
      callApi: vi.fn().mockResolvedValue({
        output: 'Fast Output',
        tokenUsage: { total: 5, prompt: 2, completion: 3, cached: 0, numRequests: 1 },
      }),
    };

    const mockProvider2: ApiProvider = {
      id: () => 'provider-2',
      label: 'smart-model',
      callApi: vi.fn().mockResolvedValue({
        output: 'Smart Output',
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
      }),
    };

    const testSuite: TestSuite = {
      providers: [mockProvider1, mockProvider2],
      prompts: [{ raw: 'Test prompt', label: 'prompt1' }],
      tests: [
        {
          description: 'fast test',
          vars: { input: 'simple' },
          providers: ['fast-model'], // Only run on fast-model
        },
        {
          description: 'smart test',
          vars: { input: 'complex' },
          providers: ['smart-model'], // Only run on smart-model
        },
        {
          description: 'all providers test',
          vars: { input: 'general' },
          // No providers filter - runs on both
        },
      ],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    // 1 test on fast-model + 1 test on smart-model + 2 tests (1 on each provider) = 4 total
    expect(summary.stats.successes).toBe(4);
    expect(mockProvider1.callApi).toHaveBeenCalledTimes(2); // fast test + all providers test
    expect(mockProvider2.callApi).toHaveBeenCalledTimes(2); // smart test + all providers test
  });

  it('evaluate with test-level providers filter using wildcard', async () => {
    const openaiProvider: ApiProvider = {
      id: () => 'openai:gpt-4',
      callApi: vi.fn().mockResolvedValue({
        output: 'OpenAI Output',
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
      }),
    };

    const anthropicProvider: ApiProvider = {
      id: () => 'anthropic:claude-3',
      callApi: vi.fn().mockResolvedValue({
        output: 'Anthropic Output',
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
      }),
    };

    const testSuite: TestSuite = {
      providers: [openaiProvider, anthropicProvider],
      prompts: [{ raw: 'Test prompt', label: 'prompt1' }],
      tests: [
        {
          vars: { input: 'test' },
          providers: ['openai:*'], // Wildcard - only run on openai providers
        },
      ],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(summary.stats.successes).toBe(1);
    expect(openaiProvider.callApi).toHaveBeenCalledTimes(1);
    expect(anthropicProvider.callApi).toHaveBeenCalledTimes(0);
  });

  it('evaluate inherits providers filter from defaultTest', async () => {
    const provider1: ApiProvider = {
      id: () => 'provider-1',
      label: 'default-provider',
      callApi: vi.fn().mockResolvedValue({
        output: 'Output 1',
        tokenUsage: { total: 5, prompt: 2, completion: 3, cached: 0, numRequests: 1 },
      }),
    };

    const provider2: ApiProvider = {
      id: () => 'provider-2',
      label: 'other-provider',
      callApi: vi.fn().mockResolvedValue({
        output: 'Output 2',
        tokenUsage: { total: 5, prompt: 2, completion: 3, cached: 0, numRequests: 1 },
      }),
    };

    const testSuite: TestSuite = {
      providers: [provider1, provider2],
      prompts: [{ raw: 'Test prompt', label: 'prompt1' }],
      defaultTest: {
        providers: ['default-provider'], // Default to only default-provider
      },
      tests: [
        {
          vars: { input: 'test1' },
          // Inherits providers filter from defaultTest
        },
        {
          vars: { input: 'test2' },
          providers: ['other-provider'], // Override defaultTest
        },
      ],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(summary.stats.successes).toBe(2);
    expect(provider1.callApi).toHaveBeenCalledTimes(1); // test1 only
    expect(provider2.callApi).toHaveBeenCalledTimes(1); // test2 only
  });

  it('evaluate with empty providers array blocks all providers', async () => {
    const mockProvider: ApiProvider = {
      id: () => 'test-provider',
      callApi: vi.fn().mockResolvedValue({
        output: 'Output',
        tokenUsage: { total: 5, prompt: 2, completion: 3, cached: 0, numRequests: 1 },
      }),
    };

    const testSuite: TestSuite = {
      providers: [mockProvider],
      prompts: [{ raw: 'Test prompt', label: 'prompt1' }],
      tests: [
        {
          vars: { input: 'test' },
          providers: [], // Empty array = block all
        },
      ],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(summary.stats.successes).toBe(0);
    expect(mockProvider.callApi).toHaveBeenCalledTimes(0);
  });

  it('evaluate with providers filter and providerPromptMap combined', async () => {
    const provider1: ApiProvider = {
      id: () => 'provider-1',
      label: 'provider-one',
      callApi: vi.fn().mockResolvedValue({
        output: 'Output 1',
        tokenUsage: { total: 5, prompt: 2, completion: 3, cached: 0, numRequests: 1 },
      }),
    };

    const provider2: ApiProvider = {
      id: () => 'provider-2',
      label: 'provider-two',
      callApi: vi.fn().mockResolvedValue({
        output: 'Output 2',
        tokenUsage: { total: 5, prompt: 2, completion: 3, cached: 0, numRequests: 1 },
      }),
    };

    const testSuite: TestSuite = {
      providers: [provider1, provider2],
      prompts: [
        { raw: 'Prompt A', label: 'prompt-a' },
        { raw: 'Prompt B', label: 'prompt-b' },
      ],
      providerPromptMap: {
        'provider-one': ['prompt-a'], // provider-one only runs prompt-a
        'provider-two': ['prompt-b'], // provider-two only runs prompt-b
      },
      tests: [
        {
          vars: { input: 'test' },
          providers: ['provider-one'], // Only run on provider-one
        },
      ],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    // providers filter limits to provider-one
    // providerPromptMap limits provider-one to prompt-a
    // Result: 1 test case (provider-one + prompt-a)
    expect(summary.stats.successes).toBe(1);
    expect(provider1.callApi).toHaveBeenCalledTimes(1);
    expect(provider2.callApi).toHaveBeenCalledTimes(0);
  });

  it('promptIdx aligns with prompts array when test-level providers filter skips providers', async () => {
    // This test verifies that promptIdx correctly maps to the prompts array
    // even when test-level provider filtering causes some providers to be skipped.
    // Before the fix, promptIdx was a sequential counter that could misalign with
    // the prompts array when filters caused gaps.
    const provider1: ApiProvider = {
      id: () => 'provider-1',
      label: 'model-a',
      callApi: vi.fn().mockResolvedValue({
        output: 'Output from model-a',
        tokenUsage: { total: 5, prompt: 2, completion: 3, cached: 0, numRequests: 1 },
      }),
    };

    const provider2: ApiProvider = {
      id: () => 'provider-2',
      label: 'model-b',
      callApi: vi.fn().mockResolvedValue({
        output: 'Output from model-b',
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
      }),
    };

    const testSuite: TestSuite = {
      providers: [provider1, provider2],
      prompts: [toPrompt('Prompt X'), toPrompt('Prompt Y')],
      tests: [
        {
          vars: { input: 'test' },
          providers: ['model-b'], // Only run on provider2, skip provider1
        },
      ],
    };

    // prompts array should be: [model-a+PromptX(0), model-a+PromptY(1), model-b+PromptX(2), model-b+PromptY(3)]
    // With provider filter, only model-b runs, so promptIdx should be 2 and 3 (not 0 and 1)
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(summary.stats.successes).toBe(2);
    expect(provider1.callApi).toHaveBeenCalledTimes(0);
    expect(provider2.callApi).toHaveBeenCalledTimes(2);

    // Verify promptIdx values map to the correct provider in the prompts array
    const results = summary.results.sort((a, b) => a.promptIdx - b.promptIdx);
    expect(results).toHaveLength(2);
    // Both results should have promptIdx >= 2 (mapping to provider2's entries)
    for (const result of results) {
      expect(result.promptIdx).toBeGreaterThanOrEqual(2);
      expect(result.provider.id).toBe('provider-2');
    }
  });

  it('promptIdx aligns with prompts array when test-level prompts filter skips prompts', async () => {
    const provider1: ApiProvider = {
      id: () => 'provider-1',
      label: 'model-a',
      callApi: vi.fn().mockResolvedValue({
        output: 'Output from model-a',
        tokenUsage: { total: 5, prompt: 2, completion: 3, cached: 0, numRequests: 1 },
      }),
    };

    const provider2: ApiProvider = {
      id: () => 'provider-2',
      label: 'model-b',
      callApi: vi.fn().mockResolvedValue({
        output: 'Output from model-b',
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
      }),
    };

    const testSuite: TestSuite = {
      providers: [provider1, provider2],
      prompts: [
        { raw: 'Prompt X', label: 'promptX' },
        { raw: 'Prompt Y', label: 'promptY' },
      ],
      tests: [
        {
          vars: { input: 'test' },
          prompts: ['promptY'], // Only run with Prompt Y, skip Prompt X
        },
      ],
    };

    // prompts array: [model-a+promptX(0), model-a+promptY(1), model-b+promptX(2), model-b+promptY(3)]
    // With prompt filter, only promptY runs, so promptIdx should be 1 and 3 (not 0 and 1)
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(summary.stats.successes).toBe(2);
    expect(provider1.callApi).toHaveBeenCalledTimes(1);
    expect(provider2.callApi).toHaveBeenCalledTimes(1);

    // Verify promptIdx values map to the correct prompt entries (odd indices for promptY)
    const results = summary.results.sort((a, b) => a.promptIdx - b.promptIdx);
    expect(results).toHaveLength(2);
    // promptIdx should be 1 (model-a+promptY) and 3 (model-b+promptY)
    expect(results[0].promptIdx).toBe(1);
    expect(results[1].promptIdx).toBe(3);
  });
});
