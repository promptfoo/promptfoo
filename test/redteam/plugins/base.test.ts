import PluginBase, { retryWithDeduplication } from '../../../src/redteam/plugins/base';
import { ApiProvider, Assertion } from '../../../src/types';
import { getNunjucksEngine } from '../../../src/util/templates';

class TestPlugin extends PluginBase {
  protected template = 'Test template with {{ purpose }} for {{ n }} prompts';
  protected getAssertions(prompt: string): Assertion[] {
    return [{ type: 'contains', value: prompt }];
  }
}

describe('PluginBase', () => {
  let provider: ApiProvider;
  let plugin: PluginBase;

  beforeEach(() => {
    provider = {
      callApi: jest.fn().mockResolvedValue({
        output: 'Prompt: test prompt\nPrompt: another prompt\nirrelevant line',
      }),
      id: jest.fn().mockReturnValue('test-provider'),
    };
    plugin = new TestPlugin(provider, 'test purpose', 'testVar');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should generate test cases correctly', async () => {
    expect.assertions(2);
    await expect(plugin.generateTests(2)).resolves.toEqual([
      {
        vars: { testVar: 'another prompt' },
        assert: [{ type: 'contains', value: 'another prompt' }],
      },
      {
        vars: { testVar: 'test prompt' },
        assert: [{ type: 'contains', value: 'test prompt' }],
      },
    ]);
    expect(provider.callApi).toHaveBeenCalledWith(
      getNunjucksEngine().renderString('Test template with {{ purpose }} for {{ n }} prompts', {
        purpose: 'test purpose',
        n: 2,
      }),
    );
  });

  it('should throw an error if generatedPrompts is not a string', async () => {
    expect.assertions(1);
    jest.mocked(provider.callApi).mockResolvedValue({ output: 123 });

    await expect(plugin.generateTests(2)).rejects.toThrow(
      'Expected generatedPrompts to be a string',
    );
  });

  it('should filter and process prompts correctly', async () => {
    expect.assertions(1);
    await expect(plugin.generateTests(2)).resolves.toEqual([
      {
        assert: [{ type: 'contains', value: 'another prompt' }],
        vars: { testVar: 'another prompt' },
      },
      { assert: [{ type: 'contains', value: 'test prompt' }], vars: { testVar: 'test prompt' } },
    ]);
  });

  it('should handle batching when requesting more than 20 tests', async () => {
    const largeBatchSize = 25;
    const mockResponses = [
      {
        output: Array(20)
          .fill(0)
          .map((_, i) => `Prompt: test prompt ${i}`)
          .join('\n'),
      },
      {
        output: Array(5)
          .fill(0)
          .map((_, i) => `Prompt: test prompt ${i + 20}`)
          .join('\n'),
      },
    ];

    jest
      .spyOn(provider, 'callApi')
      .mockImplementation()
      .mockResolvedValueOnce(mockResponses[0])
      .mockResolvedValueOnce(mockResponses[1]);

    const result = await plugin.generateTests(largeBatchSize);

    expect(result).toHaveLength(largeBatchSize);
    expect(provider.callApi).toHaveBeenCalledTimes(2);
    expect(provider.callApi).toHaveBeenNthCalledWith(1, expect.stringContaining('for 20 prompts'));
    expect(provider.callApi).toHaveBeenNthCalledWith(2, expect.stringContaining('for 5 prompts'));
  });

  it('should deduplicate prompts', async () => {
    jest
      .spyOn(provider, 'callApi')
      .mockImplementation()
      .mockResolvedValueOnce({
        output: 'Prompt: duplicate\nPrompt: duplicate',
      })
      .mockResolvedValueOnce({
        output: 'Prompt: unique',
      });

    const result = await plugin.generateTests(2);

    expect(result).toEqual([
      { vars: { testVar: 'duplicate' }, assert: expect.any(Array) },
      { vars: { testVar: 'unique' }, assert: expect.any(Array) },
    ]);
    expect(provider.callApi).toHaveBeenCalledTimes(2);
  });

  it('should retry when not enough unique prompts are generated', async () => {
    const mockResponses = [
      { output: 'Prompt: test1\nPrompt: test2' },
      { output: 'Prompt: test2\nPrompt: test3' },
      { output: 'Prompt: test4' },
    ];

    jest
      .spyOn(provider, 'callApi')
      .mockImplementation()
      .mockResolvedValueOnce(mockResponses[0])
      .mockResolvedValueOnce(mockResponses[1])
      .mockResolvedValueOnce(mockResponses[2]);

    const result = await plugin.generateTests(4);

    expect(result).toHaveLength(4);
    expect(provider.callApi).toHaveBeenCalledTimes(3);
  });

  it('should bail after 2 retries if no new prompts are generated', async () => {
    const mockResponse = { output: 'Prompt: test1\nPrompt: test2' };

    jest.spyOn(provider, 'callApi').mockImplementation().mockResolvedValue(mockResponse);

    const result = await plugin.generateTests(5);

    expect(result).toHaveLength(2);
    expect(provider.callApi).toHaveBeenCalledTimes(4);
  });

  it('should sample prompts when more are generated than requested', async () => {
    jest
      .spyOn(provider, 'callApi')
      .mockImplementation()
      .mockResolvedValue({
        output: Array(10)
          .fill(0)
          .map((_, i) => `Prompt: test prompt ${i}`)
          .join('\n'),
      });

    const result = await plugin.generateTests(5);

    expect(result).toEqual(
      expect.objectContaining({
        length: 5,
        [Symbol.iterator]: expect.any(Function),
      }),
    );
    expect(new Set(result.map((r) => r.vars?.testVar)).size).toBe(5);
  });
});

describe('retryWithDeduplication', () => {
  it('should collect unique items until target count is reached', async () => {
    const operation = jest
      .fn()
      .mockResolvedValueOnce([1, 2, 3])
      .mockResolvedValueOnce([3, 4, 5])
      .mockResolvedValueOnce([5, 6, 7]);

    const result = await retryWithDeduplication(operation, 5);

    expect(result).toEqual([1, 2, 3, 4, 5]);
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('should stop after max consecutive retries', async () => {
    const operation = jest
      .fn()
      .mockResolvedValueOnce([1, 2])
      .mockResolvedValueOnce([1, 2])
      .mockResolvedValueOnce([1, 2]);

    const result = await retryWithDeduplication(operation, 5, 2);

    expect(result).toEqual([1, 2]);
    expect(operation).toHaveBeenCalledTimes(4);
  });

  it('should use custom deduplication function', async () => {
    const operation = jest
      .fn()
      .mockResolvedValueOnce([{ id: 1 }, { id: 2 }])
      .mockResolvedValueOnce([{ id: 2 }, { id: 3 }]);

    const customDedupFn = (items: { id: number }[]) =>
      Array.from(new Set(items.map((item) => item.id))).map((id) => ({ id }));

    const result = await retryWithDeduplication(operation, 3, 2, customDedupFn);

    expect(result).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('should handle empty results from operation', async () => {
    const operation = jest
      .fn()
      .mockResolvedValueOnce([1, 2])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([3]);

    const result = await retryWithDeduplication(operation, 3);

    expect(result).toEqual([1, 2, 3]);
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('should return all unique items even if target count is not reached', async () => {
    const operation = jest
      .fn()
      .mockResolvedValueOnce([1, 2])
      .mockResolvedValueOnce([2, 3])
      .mockResolvedValueOnce([3, 4]);

    const result = await retryWithDeduplication(operation, 10, 2);

    expect(result).toEqual([1, 2, 3, 4]);
    expect(operation).toHaveBeenCalledTimes(6);
  });
});
