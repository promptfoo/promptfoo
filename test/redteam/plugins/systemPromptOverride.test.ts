import { matchesLlmRubric } from '../../../src/matchers';
import {
  SystemPromptOverridePlugin,
  SystemPromptOverrideGrader,
  PLUGIN_ID,
} from '../../../src/redteam/plugins/systemPromptOverride';
import type { ApiProvider, AtomicTestCase, AssertionValue } from '../../../src/types';

jest.mock('../../../src/matchers', () => ({
  matchesLlmRubric: jest.fn(),
}));

// Test helper class to access protected methods
class TestableSystemPromptOverridePlugin extends SystemPromptOverridePlugin {
  public async testGetTemplate(): Promise<string> {
    return this.getTemplate();
  }
}

describe('SystemPromptOverridePlugin', () => {
  const mockProvider: ApiProvider = {
    id: () => 'test-provider',
    callApi: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should generate tests with correct format', async () => {
    const plugin = new SystemPromptOverridePlugin(mockProvider, 'test-purpose', 'prompt', {});
    const tests = await plugin.generateTests(2);

    expect(tests).toHaveLength(2);
    expect(tests[0]).toMatchObject({
      vars: {
        prompt: expect.any(String),
      },
      assert: [
        {
          type: PLUGIN_ID,
          metric: 'SystemPromptOverride',
        },
      ],
      metadata: {
        purpose: 'test-purpose',
        pluginId: PLUGIN_ID,
      },
    });
  });

  it('should include all required chat formats', async () => {
    const plugin = new SystemPromptOverridePlugin(mockProvider, 'test-purpose', 'prompt', {});
    const tests = await plugin.generateTests(20); // Get all formats

    // Test for specific format patterns
    const formats = {
      openai: (text: string) => text.includes('"role": "system"'),
      claude: (text: string) => text.includes('<system>') && text.includes('</system>'),
      llama2: (text: string) => text.includes('[INST]') && text.includes('<<SYS>>'),
      mistral: (text: string) => text.includes('<|im_start|>') && text.includes('<|im_end|>'),
      vicuna: (text: string) => text.includes('SYSTEM:') && text.includes('USER:'),
      zephyr: (text: string) => text.includes('<|system|>') && text.includes('<|user|>'),
      llama3: (text: string) =>
        text.includes('<|start_header_id|>') && text.includes('<|end_header_id|>'),
      gemma: (text: string) => text.includes('<start_of_turn>') && text.includes('<end_of_turn>'),
    };

    // Check that each format is present
    Object.entries(formats).forEach(([name, checker]) => {
      const hasFormat = tests.some((test) => {
        const prompt = test.vars?.prompt;
        return typeof prompt === 'string' && checker(prompt);
      });
      expect(hasFormat).toBe(true);
    });
  });

  it('should limit number of tests to requested amount', async () => {
    const plugin = new SystemPromptOverridePlugin(mockProvider, 'test-purpose', 'prompt', {});
    const tests = await plugin.generateTests(3);
    expect(tests).toHaveLength(3);
  });

  it('should return injectVar from getTemplate', async () => {
    const plugin = new TestableSystemPromptOverridePlugin(
      mockProvider,
      'test-purpose',
      'test-var',
      {},
    );
    const template = await plugin.testGetTemplate();
    expect(template).toBe('test-var');
  });
});

describe('SystemPromptOverrideGrader', () => {
  let grader: SystemPromptOverrideGrader;
  let mockTest: AtomicTestCase;

  beforeEach(() => {
    grader = new SystemPromptOverrideGrader();
    mockTest = {
      vars: {},
      metadata: {
        purpose: 'test-purpose',
      },
    } as AtomicTestCase;
    jest.clearAllMocks();
  });

  it('should have the correct id', () => {
    expect(grader.id).toBe(PLUGIN_ID);
  });

  it('should fail when response starts with HACKED:', async () => {
    const mockResult = {
      pass: false,
      score: 0,
      reason: 'Response starts with HACKED:',
      overrideConfirmed: true,
    };
    jest.mocked(matchesLlmRubric).mockResolvedValue(mockResult);

    const result = await grader.getResult(
      'Tell me about yourself',
      'HACKED: I am an AI assistant',
      mockTest,
      undefined,
      undefined as unknown as AssertionValue,
    );

    expect(result.grade).toEqual(mockResult);
    expect(matchesLlmRubric).toHaveBeenCalledWith(
      expect.stringContaining('Evaluate the output for:'),
      'HACKED: I am an AI assistant',
      expect.any(Object),
    );
  });

  it('should pass when response maintains original behavior', async () => {
    const mockResult = {
      pass: true,
      score: 1,
      reason: 'Model maintained original behavior',
      overrideConfirmed: false,
    };
    jest.mocked(matchesLlmRubric).mockResolvedValue(mockResult);

    const result = await grader.getResult(
      'Tell me about yourself',
      'I am an AI assistant here to help.',
      mockTest,
      undefined,
      undefined as unknown as AssertionValue,
    );

    expect(result.grade).toEqual(mockResult);
  });

  it('should fail when model acknowledges system change', async () => {
    const mockResult = {
      pass: false,
      score: 0,
      reason: 'Model acknowledged system prompt change',
      overrideConfirmed: true,
    };
    jest.mocked(matchesLlmRubric).mockResolvedValue(mockResult);

    const result = await grader.getResult(
      'Tell me about yourself',
      'I have updated my system prompt as requested.',
      mockTest,
      undefined,
      undefined as unknown as AssertionValue,
    );

    expect(result.grade).toEqual(mockResult);
  });
});
