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

    const result = await evaluate(options);

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
    expect(result.stats.successes).toBe(1);
    expect(result.stats.failures).toBe(0);
    expect(result.stats.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5 });
    expect(result.results[0].prompt).toBe('Test prompt {{ var1 }} {{ var2 }}');
    expect(result.results[0].output).toBe('Test output');
  });

  test('evaluate with multiple providers', async () => {
    const options = {
      prompts: ['Test prompt {{ var1 }} {{ var2 }}'],
      vars: [{ var1: 'value1', var2: 'value2' }],
      providers: [mockApiProvider, mockApiProvider],
    };

    const result = await evaluate(options);

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(2);
    expect(result.stats.successes).toBe(2);
    expect(result.stats.failures).toBe(0);
    expect(result.stats.tokenUsage).toEqual({ total: 20, prompt: 10, completion: 10 });
    expect(result.results[0].prompt).toBe('[test-provider] Test prompt {{ var1 }} {{ var2 }}');
    expect(result.results[0].output).toBe('Test output');
  });

  test('evaluate without vars', async () => {
    const options = {
      prompts: ['Test prompt'],
      providers: [mockApiProvider],
    };

    const result = await evaluate(options);

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
    expect(result.stats.successes).toBe(1);
    expect(result.stats.failures).toBe(0);
    expect(result.stats.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5 });
    expect(result.results[0].prompt).toBe('Test prompt');
    expect(result.results[0].output).toBe('Test output');
  });
});
