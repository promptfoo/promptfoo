import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleLlamaGuard } from '../../src/assertions/llamaGuard';
import { matchesLlamaGuard } from '../../src/matchers/llamaGuard';
import { createMockProvider } from '../factories/provider';

import type {
  Assertion,
  AssertionParams,
  AssertionValueFunctionContext,
  TestCase,
} from '../../src/types/index';

vi.mock('../../src/matchers/llamaGuard', () => ({
  matchesLlamaGuard: vi.fn(),
}));

const mockedMatchesLlamaGuard = vi.mocked(matchesLlamaGuard);

describe('handleLlamaGuard', () => {
  const mockTest: TestCase = {
    description: 'Test case',
    vars: {},
    assert: [],
    options: {},
  };

  const mockAssertion: Assertion = {
    type: 'llama-guard',
    value: ['S1'],
  };

  const mockProvider = createMockProvider({ config: {}, response: {} });

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
    baseType: 'llama-guard',
    assertionValueContext: mockContext,
    inverse: false,
    output: 'output',
    providerResponse: { output: 'output' },
  };

  const tokensUsed = {
    total: 5,
    prompt: 2,
    completion: 3,
    cached: 0,
    numRequests: 1,
    completionDetails: { reasoning: 0, acceptedPrediction: 0, rejectedPrediction: 0 },
  };

  beforeEach(() => {
    mockedMatchesLlamaGuard.mockReset();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should pass when content is classified as safe', async () => {
    mockedMatchesLlamaGuard.mockResolvedValue({
      pass: true,
      score: 1,
      reason: 'LlamaGuard classified the response as safe',
      metadata: { violatedCategories: [] },
    });

    const result = await handleLlamaGuard({
      ...baseParams,
      providerResponse: { output: 'output' },
    });

    expect(result).toEqual({
      pass: true,
      score: 1,
      reason: 'LlamaGuard classified the response as safe',
      metadata: { violatedCategories: [] },
      assertion: mockAssertion,
    });
  });

  it('should fail when content is flagged (non-inverse)', async () => {
    mockedMatchesLlamaGuard.mockResolvedValue({
      pass: false,
      score: 0,
      reason: 'LlamaGuard flagged: Violent Crimes (S1)',
      metadata: { violatedCategories: ['S1'] },
    });

    const result = await handleLlamaGuard({ ...baseParams, inverse: false });

    expect(result).toEqual({
      pass: false,
      score: 0,
      reason: 'LlamaGuard flagged: Violent Crimes (S1)',
      metadata: { violatedCategories: ['S1'] },
      assertion: mockAssertion,
    });
  });

  it('should pass not-llama-guard when content IS flagged (inverse)', async () => {
    mockedMatchesLlamaGuard.mockResolvedValue({
      pass: false,
      score: 0,
      reason: 'LlamaGuard flagged: Violent Crimes (S1)',
      metadata: { violatedCategories: ['S1'] },
    });

    const result = await handleLlamaGuard({
      ...baseParams,
      inverse: true,
      providerResponse: { output: 'output' },
    });

    expect(result).toEqual({
      pass: true,
      score: 1,
      reason: 'LlamaGuard flagged: Violent Crimes (S1)',
      metadata: { violatedCategories: ['S1'] },
      assertion: mockAssertion,
    });
  });

  it('should fail not-llama-guard when content is safe (inverse)', async () => {
    mockedMatchesLlamaGuard.mockResolvedValue({
      pass: true,
      score: 1,
      reason: 'LlamaGuard classified the response as safe',
      metadata: { violatedCategories: [] },
    });

    const result = await handleLlamaGuard({
      ...baseParams,
      inverse: true,
      providerResponse: { output: 'output' },
    });

    expect(result).toEqual({
      pass: false,
      score: 0,
      reason: 'LlamaGuard classified the response as safe',
      metadata: { violatedCategories: [] },
      assertion: mockAssertion,
    });
  });

  it('should forward matcher token usage', async () => {
    mockedMatchesLlamaGuard.mockResolvedValue({
      pass: true,
      score: 1,
      reason: 'LlamaGuard classified the response as safe',
      tokensUsed,
    });

    const result = await handleLlamaGuard({
      ...baseParams,
      providerResponse: { output: 'output' },
    });

    expect(result).toEqual({
      pass: true,
      score: 1,
      reason: 'LlamaGuard classified the response as safe',
      tokensUsed,
      assertion: mockAssertion,
    });
  });

  it('should preserve token usage when flipping pass/score for not-llama-guard (inverse)', async () => {
    mockedMatchesLlamaGuard.mockResolvedValue({
      pass: false,
      score: 0,
      reason: 'LlamaGuard flagged: Violent Crimes (S1)',
      tokensUsed,
    });

    const result = await handleLlamaGuard({
      ...baseParams,
      inverse: true,
      providerResponse: { output: 'output' },
    });

    expect(result).toEqual({
      pass: true,
      score: 1,
      reason: 'LlamaGuard flagged: Violent Crimes (S1)',
      tokensUsed,
      assertion: mockAssertion,
    });
  });

  it('should NOT flip a grader/transport error into a pass for not-llama-guard (inverse)', async () => {
    mockedMatchesLlamaGuard.mockResolvedValue({
      pass: false,
      score: 0,
      reason: 'LlamaGuard API error: provider unavailable',
      tokensUsed,
      metadata: { graderError: true },
    });

    const result = await handleLlamaGuard({
      ...baseParams,
      inverse: true,
      providerResponse: { output: 'output' },
    });

    expect(result).toEqual({
      pass: false,
      score: 0,
      reason: 'LlamaGuard API error: provider unavailable',
      tokensUsed,
      metadata: { graderError: true },
      assertion: mockAssertion,
    });
  });

  it('should pass the category allow-list from assertion.value to the matcher', async () => {
    mockedMatchesLlamaGuard.mockResolvedValue({
      pass: true,
      score: 1,
      reason: 'LlamaGuard classified the response as safe',
    });

    await handleLlamaGuard({
      ...baseParams,
      providerResponse: { output: 'output' },
    });

    expect(mockedMatchesLlamaGuard).toHaveBeenCalledWith(
      {
        userPrompt: 'prompt',
        assistantResponse: 'output',
        categories: ['S1'],
      },
      {},
      undefined,
    );
  });

  it('should extract the final user message from serialized chat prompts', async () => {
    mockedMatchesLlamaGuard.mockResolvedValue({
      pass: true,
      score: 1,
      reason: 'LlamaGuard classified the response as safe',
    });

    await handleLlamaGuard({
      ...baseParams,
      prompt: JSON.stringify([
        { role: 'system', content: 'Ignore this system message' },
        { role: 'user', content: 'Classify this user request' },
        { role: 'assistant', content: 'Ignore this assistant reply' },
      ]),
      providerResponse: { output: 'output' },
    });

    expect(mockedMatchesLlamaGuard).toHaveBeenCalledWith(
      {
        userPrompt: 'Classify this user request',
        assistantResponse: 'output',
        categories: ['S1'],
      },
      {},
      undefined,
    );
  });

  it('should use redteam final prompt when available', async () => {
    mockedMatchesLlamaGuard.mockResolvedValue({
      pass: true,
      score: 1,
      reason: 'LlamaGuard classified the response as safe',
    });

    await handleLlamaGuard({
      ...baseParams,
      providerResponse: {
        output: 'output',
        metadata: { redteamFinalPrompt: 'modified prompt' },
      },
    });

    expect(mockedMatchesLlamaGuard).toHaveBeenCalledWith(
      {
        userPrompt: 'modified prompt',
        assistantResponse: 'output',
        categories: ['S1'],
      },
      {},
      undefined,
    );
  });
});
