import type { DefaultProviders, ProviderResponse } from '../../types';
import type { EnvOverrides } from '../../types/env';
import { AnthropicMessagesProvider } from './messages';

// Default model to use for all default providers
export const DEFAULT_ANTHROPIC_MODEL = 'claude-3-7-sonnet-20250219';

/**
 * Helper function to create a lazy-loaded provider
 * @param factory Factory function to create provider instance
 * @returns Object with getter that lazily initializes the provider
 */
function createLazyProvider<T>(factory: () => T): { instance: T } {
  let cachedInstance: T | undefined;
  return {
    get instance() {
      if (!cachedInstance) {
        cachedInstance = factory();
      }
      return cachedInstance;
    },
  };
}

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

// Direct exports with lazy loading
export const DefaultGradingProvider = createLazyProvider(
  () => new AnthropicMessagesProvider(DEFAULT_ANTHROPIC_MODEL),
);

export const DefaultGradingJsonProvider = createLazyProvider(
  () => new AnthropicMessagesProvider(DEFAULT_ANTHROPIC_MODEL),
);

export const DefaultSuggestionsProvider = createLazyProvider(
  () => new AnthropicMessagesProvider(DEFAULT_ANTHROPIC_MODEL),
);

export const DefaultLlmRubricProvider = createLazyProvider(
  () => new AnthropicLlmRubricProvider(DEFAULT_ANTHROPIC_MODEL),
);

/**
 * Helper function to get all Anthropic providers
 * @param env - Optional environment overrides
 * @returns Anthropic provider implementations for various functions
 */
export function getAnthropicProviders(
  env?: EnvOverrides,
): Pick<
  DefaultProviders,
  | 'datasetGenerationProvider'
  | 'gradingJsonProvider'
  | 'gradingProvider'
  | 'llmRubricProvider'
  | 'suggestionsProvider'
  | 'synthesizeProvider'
> {
  return {
    datasetGenerationProvider: DefaultGradingProvider.instance,
    gradingJsonProvider: DefaultGradingJsonProvider.instance,
    gradingProvider: DefaultGradingProvider.instance,
    llmRubricProvider: DefaultLlmRubricProvider.instance,
    suggestionsProvider: DefaultSuggestionsProvider.instance,
    synthesizeProvider: DefaultGradingJsonProvider.instance,
  };
}
