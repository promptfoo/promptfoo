import { AzureOpenAiCompletionProvider } from '../src/providers/azureopenai';
import { maybeEmitAzureOpenAiWarning } from '../src/providers/azureopenaiUtil';
import { HuggingfaceTextGenerationProvider } from '../src/providers/huggingface';
import { OpenAiCompletionProvider } from '../src/providers/openai';
import type { TestSuite, TestCase } from '../src/types';

jest.mock('../src/logger');

describe('maybeEmitAzureOpenAiWarning', () => {
  it('should not emit warning when no Azure providers are used', () => {
    const testSuite: TestSuite = {
      providers: [new OpenAiCompletionProvider('foo')],
      defaultTest: {},
      prompts: [],
    };
    const tests: TestCase[] = [
      {
        assert: [{ type: 'llm-rubric', value: 'foo bar' }],
      },
    ];
    const result = maybeEmitAzureOpenAiWarning(testSuite, tests);
    expect(result).toBe(false);
  });

  it('should not emit warning when Azure provider is used alone, but no model graded eval', () => {
    const testSuite: TestSuite = {
      providers: [new AzureOpenAiCompletionProvider('foo')],
      defaultTest: {},
      prompts: [],
    };
    const tests: TestCase[] = [
      {
        assert: [{ type: 'equals' }],
      },
    ];
    const result = maybeEmitAzureOpenAiWarning(testSuite, tests);
    expect(result).toBe(false);
  });

  it('should emit warning when Azure provider is used alone, but with model graded eval', () => {
    const testSuite: TestSuite = {
      providers: [new AzureOpenAiCompletionProvider('foo')],
      defaultTest: {},
      prompts: [],
    };
    const tests: TestCase[] = [
      {
        assert: [{ type: 'llm-rubric', value: 'foo bar' }],
      },
    ];
    const result = maybeEmitAzureOpenAiWarning(testSuite, tests);
    expect(result).toBe(true);
  });

  it('should emit warning when Azure provider used with non-OpenAI provider', () => {
    const testSuite: TestSuite = {
      providers: [
        new AzureOpenAiCompletionProvider('foo'),
        new HuggingfaceTextGenerationProvider('bar'),
      ],
      defaultTest: {},
      prompts: [],
    };
    const tests: TestCase[] = [
      {
        assert: [{ type: 'llm-rubric', value: 'foo bar' }],
      },
    ];
    const result = maybeEmitAzureOpenAiWarning(testSuite, tests);
    expect(result).toBe(true);
  });

  it('should not emit warning when Azure providers are used with a default provider set', () => {
    const testSuite: TestSuite = {
      providers: [new AzureOpenAiCompletionProvider('foo')],
      defaultTest: { options: { provider: 'azureopenai:....' } },
      prompts: [],
    };
    const tests: TestCase[] = [
      {
        assert: [{ type: 'llm-rubric', value: 'foo bar' }],
      },
    ];
    const result = maybeEmitAzureOpenAiWarning(testSuite, tests);
    expect(result).toBe(false);
  });

  it('should not emit warning when both Azure and OpenAI providers are used', () => {
    const testSuite: TestSuite = {
      providers: [new AzureOpenAiCompletionProvider('foo'), new OpenAiCompletionProvider('bar')],
      defaultTest: {},
      prompts: [],
    };
    const tests: TestCase[] = [
      {
        assert: [{ type: 'llm-rubric', value: 'foo bar' }],
      },
    ];
    const result = maybeEmitAzureOpenAiWarning(testSuite, tests);
    expect(result).toBe(false);
  });
});
