import * as fs from 'fs';
import { evaluate } from '../src/evaluator.js';
import { ApiProvider } from '../src/types.js';

jest.mock('fs', () => ({
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
}));

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
    (fs.readFileSync as jest.Mock)
      .mockReturnValueOnce('Test prompt')
      .mockReturnValueOnce('var1,var2\nvalue1,value2');

    const options = {
      prompts: ['prompt1.txt'],
      output: 'output.csv',
      provider: 'openai:completion:text-davinci-003',
      vars: 'vars.csv',
    };

    const result = await evaluate(options, mockApiProvider);

    expect(fs.readFileSync).toHaveBeenCalledTimes(2);
    expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
    expect(result.successes).toBe(1);
    expect(result.failures).toBe(0);
    expect(result.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5 });
  });

  test('evaluate without vars', async () => {
    (fs.readFileSync as jest.Mock).mockReturnValueOnce('Test prompt');

    const options = {
      prompts: ['prompt1.txt'],
      output: 'output.csv',
      provider: 'openai:completion:text-davinci-003',
    };

    const result = await evaluate(options, mockApiProvider);

    expect(fs.readFileSync).toHaveBeenCalledTimes(1);
    expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
    expect(result.successes).toBe(1);
    expect(result.failures).toBe(0);
    expect(result.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5 });
  });

  test('evaluate with multiple prompts', async () => {
    (fs.readFileSync as jest.Mock)
      .mockReturnValueOnce('Test prompt 1')
      .mockReturnValueOnce('Test prompt 2')
      .mockReturnValueOnce('var1,var2\nvalue1,value2');

    const options = {
      prompts: ['prompt1.txt', 'prompt2.txt'],
      output: 'output.csv',
      provider: 'openai:completion:text-davinci-003',
      vars: 'vars.csv',
    };

    const result = await evaluate(options, mockApiProvider);

    expect(fs.readFileSync).toHaveBeenCalledTimes(3);
    expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(2);
    expect(result.successes).toBe(2);
    expect(result.failures).toBe(0);
    expect(result.tokenUsage).toEqual({ total: 20, prompt: 10, completion: 10 });
  });
});
