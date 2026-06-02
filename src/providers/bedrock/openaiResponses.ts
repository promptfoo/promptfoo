import { getEnvString } from '../../envars';
import { OpenAiResponsesProvider } from '../openai/responses';

import type { EnvOverrides } from '../../types/env';
import type { ProviderOptions } from '../../types/providers';

/**
 * OpenAI's frontier models on Amazon Bedrock (gpt-5.5, gpt-5.4, ...) are NOT served
 * through the native `InvokeModel` / `Converse` APIs that back the rest of the `bedrock:`
 * provider. They are only available through Bedrock's OpenAI-compatible **Responses API**
 * on the regional "mantle" endpoint:
 *
 *   https://bedrock-mantle.<region>.api.aws/openai/v1/responses
 *
 * This module routes those model ids to promptfoo's OpenAI Responses provider pointed at
 * that endpoint, so `bedrock:openai.gpt-5.5` produces output identical to the OpenAI
 * Platform `openai:responses:gpt-5.5` provider. The open-weight `gpt-oss` models, by
 * contrast, are served via `InvokeModel` and continue to use the standard Bedrock path.
 */

/** GA region for the OpenAI frontier models on Bedrock; used when none is configured. */
export const DEFAULT_BEDROCK_OPENAI_REGION = 'us-east-2';

/**
 * Whether a Bedrock OpenAI model id is a frontier model served through the Responses API
 * (everything under the `openai.` namespace except the open-weight `gpt-oss` models).
 */
export function isBedrockOpenAiResponsesModel(modelName: string): boolean {
  return modelName.startsWith('openai.') && !modelName.includes('gpt-oss');
}

/** Build the regional Bedrock mantle base URL for the OpenAI-compatible Responses API. */
export function getBedrockMantleBaseUrl(region: string): string {
  return `https://bedrock-mantle.${region}.api.aws/openai/v1`;
}

function resolveRegion(config: Record<string, any>, env?: EnvOverrides): string {
  return (
    config.region ||
    env?.AWS_BEDROCK_REGION ||
    getEnvString('AWS_BEDROCK_REGION') ||
    process.env.AWS_REGION ||
    process.env.AWS_DEFAULT_REGION ||
    DEFAULT_BEDROCK_OPENAI_REGION
  );
}

function resolveApiKey(config: Record<string, any>, env?: EnvOverrides): string | undefined {
  return config.apiKey || env?.AWS_BEARER_TOKEN_BEDROCK || getEnvString('AWS_BEARER_TOKEN_BEDROCK');
}

/**
 * Construct an OpenAI Responses provider configured for a Bedrock frontier model. Resolves
 * the region (config → AWS_BEDROCK_REGION → AWS_REGION → default) and the Amazon Bedrock
 * API key (config.apiKey → AWS_BEARER_TOKEN_BEDROCK), and targets the mantle endpoint
 * unless the caller supplies an explicit `apiBaseUrl`.
 */
export function createBedrockOpenAiResponsesProvider(
  modelName: string,
  providerOptions: ProviderOptions & { id?: string } = {},
): OpenAiResponsesProvider {
  const config: Record<string, any> = providerOptions.config ?? {};
  const region = resolveRegion(config, providerOptions.env);
  const apiKey = resolveApiKey(config, providerOptions.env);

  if (!apiKey) {
    throw new Error(
      `Amazon Bedrock model "${modelName}" is an OpenAI frontier model served through ` +
        `Bedrock's OpenAI-compatible Responses API, which authenticates with an Amazon ` +
        `Bedrock API key. Set the AWS_BEARER_TOKEN_BEDROCK environment variable (or ` +
        `config.apiKey). See https://www.promptfoo.dev/docs/providers/aws-bedrock/#openai-models`,
    );
  }

  const apiBaseUrl = config.apiBaseUrl || getBedrockMantleBaseUrl(region);

  return new OpenAiResponsesProvider(modelName, {
    ...providerOptions,
    config: { ...config, apiBaseUrl, apiKey },
  });
}
