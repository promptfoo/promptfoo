import { runAssertion } from '../../src/assertions';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import { DefaultGradingJsonProvider } from '../../src/providers/openai/defaults';
import type { Assertion, AtomicTestCase, GradingResult } from '../../src/types';
import { TestGrader } from '../util/utils';
import { setupCommonMocks } from './testUtils';

setupCommonMocks();

describe('LLM Rubric assertions', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should pass when LLM rubric returns pass result', async () => {
    const assertion: Assertion = {
      type: 'llm-rubric',
      value: 'Check if output correctly answers the question about capital cities.',
    };

    const callApiSpy = jest.spyOn(DefaultGradingJsonProvider, 'callApi').mockResolvedValue({
      output: JSON.stringify({ pass: true, score: 1.0, reason: 'The answer is correct' }),
    });

    const result: GradingResult = await runAssertion({
      prompt: 'What is the capital of France?',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion,
      test: {} as AtomicTestCase,
      providerResponse: { output: 'The capital of France is Paris.' },
    });

    expect(result).toMatchObject({
      pass: true,
      score: 1.0,
      reason: 'The answer is correct',
    });
    expect(callApiSpy).toHaveBeenCalledTimes(1);
  });

  it('should fail when LLM rubric returns fail result', async () => {
    const assertion: Assertion = {
      type: 'llm-rubric',
      value: 'Check if output correctly answers the question about capital cities.',
    };

    const callApiSpy = jest.spyOn(DefaultGradingJsonProvider, 'callApi').mockResolvedValue({
      output: JSON.stringify({ pass: false, score: 0.2, reason: 'The answer is incorrect' }),
    });

    const result: GradingResult = await runAssertion({
      prompt: 'What is the capital of France?',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion,
      test: {} as AtomicTestCase,
      providerResponse: { output: 'The capital of France is Lyon.' },
    });

    expect(result).toMatchObject({
      pass: false,
      score: 0.2,
      reason: 'The answer is incorrect',
    });
    expect(callApiSpy).toHaveBeenCalledTimes(1);
  });

  it('should use custom provider for LLM rubric when specified', async () => {
    const customGrader = new TestGrader();
    const spyCustomGrader = jest.spyOn(customGrader, 'callApi').mockResolvedValue({
      output: JSON.stringify({ pass: true, score: 0.9, reason: 'Custom grading result' }),
    });

    const assertion: Assertion = {
      type: 'llm-rubric',
      value: 'Custom rubric criteria',
      provider: customGrader,
    };

    const result: GradingResult = await runAssertion({
      prompt: 'What is the capital of France?',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion,
      test: {} as AtomicTestCase,
      providerResponse: { output: 'The capital of France is Paris.' },
    });

    expect(result).toMatchObject({
      pass: true,
      score: 0.9,
      reason: 'Custom grading result',
    });
    expect(spyCustomGrader).toHaveBeenCalledTimes(1);
  });

  it('should handle a threshold for LLM rubric', async () => {
    const assertion: Assertion = {
      type: 'llm-rubric',
      value: 'Evaluate the quality of this answer on a scale from 0 to 1.',
      threshold: 0.7,
    };

    jest.spyOn(DefaultGradingJsonProvider, 'callApi').mockResolvedValue({
      output: JSON.stringify({ pass: true, score: 0.6, reason: 'Good but not excellent' }),
    });

    const result: GradingResult = await runAssertion({
      prompt: 'What is the capital of France?',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion,
      test: {} as AtomicTestCase,
      providerResponse: { output: 'The capital of France is Paris.' },
    });

    // Should fail because 0.6 < 0.7 threshold
    expect(result).toMatchObject({
      pass: false,
      score: 0.6,
      reason: 'Good but not excellent',
    });
  });

  it('should handle JSON parsing errors in LLM response', async () => {
    const assertion: Assertion = {
      type: 'llm-rubric',
      value: 'Check if output is correct.',
    };

    jest.spyOn(DefaultGradingJsonProvider, 'callApi').mockResolvedValue({
      output: 'This is not valid JSON',
    });

    const result: GradingResult = await runAssertion({
      prompt: 'What is the capital of France?',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion,
      test: {} as AtomicTestCase,
      providerResponse: { output: 'The capital of France is Paris.' },
    });

    expect(result).toMatchObject({
      pass: false,
      reason: expect.stringContaining('Error parsing JSON response'),
    });
  });
});
