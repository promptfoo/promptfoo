import dedent from 'dedent';
import { matchesLlmRubric } from '../../../src/matchers';
import { PluginBase } from '../../../src/redteam/plugins/base';
import { RedteamModelGrader } from '../../../src/redteam/plugins/base';
import type { ApiProvider, Assertion } from '../../../src/types';
import type { AtomicTestCase, GradingResult } from '../../../src/types';
import { maybeLoadFromExternalFile } from '../../../src/util';

jest.mock('../../../src/matchers', () => ({
  matchesLlmRubric: jest.fn(),
}));

jest.mock('../../../src/util', () => ({
  maybeLoadFromExternalFile: jest.fn(),
}));

class TestPlugin extends PluginBase {
  protected async getTemplate(): Promise<string> {
    return 'Test template with {{ purpose }} for {{ n }} prompts';
  }
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
    plugin = new TestPlugin(provider, 'test purpose', 'testVar', { language: 'German' });
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
      dedent`
        Test template with test purpose for 2 prompts

        CRITICAL: Ensure all generated prompts strictly follow these requirements:
        <Modifiers>
        language: German
        </Modifiers>
        Rewrite ALL prompts to fully comply with the above modifiers.
      `.trim(),
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

class TestGrader extends RedteamModelGrader {
  id = 'test-grader';
  rubric = 'Test rubric for {{ purpose }} with harm category {{ harmCategory }}';
}

describe('RedteamModelGrader', () => {
  let grader: TestGrader;
  let mockTest: AtomicTestCase;

  beforeEach(() => {
    grader = new TestGrader();
    mockTest = {
      metadata: { purpose: 'test-purpose', harmCategory: 'test-harm' },
    } as AtomicTestCase;
    jest.clearAllMocks();
  });

  it('should throw an error if test is missing purpose metadata', async () => {
    const testWithoutPurpose = { ...mockTest, metadata: {} };
    await expect(
      grader.getResult('prompt', 'output', testWithoutPurpose, undefined /* provider */),
    ).rejects.toThrow('Test is missing purpose metadata');
  });

  it('should render the rubric with correct variables', async () => {
    const mockResult: GradingResult = {
      pass: true,
      score: 1,
      reason: 'Test passed',
    };
    jest.mocked(matchesLlmRubric).mockResolvedValue(mockResult);

    await grader.getResult('test prompt', 'test output', mockTest, undefined /* provider */);

    expect(matchesLlmRubric).toHaveBeenCalledWith(
      'Test rubric for test-purpose with harm category test-harm',
      'test output',
      {},
    );
  });

  it('should return the result from matchesLlmRubric', async () => {
    const mockResult: GradingResult = {
      pass: true,
      score: 1,
      reason: 'Test passed',
    };
    jest.mocked(matchesLlmRubric).mockResolvedValue(mockResult);

    const result = await grader.getResult(
      'test prompt',
      'test output',
      mockTest,
      undefined /* provider */,
    );

    expect(result).toEqual({
      grade: mockResult,
      rubric: 'Test rubric for test-purpose with harm category test-harm',
    });
  });

  describe('RedteamModelGrader with tools', () => {
    let toolProvider: any;
    let maybeLoadFromExternalFileSpy: jest.SpyInstance;
    let ToolGrader: any;

    beforeEach(() => {
      toolProvider = {
        config: {
          tools: 'file://tools.json',
        },
      };

      maybeLoadFromExternalFileSpy = jest
        .mocked(maybeLoadFromExternalFile)
        .mockImplementation((input) => {
          if (input === 'file://tools.json') {
            return [{ name: 'tool1' }, { name: 'tool2' }];
          }
          return input;
        });

      ToolGrader = class extends RedteamModelGrader {
        id = 'test-tool-grader';
        rubric = 'Test rubric for {{ tools | dump }}';
      };
    });

    afterEach(() => {
      maybeLoadFromExternalFileSpy.mockRestore();
    });

    it('should handle tools from provider config', async () => {
      const mockResult: GradingResult = {
        pass: true,
        score: 1,
        reason: 'Test passed',
      };
      jest.mocked(matchesLlmRubric).mockResolvedValue(mockResult);

      const toolGrader = new ToolGrader();
      await toolGrader.getResult('test prompt', 'test output', mockTest, toolProvider);

      expect(matchesLlmRubric).toHaveBeenCalledWith(
        expect.stringContaining('tool1'),
        expect.any(String),
        {},
      );
      expect(matchesLlmRubric).toHaveBeenCalledWith(
        expect.stringContaining('tool2'),
        expect.any(String),
        {},
      );
    });

    it('should handle when no tools are provided', async () => {
      const mockResult: GradingResult = {
        pass: true,
        score: 1,
        reason: 'Test passed',
      };
      jest.mocked(matchesLlmRubric).mockResolvedValue(mockResult);

      const toolGrader = new ToolGrader();

      await expect(
        toolGrader.getResult('test prompt', 'test output', mockTest, undefined),
      ).rejects.toThrow(/^Error rendering rubric template/);

      expect(matchesLlmRubric).not.toHaveBeenCalled();
    });
  });
});
