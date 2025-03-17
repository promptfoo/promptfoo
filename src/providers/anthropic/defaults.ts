import logger from '../../logger';
import type { ProviderResponse } from '../../types';
import type { EnvOverrides } from '../../types/env';
import type { ProviderConfiguration } from '../../types/providerConfig';
import type { DefaultProviders } from '../../types/providerConfig';
import { OpenAiEmbeddingProvider } from '../openai/embedding';
import { OpenAiModerationProvider } from '../openai/moderation';
import { AnthropicMessagesProvider } from './messages';

// Default model to use for all default providers
export const DEFAULT_ANTHROPIC_MODEL = 'claude-3-7-sonnet-20250219';

// Default OpenAI embedding model to use
export const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-large';

/**
 * Helper function to create a lazy-loaded provider. This allows the .env file to be
 * loaded first before the provider is initialized.
 * @param factory Factory function that creates provider instance with optional env
 * @returns Object with getter that lazily initializes the provider with the latest env
 */
function createLazyProvider<T>(factory: (env?: EnvOverrides) => T): {
  getInstance: (env?: EnvOverrides) => T;
} {
  const instances = new Map<string, T>();

  return {
    getInstance(env?: EnvOverrides) {
      // Use a simple cache key strategy - empty string for undefined env
      const cacheKey = env ? JSON.stringify(env) : '';

      if (!instances.has(cacheKey)) {
        instances.set(cacheKey, factory(env));
      }
      return instances.get(cacheKey)!;
    },
  };
}

// LLM Rubric Provider
export class AnthropicLlmRubricProvider extends AnthropicMessagesProvider {
  constructor(
    modelName: string,
    options: { env?: EnvOverrides; config?: Record<string, any> } = {},
  ) {
    const { env, config = {} } = options;
    super(modelName, {
      env,
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
        ...config,
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

// Private provider factories with lazy loading
const gradingProviderFactory = createLazyProvider(
  (env?: EnvOverrides) => new AnthropicMessagesProvider(DEFAULT_ANTHROPIC_MODEL, { env }),
);

const llmRubricProviderFactory = createLazyProvider(
  (env?: EnvOverrides) => new AnthropicLlmRubricProvider(DEFAULT_ANTHROPIC_MODEL, { env }),
);

/**
 * Anthropic provider configuration
 */
export const AnthropicProviderConfig: ProviderConfiguration = (env) => {
  logger.debug('Using Anthropic default providers');

  // Get providers with the provided environment variables
  const gradingProvider = gradingProviderFactory.getInstance(env);
  const llmRubricProvider = llmRubricProviderFactory.getInstance(env);

  return {
    datasetGenerationProvider: gradingProvider,
    embeddingProvider: new OpenAiEmbeddingProvider(DEFAULT_EMBEDDING_MODEL, { env }),
    gradingJsonProvider: gradingProvider,
    gradingProvider,
    llmRubricProvider,
    moderationProvider: new OpenAiModerationProvider('omni-moderation-latest'), // No native moderation, fallback to OpenAI
    suggestionsProvider: gradingProvider,
    synthesizeProvider: gradingProvider,
  };
};

/**
 * Gets all default Anthropic providers with the given environment overrides
 * @deprecated Use AnthropicProviderConfig instead
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
  // Get providers with the provided environment variables
  const gradingProvider = gradingProviderFactory.getInstance(env);
  const llmRubricProvider = llmRubricProviderFactory.getInstance(env);

  return {
    datasetGenerationProvider: gradingProvider,
    gradingJsonProvider: gradingProvider,
    gradingProvider,
    llmRubricProvider,
    suggestionsProvider: gradingProvider,
    synthesizeProvider: gradingProvider,
  };
}
