import { isGpt6Model } from './openai/gpt6';
import { shouldDefaultToOpenAiResponses } from './openai/routing';

const NON_BASE_MODEL_PROVIDERS = ['http', 'ws', 'mcp', 'n8n', 'https', 'webhook', 'file', 'exec'];

export const isFoundationModelProvider = (providerId: string) => {
  return !NON_BASE_MODEL_PROVIDERS.some((provider) => providerId.startsWith(provider));
};

/** Token-limit field for native OpenAI and Azure targets in the configuration editor. */
export function getOpenAiTokenLimitField(
  providerId: string,
  config?: Record<string, unknown>,
): 'max_output_tokens' | 'max_completion_tokens' | undefined {
  const [family, subtype = '', deployment] = providerId.split(':', 3);
  const isAzure = family === 'azure' || family === 'azureopenai';
  if (
    (family === 'openai' && (subtype === 'responses' || shouldDefaultToOpenAiResponses(subtype))) ||
    (isAzure && subtype === 'responses')
  ) {
    return 'max_output_tokens';
  }
  if (
    subtype === 'chat' &&
    ((family === 'openai' && isGpt6Model(deployment ?? config?.model)) ||
      (isAzure && isGpt6Model(config?.modelName ?? deployment)))
  ) {
    return 'max_completion_tokens';
  }
  return undefined;
}

export const FILE_METADATA_KEY = '_promptfooFileMetadata';

/**
 * Identifier for manual user ratings in componentResults.
 * Used to distinguish human ratings from automated assertions.
 */
export const HUMAN_ASSERTION_TYPE = 'human' as const;
