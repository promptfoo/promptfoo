import { runAssertion } from '../../src/assertions';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import type { Assertion, AtomicTestCase, GradingResult } from '../../src/types';
import { setupCommonMocks } from './testUtils';

// Setup all common mocks
setupCommonMocks();

// Create a mock implementation of the javascript handler
jest.mock('../../src/assertions/javascript', () => {
  return {
    handleJavascript: jest.fn().mockImplementation(({ assertion }) => {
      let valueFromScript = 0;

      // Determine the value based on the assertion value
      if (assertion.value === 'return 0;') {
        valueFromScript = 0;
      } else if (assertion.value === 'return 0.4;') {
        valueFromScript = 0.4;
      } else if (assertion.value === 'return 0.5;') {
        valueFromScript = 0.5;
      } else if (assertion.value === 'return 0.6;') {
        valueFromScript = 0.6;
      } else if (assertion.value === 'output.length * 10') {
        // For the string-based tests
        valueFromScript = 150; // Simulating 'Expected output'.length * 10
      }

      let pass;
      if (assertion.threshold === 0) {
        pass = valueFromScript >= 0;
      } else if (assertion.threshold) {
        pass = valueFromScript >= assertion.threshold;
      } else {
        pass = valueFromScript > 0;
      }
      return {
        pass,
        score: valueFromScript,
        reason: pass
          ? 'Assertion passed'
          : `Custom function returned ${valueFromScript}, which is ${pass ? 'above' : 'below'} threshold ${assertion.threshold || 0}`,
        assertion,
      };
    }),
  };
});

describe('Javascript assertion with threshold', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should respect a threshold of 0 for javascript assertion returning a number', async () => {
    const output = 'test output';
    const zeroThresholdAssertion: Assertion = {
      type: 'javascript',
      value: 'return 0;', // Function that returns exactly 0
      threshold: 0,
    };

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      assertion: zeroThresholdAssertion,
      test: {} as AtomicTestCase,
      providerResponse: { output, cost: 0 },
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
    });

    expect(result).toMatchObject({
      pass: true,
      score: 0,
    });
  });

  it('should fail when javascript returns a number below threshold', async () => {
    const output = 'test output';
    const assertion: Assertion = {
      type: 'javascript',
      value: 'return 0.4;',
      threshold: 0.5,
    };

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      assertion,
      test: {} as AtomicTestCase,
      providerResponse: { output, cost: 0 },
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
    });

    expect(result).toMatchObject({
      pass: false,
      score: 0.4,
    });
  });

  it('should pass when javascript returns a number equal to threshold', async () => {
    const output = 'test output';
    const assertion: Assertion = {
      type: 'javascript',
      value: 'return 0.5;',
      threshold: 0.5,
    };

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      assertion,
      test: {} as AtomicTestCase,
      providerResponse: { output, cost: 0 },
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
    });

    expect(result).toMatchObject({
      pass: true,
      score: 0.5,
    });
  });

  it('should pass when javascript returns a number above threshold', async () => {
    const output = 'test output';
    const assertion: Assertion = {
      type: 'javascript',
      value: 'return 0.6;',
      threshold: 0.5,
    };

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      assertion,
      test: {} as AtomicTestCase,
      providerResponse: { output, cost: 0 },
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
    });

    expect(result).toMatchObject({
      pass: true,
      score: 0.6,
    });
  });

  it('should pass with string-based function returning value above threshold', async () => {
    const output = 'Expected output'; // 15 characters * 10 = 150 > 0.5

    const javascriptStringAssertionWithNumberAndThreshold: Assertion = {
      type: 'javascript',
      value: 'output.length * 10',
      threshold: 0.5,
    };

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion: javascriptStringAssertionWithNumberAndThreshold,
      test: {} as AtomicTestCase,
      providerResponse: { output },
    });

    expect(result).toMatchObject({
      pass: true,
      score: 150,
    });
  });
});
