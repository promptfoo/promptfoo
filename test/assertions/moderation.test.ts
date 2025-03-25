import { runAssertion } from '../../src/assertions';
import { handleModeration } from '../../src/assertions/moderation';
import { matchesModeration } from '../../src/matchers';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import { ReplicateModerationProvider } from '../../src/providers/replicate';
import type {
  ApiProvider,
  Assertion,
  AssertionParams,
  AssertionValueFunctionContext,
  TestCase,
} from '../../src/types';
import type { AtomicTestCase, GradingResult } from '../../src/types';
import { setupCommonMocks } from './testUtils';

jest.mock('../../src/matchers', () => ({
  matchesModeration: jest.fn(),
}));

const mockedMatchesModeration = jest.mocked(matchesModeration);

setupCommonMocks();

// Mock the ReplicateModeration provider
jest.mock('../../src/providers/replicate', () => {
  return {
    ReplicateModerationProvider: jest.fn().mockImplementation(() => {
      return {
        callModerationApi: jest.fn().mockImplementation((text: string) => {
          if (text.includes('inappropriate')) {
            return Promise.resolve({
              flags: ['violence', 'hate'],
              categories: {
                violence: 0.95,
                hate: 0.8,
                harassment: 0.2,
              },
            });
          }
          return Promise.resolve({
            flags: [],
            categories: {
              violence: 0.1,
              hate: 0.05,
              harassment: 0.02,
            },
          });
        }),
      };
    }),
  };
});

describe('handleModeration', () => {
  const mockTest: TestCase = {
    description: 'Test case',
    vars: {},
    assert: [],
    options: {},
  };

  const mockAssertion: Assertion = {
    type: 'moderation',
    value: ['harassment'],
  };

  const mockProvider: ApiProvider = {
    id: () => 'test-provider',
    config: {},
    callApi: jest.fn(),
  };

  const mockContext: AssertionValueFunctionContext = {
    prompt: 'test prompt',
    vars: {},
    test: mockTest,
    logProbs: undefined,
    provider: mockProvider,
    providerResponse: { output: 'output' },
  };

  const baseParams: AssertionParams = {
    assertion: mockAssertion,
    test: mockTest,
    outputString: 'output',
    prompt: 'prompt',
    baseType: 'moderation',
    context: mockContext,
    inverse: false,
    output: 'output',
    providerResponse: { output: 'output' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should pass moderation check', async () => {
    mockedMatchesModeration.mockResolvedValue({
      pass: true,
      score: 1,
      reason: 'Safe content',
    });

    const result = await handleModeration({
      ...baseParams,
      providerResponse: { output: 'output' },
    });

    expect(result).toEqual({
      pass: true,
      score: 1,
      reason: 'Safe content',
      assertion: mockAssertion,
    });
  });

  it('should use redteam final prompt when available', async () => {
    mockedMatchesModeration.mockResolvedValue({
      pass: true,
      score: 1,
      reason: 'Safe content',
    });

    await handleModeration({
      ...baseParams,
      providerResponse: {
        output: 'output',
        metadata: { redteamFinalPrompt: 'modified prompt' },
      },
    });

    expect(mockedMatchesModeration).toHaveBeenCalledWith(
      {
        userPrompt: 'modified prompt',
        assistantResponse: 'output',
        categories: ['harassment'],
      },
      {},
    );
  });
});

describe('Moderation assertion', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should pass when content has no moderation flags', async () => {
    const output = 'This is a safe and appropriate response.';
    const assertion: Assertion = {
      type: 'moderation',
      provider: 'replicate:moderation:foo/bar',
    };

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion,
      test: {} as AtomicTestCase,
      providerResponse: { output },
    });

    expect(result).toMatchObject({
      pass: true,
      reason: expect.stringContaining('Moderation check passed'),
    });
  });

  it('should fail when content has moderation flags', async () => {
    const output = 'This is an inappropriate response with harmful content.';
    const assertion: Assertion = {
      type: 'moderation',
      provider: 'replicate:moderation:foo/bar',
    };

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion,
      test: {} as AtomicTestCase,
      providerResponse: { output },
    });

    expect(result).toMatchObject({
      pass: false,
      reason: expect.stringMatching(/Moderation check failed: Content flagged for/),
    });
  });

  it('should support categories configuration', async () => {
    const output = 'This is an inappropriate response with harmful content.';
    const assertion: Assertion = {
      type: 'moderation',
      provider: 'replicate:moderation:foo/bar',
      value: {
        categories: ['violence'], // Only check for violence
      },
    };

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion,
      test: {} as AtomicTestCase,
      providerResponse: { output },
    });

    expect(result).toMatchObject({
      pass: false,
      reason: expect.stringMatching(/Moderation check failed: Content flagged for violence/),
    });
  });

  it('should support thresholds configuration', async () => {
    const output = 'This is an inappropriate response with harmful content.';
    const assertion: Assertion = {
      type: 'moderation',
      provider: 'replicate:moderation:foo/bar',
      value: {
        thresholds: {
          violence: 0.99, // Higher than the mock value of 0.95
        },
      },
    };

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion,
      test: {} as AtomicTestCase,
      providerResponse: { output },
    });

    // Should pass because our threshold is higher than the moderation score
    expect(result).toMatchObject({
      pass: true,
      reason: expect.stringContaining('Moderation check passed'),
    });
  });

  it('should handle errors in moderation API', async () => {
    // Mock a failed API call
    const mockReplicateProvider = new ReplicateModerationProvider('foo/bar');
    jest
      .spyOn(mockReplicateProvider, 'callModerationApi')
      .mockRejectedValueOnce(new Error('Moderation API failed'));

    // Replace the provider with our mocked one that throws an error
    jest
      .spyOn(ReplicateModerationProvider.prototype, 'callModerationApi')
      .mockRejectedValueOnce(new Error('Moderation API failed'));

    const output = 'This is a response.';
    const assertion: Assertion = {
      type: 'moderation',
      provider: 'replicate:moderation:foo/bar',
    };

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion,
      test: {} as AtomicTestCase,
      providerResponse: { output },
    });

    expect(result).toMatchObject({
      pass: false,
      reason: expect.stringMatching(/Error in moderation check/),
    });
  });

  it('should support not-moderation assertion', async () => {
    const output = 'This is an inappropriate response with harmful content.';
    const assertion: Assertion = {
      type: 'not-moderation',
      provider: 'replicate:moderation:foo/bar',
    };

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion,
      test: {} as AtomicTestCase,
      providerResponse: { output },
    });

    // Should pass because not-moderation expects content to be flagged
    expect(result).toMatchObject({
      pass: true,
      reason: expect.stringMatching(/Moderation check passed/),
    });
  });
});
