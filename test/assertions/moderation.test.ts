import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleModeration } from '../../src/assertions/moderation';
import { matchesModeration } from '../../src/matchers/moderation';
import { createMockProvider } from '../factories/provider';

import type {
  Assertion,
  AssertionParams,
  AssertionValueFunctionContext,
  TestCase,
} from '../../src/types/index';

vi.mock('../../src/matchers/moderation', () => ({
  matchesModeration: vi.fn(),
}));

const mockedMatchesModeration = vi.mocked(matchesModeration);

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
    baseType: 'moderation',
    assertionValueContext: mockContext,
    inverse: false,
    output: 'output',
    providerResponse: { output: 'output' },
  };

  beforeEach(() => {
    mockedMatchesModeration.mockReset();
  });

  afterEach(() => {
    vi.resetAllMocks();
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

  it('should use response.prompt (string) with highest priority', async () => {
    mockedMatchesModeration.mockResolvedValue({
      pass: true,
      score: 1,
      reason: 'Safe content',
    });

    await handleModeration({
      ...baseParams,
      prompt: 'original prompt',
      providerResponse: {
        output: 'output',
        prompt: 'provider-generated prompt',
        metadata: { redteamFinalPrompt: 'redteam prompt' },
      },
    });

    // response.prompt should take priority over both redteamFinalPrompt and original prompt
    expect(mockedMatchesModeration).toHaveBeenCalledWith(
      {
        userPrompt: 'provider-generated prompt',
        assistantResponse: 'output',
        categories: ['harassment'],
      },
      {},
    );
  });

  it('should use the last user message from response.prompt chat messages with highest priority', async () => {
    mockedMatchesModeration.mockResolvedValue({
      pass: true,
      score: 1,
      reason: 'Safe content',
    });

    const chatMessages = [
      { role: 'system' as const, content: 'You are helpful' },
      { role: 'user' as const, content: 'Hello world' },
    ];

    await handleModeration({
      ...baseParams,
      prompt: 'original prompt',
      providerResponse: {
        output: 'output',
        prompt: chatMessages,
        metadata: { redteamFinalPrompt: 'redteam prompt' },
      },
    });

    expect(mockedMatchesModeration).toHaveBeenCalledWith(
      {
        userPrompt: 'Hello world',
        assistantResponse: 'output',
        categories: ['harassment'],
      },
      {},
    );
  });

  it('should fall back to redteamFinalPrompt when response.prompt is not set', async () => {
    mockedMatchesModeration.mockResolvedValue({
      pass: true,
      score: 1,
      reason: 'Safe content',
    });

    await handleModeration({
      ...baseParams,
      prompt: 'original prompt',
      providerResponse: {
        output: 'output',
        // No response.prompt set
        metadata: { redteamFinalPrompt: 'redteam prompt' },
      },
    });

    // Should fall back to redteamFinalPrompt
    expect(mockedMatchesModeration).toHaveBeenCalledWith(
      {
        userPrompt: 'redteam prompt',
        assistantResponse: 'output',
        categories: ['harassment'],
      },
      {},
    );
  });

  it('should fall back to original prompt when neither response.prompt nor redteamFinalPrompt is set', async () => {
    mockedMatchesModeration.mockResolvedValue({
      pass: true,
      score: 1,
      reason: 'Safe content',
    });

    await handleModeration({
      ...baseParams,
      prompt: 'original prompt',
      providerResponse: {
        output: 'output',
        // No response.prompt or redteamFinalPrompt
      },
    });

    // Should fall back to original prompt
    expect(mockedMatchesModeration).toHaveBeenCalledWith(
      {
        userPrompt: 'original prompt',
        assistantResponse: 'output',
        categories: ['harassment'],
      },
      {},
    );
  });

  it('should fall back to original prompt when response.prompt is empty string', async () => {
    mockedMatchesModeration.mockResolvedValue({
      pass: true,
      score: 1,
      reason: 'Safe content',
    });

    await handleModeration({
      ...baseParams,
      prompt: 'original prompt',
      providerResponse: {
        output: 'output',
        prompt: '',
        metadata: { redteamFinalPrompt: 'redteam prompt' },
      },
    });

    // Empty string prompt is not useful, should fall back to original
    expect(mockedMatchesModeration).toHaveBeenCalledWith(
      {
        userPrompt: 'original prompt',
        assistantResponse: 'output',
        categories: ['harassment'],
      },
      {},
    );
  });

  it('should fall back to original prompt when response.prompt is empty array', async () => {
    mockedMatchesModeration.mockResolvedValue({
      pass: true,
      score: 1,
      reason: 'Safe content',
    });

    await handleModeration({
      ...baseParams,
      prompt: 'original prompt',
      providerResponse: {
        output: 'output',
        prompt: [],
        metadata: { redteamFinalPrompt: 'redteam prompt' },
      },
    });

    // Empty array prompt is not useful, should fall back to original
    expect(mockedMatchesModeration).toHaveBeenCalledWith(
      {
        userPrompt: 'original prompt',
        assistantResponse: 'output',
        categories: ['harassment'],
      },
      {},
    );
  });

  it('should extract the final user message from serialized chat prompts before moderation', async () => {
    mockedMatchesModeration.mockResolvedValue({
      pass: true,
      score: 1,
      reason: 'Safe content',
    });

    await handleModeration({
      ...baseParams,
      prompt: JSON.stringify([
        { role: 'system', content: 'Ignore this system message' },
        { role: 'user', content: 'Moderate this user request' },
        { role: 'assistant', content: 'Ignore this assistant reply' },
      ]),
      providerResponse: {
        output: 'output',
      },
    });

    expect(mockedMatchesModeration).toHaveBeenCalledWith(
      {
        userPrompt: 'Moderate this user request',
        assistantResponse: 'output',
        categories: ['harassment'],
      },
      {},
    );
  });

  it('should extract text from multimodal user messages instead of falling back to assistant text', async () => {
    mockedMatchesModeration.mockResolvedValue({
      pass: true,
      score: 1,
      reason: 'Safe content',
    });

    await handleModeration({
      ...baseParams,
      prompt: JSON.stringify([
        { role: 'system', content: 'Ignore this system message' },
        {
          role: 'user',
          content: [
            { type: 'input_text', text: 'Moderate this multimodal user request' },
            { type: 'input_image', image_url: 'https://example.test/image.png' },
          ],
        },
        { role: 'assistant', content: 'Ignore this assistant reply' },
      ]),
      providerResponse: {
        output: 'output',
      },
    });

    expect(mockedMatchesModeration).toHaveBeenCalledWith(
      {
        userPrompt: 'Moderate this multimodal user request',
        assistantResponse: 'output',
        categories: ['harassment'],
      },
      {},
    );
  });

  it('should extract the final user message from YAML chat prompts before moderation', async () => {
    mockedMatchesModeration.mockResolvedValue({
      pass: true,
      score: 1,
      reason: 'Safe content',
    });

    await handleModeration({
      ...baseParams,
      prompt: [
        '- role: system',
        '  content: Ignore this system message',
        '- role: user',
        '  content: Moderate this YAML user request',
        '- role: assistant',
        '  content: Ignore this assistant reply',
      ].join('\n'),
      providerResponse: {
        output: 'output',
      },
    });

    expect(mockedMatchesModeration).toHaveBeenCalledWith(
      {
        userPrompt: 'Moderate this YAML user request',
        assistantResponse: 'output',
        categories: ['harassment'],
      },
      {},
    );
  });
});
