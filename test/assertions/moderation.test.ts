import { handleModeration } from '../../src/assertions/moderation';
import { matchesModeration } from '../../src/matchers';
import type {
  ApiProvider,
  Assertion,
  AssertionParams,
  AssertionValueFunctionContext,
  TestCase,
} from '../../src/types';

jest.mock('../../src/matchers', () => ({
  matchesModeration: jest.fn(),
}));

const mockedMatchesModeration = jest.mocked(matchesModeration);

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
