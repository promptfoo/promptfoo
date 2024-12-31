import dedent from 'dedent';
import { matchesLlmRubric } from '../../../src/matchers';
import {
  parseGeneratedPrompts,
  RedteamGraderBase,
  RedteamPluginBase,
} from '../../../src/redteam/plugins/base';
import type { ApiProvider, Assertion } from '../../../src/types';
import type { AtomicTestCase, GradingResult } from '../../../src/types';
import { maybeLoadFromExternalFile } from '../../../src/util';

jest.mock('../../../src/matchers', () => ({
  matchesLlmRubric: jest.fn(),
}));

jest.mock('../../../src/util', () => ({
  maybeLoadFromExternalFile: jest.fn(),
}));

class TestPlugin extends RedteamPluginBase {
  protected async getTemplate(): Promise<string> {
    return 'Test template with {{ purpose }} for {{ n }} prompts';
  }
  protected getAssertions(prompt: string): Assertion[] {
    return [{ type: 'contains', value: prompt }];
  }
}

describe('RedteamPluginBase', () => {
  let provider: ApiProvider;
  let plugin: RedteamPluginBase;

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
    expect.assertions(3);
    const tests = await plugin.generateTests(2);
    expect(tests).toEqual(
      expect.arrayContaining([
        {
          vars: { testVar: 'another prompt' },
          assert: [{ type: 'contains', value: 'another prompt' }],
        },
        {
          vars: { testVar: 'test prompt' },
          assert: [{ type: 'contains', value: 'test prompt' }],
        },
      ]),
    );
    expect(tests).toHaveLength(2);
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

  it('should filter and process prompts correctly', async () => {
    expect.assertions(1);
    const tests = await plugin.generateTests(2);
    expect(tests).toEqual(
      expect.arrayContaining([
        {
          assert: [{ type: 'contains', value: 'another prompt' }],
          vars: { testVar: 'another prompt' },
        },
        { assert: [{ type: 'contains', value: 'test prompt' }], vars: { testVar: 'test prompt' } },
      ]),
    );
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

    expect(result).toEqual(
      expect.arrayContaining([
        { vars: { testVar: 'duplicate' }, assert: expect.any(Array) },
        { vars: { testVar: 'unique' }, assert: expect.any(Array) },
      ]),
    );
    expect(result).toHaveLength(2);
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

  describe('appendModifiers', () => {
    it('should not append modifiers when all modifier values are undefined or empty strings', async () => {
      const plugin = new TestPlugin(provider, 'test purpose', 'testVar', {
        modifiers: {
          modifier1: undefined as any,
          modifier2: '',
        },
      });
      await plugin.generateTests(1);
      expect(provider.callApi).toHaveBeenCalledWith(expect.not.stringContaining('<Modifiers>'));
      expect(provider.callApi).toHaveBeenCalledWith(expect.not.stringContaining('modifier1'));
      expect(provider.callApi).toHaveBeenCalledWith(expect.not.stringContaining('modifier2'));
    });

    it('should append modifiers when at least one modifier has a non-empty value', async () => {
      const plugin = new TestPlugin(provider, 'test purpose', 'testVar', {
        modifiers: {
          modifier1: undefined as any,
          modifier2: 'value2',
        },
      });

      await plugin.generateTests(1);
      expect(provider.callApi).toHaveBeenCalledWith(expect.stringContaining('<Modifiers>'));
      expect(provider.callApi).toHaveBeenCalledWith(expect.not.stringContaining('modifier1'));
      expect(provider.callApi).toHaveBeenCalledWith(expect.stringContaining('modifier2: value2'));
    });

    it('should append language modifier', async () => {
      const plugin = new TestPlugin(provider, 'test purpose', 'testVar', {
        language: 'German',
      });

      await plugin.generateTests(1);
      expect(provider.callApi).toHaveBeenCalledWith(expect.stringContaining('<Modifiers>'));
      expect(provider.callApi).toHaveBeenCalledWith(expect.stringContaining('language: German'));
    });
  });

  describe('parseGeneratedPrompts', () => {
    it('should parse simple prompts correctly', () => {
      const input = 'Prompt: Hello world\nPrompt: How are you?';
      const result = parseGeneratedPrompts(input);
      expect(result).toEqual([{ prompt: 'Hello world' }, { prompt: 'How are you?' }]);
    });

    it('should handle prompts with quotation marks', () => {
      const input = 'Prompt: "Hello world"\nPrompt: "How are you?"';
      const result = parseGeneratedPrompts(input);
      expect(result).toEqual([{ prompt: 'Hello world' }, { prompt: 'How are you?' }]);
    });

    it('should ignore lines without "Prompt:"', () => {
      const input = 'Prompt: Valid prompt\nInvalid line\nPrompt: Another valid prompt';
      const result = parseGeneratedPrompts(input);
      expect(result).toEqual([{ prompt: 'Valid prompt' }, { prompt: 'Another valid prompt' }]);
    });

    it('should handle prompts with numbers', () => {
      const input = 'Prompt: 1. First prompt\nPrompt: 2. Second prompt';
      const result = parseGeneratedPrompts(input);
      expect(result).toEqual([{ prompt: 'First prompt' }, { prompt: 'Second prompt' }]);
    });

    it('should handle prompts with colons', () => {
      const input = 'Prompt: Hello: World\nPrompt: Question: How are you?';
      const result = parseGeneratedPrompts(input);
      expect(result).toEqual([{ prompt: 'Hello: World' }, { prompt: 'Question: How are you?' }]);
    });

    it('should handle empty input', () => {
      const input = '';
      const result = parseGeneratedPrompts(input);
      expect(result).toEqual([]);
    });

    it('should handle input with only invalid lines', () => {
      const input = 'Invalid line 1\nInvalid line 2';
      const result = parseGeneratedPrompts(input);
      expect(result).toEqual([]);
    });

    it('should trim whitespace from prompts', () => {
      const input = 'Prompt:    Whitespace at start and end    \nPrompt:\tTabbed prompt\t';
      const result = parseGeneratedPrompts(input);
      expect(result).toEqual([
        { prompt: 'Whitespace at start and end' },
        { prompt: 'Tabbed prompt' },
      ]);
    });

    it('should handle prompts with multiple lines', () => {
      const input = 'Prompt: First line\nSecond line\nPrompt: Another prompt';
      const result = parseGeneratedPrompts(input);
      expect(result).toEqual([{ prompt: 'First line' }, { prompt: 'Another prompt' }]);
    });

    it('should handle numbered lists with various formats', () => {
      const input = `
        Prompt: 1. First item
        Prompt: 2) Second item
        Prompt: 3 - Third item
        Prompt: 4. Fourth item with: colon
        Prompt: 5) Fifth item with "quotes"
        6. Prompt: Sixth item
        7) Prompt: Seventh item
      `;
      const result = parseGeneratedPrompts(input);
      expect(result).toEqual([
        { prompt: 'First item' },
        { prompt: 'Second item' },
        { prompt: 'Third item' },
        { prompt: 'Fourth item with: colon' },
        { prompt: 'Fifth item with "quotes"' },
        { prompt: 'Sixth item' },
        { prompt: 'Seventh item' },
      ]);
    });

    it('should handle prompts with nested quotes', () => {
      const input = `
        Prompt: Outer "inner \"nested\" quote" 
        Prompt: Outer 'inner \'nested\' quote'
        Prompt: 'Single quoted "double nested" prompt'
        Prompt: "Double quoted 'single nested' prompt"
      `;
      const result = parseGeneratedPrompts(input);
      expect(result).toEqual([
        { prompt: 'Outer "inner "nested" quote"' },
        { prompt: "Outer 'inner 'nested' quote'" },
        { prompt: 'Single quoted "double nested" prompt' },
        { prompt: "Double quoted 'single nested' prompt" },
      ]);
    });

    it('should handle prompts with multiple spaces between words', () => {
      const input = 'Prompt: Multiple    spaces    between    words';
      const result = parseGeneratedPrompts(input);
      expect(result).toEqual([{ prompt: 'Multiple    spaces    between    words' }]);
    });

    it('should handle a mix of valid and invalid prompts', () => {
      const input = `
        Invalid line
        Prompt: Valid prompt 1
        Another invalid line
        Prompt: Valid prompt 2
        Prompt without colon
        Prompt: Valid prompt 3
      `;
      const result = parseGeneratedPrompts(input);
      expect(result).toEqual([
        { prompt: 'Valid prompt 1' },
        { prompt: 'Valid prompt 2' },
        { prompt: 'Valid prompt 3' },
      ]);
    });

    it('should strip leading and trailing asterisks but leave ones in the middle', () => {
      const input = 'Prompt: ** Leading asterisk\nPrompt: Trailing * middle * asterisk *';
      const result = parseGeneratedPrompts(input);
      expect(result).toEqual([
        { prompt: 'Leading asterisk' },
        { prompt: 'Trailing * middle * asterisk' },
      ]);
    });
  });
});

class TestGrader extends RedteamGraderBase {
  id = 'test-grader';
  rubric = 'Test rubric for {{ purpose }} with harm category {{ harmCategory }}';
}

describe('RedteamGraderBase', () => {
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
      grader.getResult(
        'prompt',
        'output',
        testWithoutPurpose,
        undefined /* provider */,
        undefined /* renderedValue */,
      ),
    ).rejects.toThrow('Test is missing purpose metadata');
  });

  it('should render the rubric with correct variables', async () => {
    const mockResult: GradingResult = {
      pass: true,
      score: 1,
      reason: 'Test passed',
    };
    jest.mocked(matchesLlmRubric).mockResolvedValue(mockResult);

    await grader.getResult(
      'test prompt',
      'test output',
      mockTest,
      undefined /* provider */,
      undefined /* renderedValue */,
    );

    expect(matchesLlmRubric).toHaveBeenCalledWith(
      'Test rubric for test-purpose with harm category test-harm',
      'test output',
      expect.any(Object),
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
      undefined /* renderedValue */,
    );

    expect(result).toEqual({
      grade: mockResult,
      rubric: 'Test rubric for test-purpose with harm category test-harm',
    });
  });

  describe('grader examples', () => {
    it('should append grader examples to rubric when present', async () => {
      const mockResult: GradingResult = {
        pass: true,
        score: 1,
        reason: 'Test passed',
      };
      jest.mocked(matchesLlmRubric).mockResolvedValue(mockResult);

      const testWithExamples = {
        ...mockTest,
        metadata: {
          ...mockTest.metadata,
          pluginConfig: {
            graderExamples: [
              { output: 'meow', pass: true, score: 1, reason: 'Example 1' },
              { output: 'woof', pass: false, score: 0, reason: 'Example 2' },
            ],
          },
        },
      };

      const result = await grader.getResult(
        'test prompt',
        'test output',
        testWithExamples,
        undefined /* provider */,
        undefined /* renderedValue */,
      );

      expect(result.rubric).toBe(
        'Test rubric for test-purpose with harm category test-harm\n\n' +
          'EXAMPLE OUTPUT: {"output":"meow","pass":true,"score":1,"reason":"Example 1"}\n' +
          'EXAMPLE OUTPUT: {"output":"woof","pass":false,"score":0,"reason":"Example 2"}',
      );
    });

    it('should not append grader examples when not present', async () => {
      const mockResult: GradingResult = {
        pass: true,
        score: 1,
        reason: 'Test passed',
      };
      jest.mocked(matchesLlmRubric).mockResolvedValue(mockResult);

      const testWithoutExamples = {
        ...mockTest,
        metadata: {
          ...mockTest.metadata,
          pluginConfig: {},
        },
      };

      const result = await grader.getResult(
        'test prompt',
        'test output',
        testWithoutExamples,
        undefined /* provider */,
        undefined /* renderedValue */,
      );

      expect(result.rubric).toBe('Test rubric for test-purpose with harm category test-harm');
    });
  });

  describe('RedteamGraderBase with tools', () => {
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

      ToolGrader = class extends RedteamGraderBase {
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
        expect.any(Object),
      );
      expect(matchesLlmRubric).toHaveBeenCalledWith(
        expect.stringContaining('tool2'),
        expect.any(String),
        expect.any(Object),
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

  describe('empty and refusal handling', () => {
    it('should auto-pass empty responses', async () => {
      const result = await grader.getResult('test prompt', '', mockTest, undefined, undefined);

      expect(result).toEqual({
        grade: {
          pass: true,
          score: 1,
          reason: 'Model refused the request',
        },
        rubric: expect.any(String),
        suggestions: undefined,
      });
      expect(matchesLlmRubric).not.toHaveBeenCalled();
    });

    it('should auto-pass JSON empty object responses', async () => {
      const result = await grader.getResult('test prompt', '{}', mockTest, undefined, undefined);

      expect(result).toEqual({
        grade: {
          pass: true,
          score: 1,
          reason: 'Model refused the request',
        },
        rubric: expect.any(String),
        suggestions: undefined,
      });
      expect(matchesLlmRubric).not.toHaveBeenCalled();
    });

    it('should auto-pass refusal responses', async () => {
      const refusalResponses = [
        // Test prefix matches
        'I am sorry, I cannot help',
        'I apologize for this',
        // Test substring matches
        'As a language model, I cannot do that',
        'The generated text has been blocked by our content filters',
      ];

      for (const response of refusalResponses) {
        jest.clearAllMocks();
        const result = await grader.getResult(
          'test prompt',
          response,
          mockTest,
          undefined,
          undefined,
        );
        expect(result).toEqual({
          grade: {
            pass: true,
            score: 1,
            reason: 'Model refused the request',
          },
          rubric: expect.any(String),
          suggestions: undefined,
        });
        expect(matchesLlmRubric).not.toHaveBeenCalled();
      }
    });

    it('should not auto-pass valid responses', async () => {
      const mockResult: GradingResult = {
        pass: true,
        score: 1,
        reason: 'Test passed',
      };
      jest.mocked(matchesLlmRubric).mockResolvedValue(mockResult);

      const validResponses = [
        'Here is a valid response',
        'The answer is 42',
        'Multiple\nline\nresponse',
      ];

      for (const response of validResponses) {
        await grader.getResult('test prompt', response, mockTest, undefined, undefined);

        expect(matchesLlmRubric).toHaveBeenCalledWith(
          expect.any(String),
          response,
          expect.any(Object),
        );
      }
    });
  });
});
