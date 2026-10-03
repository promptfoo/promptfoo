import { resolveProviderCreatorInput } from './creator';
import { OpenAiChatCompletionProvider } from './openai/chat';
import { splitLocalOptions } from './openai/localOptions';

import type { ApiProvider, CallApiContextParams, CallApiOptionsParams } from '../types/index';
import type { ProviderCreatorOptions } from './creator';

class CerebrasProvider extends OpenAiChatCompletionProvider {
  override getOrganization(): string | undefined {
    return this.config.organization;
  }

  override async getOpenAiBody(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ) {
    const { body, config } = await super.getOpenAiBody(prompt, context, callApiOptions);

    // Cerebras accepts only one token-limit parameter.
    if (body.max_completion_tokens) {
      delete body.max_tokens;
    }

    return { body, config };
  }
}

/** Creates a Cerebras chat provider, keeping transport settings out of the request body. */
export function createCerebrasProvider(
  providerPath: string,
  options: ProviderCreatorOptions = {},
): ApiProvider {
  const providerOptions = resolveProviderCreatorInput(options);
  const splits = providerPath.split(':');
  const modelName = splits.slice(1).join(':');

  const config = providerOptions.config || {};
  const { localOptions, modelParameters } = splitLocalOptions(config);

  const cerebrasConfig = {
    ...providerOptions,
    config: {
      ...localOptions,
      apiBaseUrl: localOptions.apiBaseUrl || 'https://api.cerebras.ai/v1',
      apiKeyEnvar: localOptions.apiKeyEnvar || 'CEREBRAS_API_KEY',
      passthrough: { ...modelParameters, ...config.passthrough },
    },
  };

  return new CerebrasProvider(modelName, cerebrasConfig);
}
