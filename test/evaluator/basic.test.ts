import './setup';

import { randomUUID } from 'crypto';
import fs from 'fs';

import { expect, it, vi } from 'vitest';
import { evaluate } from '../../src/evaluator';
import Eval from '../../src/models/eval';
import { type TestSuite } from '../../src/types/index';
import { processConfigFileReferences } from '../../src/util/fileReference';
import { mockApiProvider, mockReasoningApiProvider, toPrompt } from './helpers';
import { describeEvaluator } from './lifecycle';

describeEvaluator('evaluator basic flows', () => {
  it('evaluate with vars', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt {{ var1 }} {{ var2 }}')],
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
    expect(mockApiProvider.callApi).toHaveBeenCalledWith(
      'Test prompt value1 value2',
      expect.objectContaining({
        vars: { var1: 'value1', var2: 'value2' },
        test: testSuite.tests![0],
        prompt: expect.any(Object),
      }),
      undefined,
    );
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
    expect(summary.results[0].prompt.raw).toBe('Test prompt value1 value2');
    expect(summary.results[0].prompt.label).toBe('Test prompt {{ var1 }} {{ var2 }}');
    expect(summary.results[0].response?.output).toBe('Test output');
  });

  it('evaluate with vars - no escaping', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt {{ var1 }} {{ var2 }}')],
      tests: [
        {
          vars: { var1: '1 < 2', var2: 'he said "hello world"...' },
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
    expect(summary.results[0].prompt.raw).toBe('Test prompt 1 < 2 he said "hello world"...');
    expect(summary.results[0].prompt.label).toBe('Test prompt {{ var1 }} {{ var2 }}');
    expect(summary.results[0].response?.output).toBe('Test output');
  });

  it('evaluate with vars as object', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt {{ var1.prop1 }} {{ var2 }}')],
      tests: [
        {
          vars: { var1: { prop1: 'value1' }, var2: 'value2' },
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
    expect(summary.results[0].prompt.raw).toBe('Test prompt value1 value2');
    expect(summary.results[0].prompt.label).toBe('Test prompt {{ var1.prop1 }} {{ var2 }}');
    expect(summary.results[0].response?.output).toBe('Test output');
  });

  it('evaluate with vars from file', async () => {
    const originalReadFileSync = fs.readFileSync;
    vi.spyOn(fs, 'readFileSync').mockImplementation((path) => {
      if (typeof path === 'string' && path.includes('test_file.txt')) {
        return '<h1>Sample Report</h1><p>This is a test report with some data for the year 2023.</p>';
      }
      return originalReadFileSync(path);
    });

    const evalHelpers = await import('../../src/evaluatorHelpers');
    const originalRenderPrompt = evalHelpers.renderPrompt;

    const mockRenderPrompt = vi.spyOn(evalHelpers, 'renderPrompt');
    mockRenderPrompt.mockImplementation(async (prompt, vars) => {
      if (prompt.raw.includes('{{ var1 }}')) {
        return 'Test prompt <h1>Sample Report</h1><p>This is a test report with some data for the year 2023.</p>';
      }
      return originalRenderPrompt(prompt, vars);
    });

    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt {{ var1 }}')],
      tests: [
        {
          vars: { var1: 'file://test/fixtures/test_file.txt' },
        },
      ],
    };

    try {
      const processedTestSuite = await processConfigFileReferences(testSuite);
      const evalRecord = await Eval.create({}, processedTestSuite.prompts, { id: randomUUID() });
      await evaluate(processedTestSuite, evalRecord, {});
      const summary = await evalRecord.toEvaluateSummary();

      expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
      expect(mockApiProvider.callApi).toHaveBeenCalledWith(
        'Test prompt <h1>Sample Report</h1><p>This is a test report with some data for the year 2023.</p>',
        expect.anything(),
        undefined,
      );

      expect(summary.stats.successes).toBe(1);
      expect(summary.stats.failures).toBe(0);
      expect(summary.results[0].prompt.raw).toBe(
        'Test prompt <h1>Sample Report</h1><p>This is a test report with some data for the year 2023.</p>',
      );
      expect(summary.results[0].prompt.label).toBe('Test prompt {{ var1 }}');
      expect(summary.results[0].response?.output).toBe('Test output');
    } finally {
      mockRenderPrompt.mockRestore();
      fs.readFileSync = originalReadFileSync;
    }
  });

  it('evaluate with named prompt', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [{ raw: 'Test prompt {{ var1 }} {{ var2 }}', label: 'test display name' }],
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
    expect(summary.results[0].prompt.raw).toBe('Test prompt value1 value2');
    expect(summary.results[0].prompt.label).toBe('test display name');
    expect(summary.results[0].response?.output).toBe('Test output');
  });

  it('evaluate with multiple vars', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt {{ var1 }} {{ var2 }}')],
      tests: [
        {
          vars: { var1: ['value1', 'value3'], var2: ['value2', 'value4'] },
        },
      ],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(4);
    expect(summary.stats.successes).toBe(4);
    expect(summary.stats.failures).toBe(0);
    expect(summary.stats.tokenUsage).toEqual({
      total: 40,
      prompt: 20,
      completion: 20,
      cached: 0,
      numRequests: 4,
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
    expect(summary.results[0].prompt.raw).toBe('Test prompt value1 value2');
    expect(summary.results[0].prompt.label).toBe('Test prompt {{ var1 }} {{ var2 }}');
    expect(summary.results[0].response?.output).toBe('Test output');
  });

  it('evaluate with multiple providers', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider, mockApiProvider],
      prompts: [toPrompt('Test prompt {{ var1 }} {{ var2 }}')],
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
    expect(summary.stats.successes).toBe(2);
    expect(summary.stats.failures).toBe(0);
    expect(summary.stats.tokenUsage).toEqual({
      total: 20,
      prompt: 10,
      completion: 10,
      cached: 0,
      numRequests: 2,
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
    expect(summary.results[0].prompt.raw).toBe('Test prompt value1 value2');
    expect(summary.results[0].prompt.label).toBe('Test prompt {{ var1 }} {{ var2 }}');
    expect(summary.results[0].response?.output).toBe('Test output');
  });

  it('evaluate without tests', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
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
    expect(summary.results[0].prompt.raw).toBe('Test prompt');
    expect(summary.results[0].prompt.label).toBe('Test prompt');
    expect(summary.results[0].response?.output).toBe('Test output');
  });

  it('evaluate without tests with multiple providers', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider, mockApiProvider, mockApiProvider],
      prompts: [toPrompt('Test prompt')],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(3);
    expect(summary.stats.successes).toBe(3);
    expect(summary.stats.failures).toBe(0);
    expect(summary.stats.tokenUsage).toEqual({
      total: 30,
      prompt: 15,
      completion: 15,
      cached: 0,
      numRequests: 3,
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
    expect(summary.results[0].prompt.raw).toBe('Test prompt');
    expect(summary.results[0].prompt.label).toBe('Test prompt');
    expect(summary.results[0].response?.output).toBe('Test output');
  });

  it('evaluate for reasoning', async () => {
    const testSuite: TestSuite = {
      providers: [mockReasoningApiProvider],
      prompts: [toPrompt('Test prompt')],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(mockReasoningApiProvider.callApi).toHaveBeenCalledTimes(1);
    expect(summary.stats.successes).toBe(1);
    expect(summary.stats.failures).toBe(0);
    expect(summary.stats.tokenUsage).toEqual({
      total: 21,
      prompt: 9,
      completion: 12,
      cached: 0,
      numRequests: 1,
      completionDetails: {
        reasoning: 11,
        acceptedPrediction: 12,
        rejectedPrediction: 13,
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
    expect(summary.results[0].prompt.raw).toBe('Test prompt');
    expect(summary.results[0].prompt.label).toBe('Test prompt');
    expect(summary.results[0].response?.output).toBe('Test output');
  });
});
