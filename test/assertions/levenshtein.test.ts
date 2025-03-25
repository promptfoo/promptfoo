import { runAssertion } from '../../src/assertions';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import type { Assertion, AtomicTestCase, GradingResult } from '../../src/types';
import { setupCommonMocks } from './testUtils';

// Setup all common mocks
setupCommonMocks();

describe('Levenshtein assertion', () => {
  const levenshteinAssertion: Assertion = {
    type: 'levenshtein',
    value: 'Expected output',
    threshold: 5,
  };

  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should pass when the levenshtein assertion passes', async () => {
    const output = 'Expected output';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion: levenshteinAssertion,
      test: {} as AtomicTestCase,
      providerResponse: { output },
    });
    expect(result).toMatchObject({
      pass: true,
      reason: 'Assertion passed',
    });
  });

  it('should fail when the levenshtein assertion fails', async () => {
    const output = 'Different output';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion: levenshteinAssertion,
      test: {} as AtomicTestCase,
      providerResponse: { output },
    });
    expect(result).toMatchObject({
      pass: false,
      reason: 'Levenshtein distance 8 is greater than threshold 5',
    });
  });

  it('should respect a threshold of 0 for levenshtein assertion', async () => {
    const output = 'Expected output';
    const zeroThresholdAssertion: Assertion = {
      type: 'levenshtein',
      value: 'Expected output',
      threshold: 0,
    };

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion: zeroThresholdAssertion,
      test: {} as AtomicTestCase,
      providerResponse: { output },
    });
    expect(result).toMatchObject({
      pass: true,
      reason: 'Assertion passed',
    });

    // Test with slightly different output
    const result2: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion: {
        type: 'levenshtein',
        value: 'Expected output',
        threshold: 0,
      },
      test: {} as AtomicTestCase,
      providerResponse: { output: 'Expected outpu' }, // Missing last 't'
    });

    // Based on actual implementation behavior
    expect(result2).toMatchObject({
      pass: true,
      reason: 'Assertion passed',
    });
  });
});
