import logger from '../logger';
import { loadApiProvider } from '../providers';
import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderDefinition,
  ProviderOptions,
  ProviderResponse,
} from '../types';
import invariant from '../util/invariant';
import { getNunjucksEngine } from '../util/templates';

interface SequenceProviderConfig {
  inputs?: string[];
  separator?: string;
  provider: ProviderDefinition;
}

export class SequenceProvider implements ApiProvider {
  private readonly inputs: string[];
  private readonly separator: string;
  private readonly identifier: string;
  private readonly provider?: ProviderDefinition;

  constructor({ id, config }: ProviderOptions) {
    invariant(config, 'Expected sequence provider config');
    invariant(config.provider, 'Expected sequence provider config to have a provider');

    const typedConfig = config as SequenceProviderConfig;
    this.inputs = typedConfig.inputs || [];
    this.separator = typedConfig.separator || '\n---\n';
    this.identifier = id || 'sequence-provider';
    this.provider = typedConfig.provider;
  }

  id() {
    return this.identifier;
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    // Use originalProvider from context if available, otherwise use configured provider
    const providerToUse = context?.originalProvider || this.provider;
    invariant(providerToUse, 'No provider available for sequence provider');

    // Handle different provider types
    let provider: ApiProvider;
    if (typeof providerToUse === 'function') {
      provider = { id: () => 'function-provider', callApi: providerToUse };
    } else if (
      typeof providerToUse === 'object' &&
      'callApi' in providerToUse &&
      typeof providerToUse.callApi === 'function'
    ) {
      provider = providerToUse as ApiProvider;
    } else if (typeof providerToUse === 'string') {
      provider = await loadApiProvider(providerToUse, {
        options: {
          id: this.identifier,
          config: {
            provider: providerToUse,
          },
        },
      });
    } else {
      throw new Error(`Invalid provider configuration for sequence provider: ${providerToUse}`);
    }

    invariant(provider, 'No provider available for sequence provider');

    const nunjucks = getNunjucksEngine();
    const responses: string[] = [];
    const totalTokenUsage = {
      total: 0,
      prompt: 0,
      completion: 0,
      numRequests: 0,
      cached: 0,
    };

    for (const input of this.inputs) {
      const renderedInput = nunjucks.renderString(input, {
        ...context?.vars,
        prompt,
      });

      logger.debug(`Sequence provider sending input: ${renderedInput}`);

      const response = await provider.callApi(renderedInput, context, options);

      if (response.error) {
        return response;
      }

      responses.push(response.output);

      if (response.tokenUsage) {
        totalTokenUsage.total += response.tokenUsage.total || 0;
        totalTokenUsage.prompt += response.tokenUsage.prompt || 0;
        totalTokenUsage.completion += response.tokenUsage.completion || 0;
        totalTokenUsage.numRequests += response.tokenUsage.numRequests || 1;
        totalTokenUsage.cached += response.tokenUsage.cached || 0;
      } else {
        totalTokenUsage.numRequests += 1;
      }
    }

    return {
      output: responses.join(this.separator),
      tokenUsage: totalTokenUsage,
    };
  }

  toString() {
    return `[Sequence Provider]`;
  }
}
