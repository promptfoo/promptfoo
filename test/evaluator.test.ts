import { evaluate } from '../src/evaluator.js';

import type { ApiProvider } from '../src/types.js';

const mockApiProvider: ApiProvider = {
  id: jest.fn().mockReturnValue('test-provider'),
  callApi: jest.fn().mockResolvedValue({
    output: 'Test output',
    tokenUsage: { total: 10, prompt: 5, completion: 5 },
  }),
};

describe('evaluator', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('evaluate with vars', async () => {
    const options = {
      prompts: ['Test prompt {{ var1 }} {{ var2 }}'],
      vars: [{ var1: 'value1', var2: 'value2' }],
      providers: [mockApiProvider],
    };

    const summary = await evaluate(options);

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
    expect(summary.stats.successes).toBe(1);
    expect(summary.stats.failures).toBe(0);
    expect(summary.stats.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5 });
    expect(summary.results[0].prompt.raw).toBe('Test prompt value1 value2');
    expect(summary.results[0].prompt.display).toBe('Test prompt {{ var1 }} {{ var2 }}');
    expect(summary.results[0].response?.output).toBe('Test output');
  });

  test('evaluate with multiple providers', async () => {
    const options = {
      prompts: ['Test prompt {{ var1 }} {{ var2 }}'],
      vars: [{ var1: 'value1', var2: 'value2' }],
      providers: [mockApiProvider, mockApiProvider],
    };

    const summary = await evaluate(options);

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(2);
    expect(summary.stats.successes).toBe(2);
    expect(summary.stats.failures).toBe(0);
    expect(summary.stats.tokenUsage).toEqual({ total: 20, prompt: 10, completion: 10 });
    expect(summary.results[0].prompt.raw).toBe('Test prompt value1 value2');
    expect(summary.results[0].prompt.display).toBe(
      '[test-provider] Test prompt {{ var1 }} {{ var2 }}',
    );
    expect(summary.results[0].response?.output).toBe('Test output');
  });

  test('evaluate without vars', async () => {
    const options = {
      prompts: ['Test prompt'],
      providers: [mockApiProvider],
    };

    const summary = await evaluate(options);

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
    expect(summary.stats.successes).toBe(1);
    expect(summary.stats.failures).toBe(0);
    expect(summary.stats.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5 });
    expect(summary.results[0].prompt.raw).toBe('Test prompt');
    expect(summary.results[0].prompt.display).toBe('Test prompt');
    expect(summary.results[0].response?.output).toBe('Test output');
  });

  test('evaluate without vars with multiple providers', async () => {
    const options = {
      prompts: ['Test prompt'],
      providers: [mockApiProvider, mockApiProvider, mockApiProvider],
    };

    const summary = await evaluate(options);

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(3);
    expect(summary.stats.successes).toBe(3);
    expect(summary.stats.failures).toBe(0);
    expect(summary.stats.tokenUsage).toEqual({ total: 30, prompt: 15, completion: 15 });
    expect(summary.results[0].prompt.raw).toBe('Test prompt');
    expect(summary.results[0].prompt.display).toBe('[test-provider] Test prompt');
    expect(summary.results[0].response?.output).toBe('Test output');
  });
});
