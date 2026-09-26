import { AnthropicMessagesProvider } from './messages';

import type { EnvOverrides } from '../../types/env';
import type { DefaultProviders, ProviderResponse } from '../../types/index';

// Default model to use for all default providers
export const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-5';

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

/**
 * Gets all default Anthropic providers with the given environment overrides
 * @param env - Optional environment overrides
 * @returns Anthropic provider implementations for various functions
 */
export function getAnthropicProviders(
  env?: EnvOverrides,
): Pick<
  DefaultProviders,
  | 'gradingJsonProvider'
  | 'gradingProvider'
  | 'llmRubricProvider'
  | 'suggestionsProvider'
  | 'synthesizeProvider'
  | 'webSearchProvider'
> {
  // SDK clients capture credentials and headers at construction. Each bundle belongs
  // to its caller's environment, including when explicit overrides are omitted.
  const gradingProvider = new AnthropicMessagesProvider(DEFAULT_ANTHROPIC_MODEL, { env });
  const llmRubricProvider = new AnthropicLlmRubricProvider(DEFAULT_ANTHROPIC_MODEL, { env });
  const webSearchProvider = new AnthropicMessagesProvider(DEFAULT_ANTHROPIC_MODEL, {
    env,
    config: {
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 } as any],
    },
  });

  return {
    gradingJsonProvider: gradingProvider,
    gradingProvider,
    llmRubricProvider,
    suggestionsProvider: gradingProvider,
    synthesizeProvider: gradingProvider,
    webSearchProvider,
  };
}
