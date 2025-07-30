import logger from '../../../src/logger';
import { maybeEmitAzureOpenAiWarning } from '../../../src/providers/azure/warnings';

import type { TestCase, TestSuite } from '../../../src/types';

describe('maybeEmitAzureOpenAiWarning', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return false when no Azure providers are present', () => {
    const testSuite: TestSuite = {
      prompts: [],
      providers: [{ constructor: { name: 'OtherProvider' } } as any],
      defaultTest: {},
    };
    const tests: TestCase[] = [];

    expect(maybeEmitAzureOpenAiWarning(testSuite, tests)).toBe(false);
  });

  it('should return false when both Azure and OpenAI providers are present', () => {
    const testSuite: TestSuite = {
      prompts: [],
      providers: [
        { constructor: { name: 'AzureChatCompletionProvider' } } as any,
        { constructor: { name: 'OpenAiChatCompletionProvider' } } as any,
      ],
      defaultTest: {},
    };
    const tests: TestCase[] = [];

    expect(maybeEmitAzureOpenAiWarning(testSuite, tests)).toBe(false);
  });

  it('should return false when Azure provider is present but no model-graded assertions', () => {
    const testSuite: TestSuite = {
      prompts: [],
      providers: [{ constructor: { name: 'AzureChatCompletionProvider' } } as any],
      defaultTest: {},
    };
    const tests: TestCase[] = [
      {
        assert: [{ type: 'contains' }],
      },
    ];

    expect(maybeEmitAzureOpenAiWarning(testSuite, tests)).toBe(false);
  });

  it('should return true and emit warning when Azure provider is used with model-graded assertions', () => {
    const warnSpy = jest.spyOn(logger, 'warn');

    const testSuite: TestSuite = {
      prompts: [],
      providers: [{ constructor: { name: 'AzureChatCompletionProvider' } } as any],
      defaultTest: {},
    };
    const tests: TestCase[] = [
      {
        assert: [{ type: 'factuality' }],
      },
    ];

    expect(maybeEmitAzureOpenAiWarning(testSuite, tests)).toBe(true);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('You are using model-graded assertions of types'),
    );
  });

  it('should return false when provider is explicitly set', () => {
    const testSuite: TestSuite = {
      prompts: [],
      providers: [{ constructor: { name: 'AzureChatCompletionProvider' } } as any],
      defaultTest: {
        options: {
          provider: 'azure',
        },
      },
    };
    const tests: TestCase[] = [
      {
        assert: [{ type: 'factuality' }],
      },
    ];

    expect(maybeEmitAzureOpenAiWarning(testSuite, tests)).toBe(false);
  });

  it('should return false when assertion has provider set', () => {
    const testSuite: TestSuite = {
      prompts: [],
      providers: [{ constructor: { name: 'AzureChatCompletionProvider' } } as any],
      defaultTest: {},
    };
    const tests: TestCase[] = [
      {
        assert: [
          {
            type: 'factuality',
            provider: 'azure',
          },
        ],
      },
    ];

    expect(maybeEmitAzureOpenAiWarning(testSuite, tests)).toBe(false);
  });

  it('should return false when test has provider option set', () => {
    const testSuite: TestSuite = {
      prompts: [],
      providers: [{ constructor: { name: 'AzureChatCompletionProvider' } } as any],
      defaultTest: {},
    };
    const tests: TestCase[] = [
      {
        assert: [{ type: 'factuality' }],
        options: {
          provider: 'azure',
        },
      },
    ];

    expect(maybeEmitAzureOpenAiWarning(testSuite, tests)).toBe(false);
  });
});
