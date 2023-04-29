import { evaluate } from '../src/evaluator.js';

import type { ApiProvider } from '../src/types.js';

const mockApiProvider: ApiProvider = {
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
      prompts: ['Test prompt'],
      vars: [{ var1: 'value1', var2: 'value2' }],
    };

    const result = await evaluate(options, mockApiProvider);

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
    expect(result.stats.successes).toBe(1);
    expect(result.stats.failures).toBe(0);
    expect(result.stats.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5 });
  });

  test('evaluate without vars', async () => {
    const options = {
      prompts: ['Test prompt'],
    };

    const result = await evaluate(options, mockApiProvider);

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
    expect(result.stats.successes).toBe(1);
    expect(result.stats.failures).toBe(0);
    expect(result.stats.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5 });
  });
});
