import { AzureOpenAiCompletionProvider } from '../src/providers/azureopenai';
import { AzureOpenAiGenericProvider } from '../src/providers/azureopenai';
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

describe('AzureOpenAiGenericProvider', () => {
  describe('getApiBaseUrl', () => {
    beforeEach(() => {
      delete process.env.AZURE_OPENAI_API_HOST;
    });

    it('should return apiBaseUrl if set', () => {
      const provider = new AzureOpenAiGenericProvider('test-deployment', {
        config: { apiBaseUrl: 'https://custom.azure.com' },
      });
      expect(provider.getApiBaseUrl()).toBe('https://custom.azure.com');
    });

    it('should return apiBaseUrl without trailing slash if set', () => {
      const provider = new AzureOpenAiGenericProvider('test-deployment', {
        config: { apiBaseUrl: 'https://custom.azure.com/' },
      });
      expect(provider.getApiBaseUrl()).toBe('https://custom.azure.com');
    });

    it('should construct URL from apiHost without protocol', () => {
      const provider = new AzureOpenAiGenericProvider('test-deployment', {
        config: { apiHost: 'api.azure.com' },
      });
      expect(provider.getApiBaseUrl()).toBe('https://api.azure.com');
    });

    it('should remove protocol from apiHost if present', () => {
      const provider = new AzureOpenAiGenericProvider('test-deployment', {
        config: { apiHost: 'https://api.azure.com' },
      });
      expect(provider.getApiBaseUrl()).toBe('https://api.azure.com');
    });

    it('should remove trailing slash from apiHost if present', () => {
      const provider = new AzureOpenAiGenericProvider('test-deployment', {
        config: { apiHost: 'api.azure.com/' },
      });
      expect(provider.getApiBaseUrl()).toBe('https://api.azure.com');
    });

    it('should return undefined if neither apiBaseUrl nor apiHost is set', () => {
      const provider = new AzureOpenAiGenericProvider('test-deployment', {});
      expect(provider.getApiBaseUrl()).toBeUndefined();
    });
  });
});
