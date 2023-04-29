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
      .mockReturnValueOnce('var1,var2\nvalue1,value2')
      .mockReturnValueOnce('Test prompt')

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
      .mockReturnValueOnce('var1,var2\nvalue1,value2')
      .mockReturnValueOnce('Test prompt 1')
      .mockReturnValueOnce('Test prompt 2')

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

  test('evaluate with single file containing multiple prompts', async () => {
    (fs.readFileSync as jest.Mock)
    .mockReturnValueOnce('var1,var2\nvalue1,value2')
    .mockReturnValueOnce('Test prompt 1\n---\nTest prompt 2')

    const options = {
      prompts: ['prompt1.txt'],
      output: 'output.csv',
      provider: 'openai:completion:text-davinci-003',
      vars: 'vars.csv',
    };

    const result = await evaluate(options, mockApiProvider);

    expect(fs.readFileSync).toHaveBeenCalledTimes(2);
    expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(2);
    expect(result.successes).toBe(2);
    expect(result.failures).toBe(0);
    expect(result.tokenUsage).toEqual({ total: 20, prompt: 10, completion: 10 });
  });

  test('evaluate with JSON input', async () => {
    (fs.readFileSync as jest.Mock)
    .mockReturnValueOnce('[{"var1": "value1", "var2": "value2"}]')
    .mockReturnValueOnce('Test prompt')

    const options = {
      prompts: ['prompt1.txt'],
      output: 'output.json',
      provider: 'openai:completion:text-davinci-003',
      vars: 'vars.json',
    };

    const result = await evaluate(options, mockApiProvider);

    expect(fs.readFileSync).toHaveBeenCalledTimes(2);
    expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
    expect(result.successes).toBe(1);
    expect(result.failures).toBe(0);
    expect(result.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5 });
  });

  test('evaluate with YAML input', async () => {
    (fs.readFileSync as jest.Mock)
    .mockReturnValueOnce('- var1: value1\n  var2: value2')
    .mockReturnValueOnce('Test prompt');

    const options = {
      prompts: ['prompt1.txt'],
      output: 'output.yaml',
      provider: 'openai:completion:text-davinci-003',
      vars: 'vars.yaml',
    };

    const result = await evaluate(options, mockApiProvider);

    expect(fs.readFileSync).toHaveBeenCalledTimes(2);
    expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
    expect(result.successes).toBe(1);
    expect(result.failures).toBe(0);
    expect(result.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5 });
  });
});
