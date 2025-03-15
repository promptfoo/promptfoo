import type { ApiProvider, ProviderResponse } from '../../types';
import type { EnvOverrides } from '../../types/env';
import { AnthropicMessagesProvider } from './messages';
import { DEFAULT_ANTHROPIC_MODEL, createLazyProvider } from './types';

// LLM Rubric Provider
export class AnthropicLlmRubricProvider extends AnthropicMessagesProvider {
  constructor(modelName: string) {
    super(modelName, {
      config: {
        tool_choice: { type: 'tool', name: 'grade_output' },
        tools: [
          {
            name: 'grade_output',
            description: 'Grade the given output based on specific criteria',
            input_schema: {
              type: 'object',
              properties: {
                pass: {
                  type: 'boolean',
                  description: 'Whether the output passes the criteria',
                },
                score: {
                  type: 'number',
                  description: 'The score assigned to the output',
                },
                reason: {
                  type: 'string',
                  description: 'The reason for the given grade',
                },
              },
              required: ['pass', 'score', 'reason'],
            },
          },
        ],
      },
    });
  }

  async callApi(prompt: string): Promise<ProviderResponse> {
    const result = await super.callApi(prompt);
    if (typeof result.output !== 'string') {
      return {
        error: `Anthropic LLM rubric grader - malformed non-string output\n\n${JSON.stringify(result.output)}`,
      };
    }
    try {
      const functionCall = JSON.parse(result.output) as {
        type: 'tool_use';
        id: string;
        name: 'grade_output';
        input: {
          pass: boolean;
          score: number;
          reason: string;
        };
      };
      return {
        output: functionCall.input,
      };
    } catch (err) {
      return {
        error: `Anthropic LLM rubric grader - invalid JSON: ${err}\n\n${result.output}`,
      };
    }
  }
}

// Factory functions for creating providers
export function getDefaultGradingProvider(): AnthropicMessagesProvider {
  return new AnthropicMessagesProvider(DEFAULT_ANTHROPIC_MODEL);
}

export function getDefaultGradingJsonProvider(): AnthropicMessagesProvider {
  return new AnthropicMessagesProvider(DEFAULT_ANTHROPIC_MODEL);
}

export function getDefaultSuggestionsProvider(): AnthropicMessagesProvider {
  return new AnthropicMessagesProvider(DEFAULT_ANTHROPIC_MODEL);
}

export function getDefaultLlmRubricProvider(): AnthropicLlmRubricProvider {
  return new AnthropicLlmRubricProvider(DEFAULT_ANTHROPIC_MODEL);
}

// Cache objects for each provider type
const gradingProviderCache = { value: undefined as AnthropicMessagesProvider | undefined };
const gradingJsonProviderCache = { value: undefined as AnthropicMessagesProvider | undefined };
const suggestionsProviderCache = { value: undefined as AnthropicMessagesProvider | undefined };
const llmRubricProviderCache = { value: undefined as AnthropicLlmRubricProvider | undefined };

// Lazy-loaded providers
export const DefaultGradingProvider = createLazyProvider(
  getDefaultGradingProvider,
  gradingProviderCache,
);

export const DefaultGradingJsonProvider = createLazyProvider(
  getDefaultGradingJsonProvider,
  gradingJsonProviderCache,
);

export const DefaultSuggestionsProvider = createLazyProvider(
  getDefaultSuggestionsProvider,
  suggestionsProviderCache,
);

export const DefaultLlmRubricProvider = createLazyProvider(
  getDefaultLlmRubricProvider,
  llmRubricProviderCache,
);

/**
 * Helper function to get all Anthropic providers
 * @param env - Optional environment overrides
 * @returns Anthropic provider implementations for various functions
 */
export function getAnthropicProviders(env?: EnvOverrides): {
  datasetGenerationProvider: ApiProvider;
  gradingJsonProvider: ApiProvider;
  gradingProvider: ApiProvider;
  llmRubricProvider: ApiProvider;
  suggestionsProvider: ApiProvider;
  synthesizeProvider: ApiProvider;
} {
  return {
    datasetGenerationProvider: getDefaultGradingProvider(),
    gradingJsonProvider: getDefaultGradingJsonProvider(),
    gradingProvider: getDefaultGradingProvider(),
    llmRubricProvider: getDefaultLlmRubricProvider(),
    suggestionsProvider: getDefaultSuggestionsProvider(),
    synthesizeProvider: getDefaultGradingJsonProvider(),
  };
}
