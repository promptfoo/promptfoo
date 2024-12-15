import logger from '../logger';
import { loadApiProvider, loadApiProviders } from '../providers';
import {
  isApiProvider,
  isProviderOptions,
  type ApiProvider,
  type CallApiContextParams,
  type CallApiOptionsParams,
  type ProviderDefinition,
  type ProviderOptions,
  type ProviderResponse,
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
  private readonly targetProvider?: ProviderDefinition;

  constructor({ id, config }: ProviderOptions) {
    invariant(config, 'Expected sequence provider config');
    invariant(config.provider, 'Expected sequence provider config to have a provider');

    const typedConfig = config as SequenceProviderConfig;
    this.inputs = typedConfig.inputs || [];
    this.separator = typedConfig.separator || '\n---\n';
    this.identifier = id || 'sequence-provider';
    this.targetProvider = typedConfig.provider;
  }

  id() {
    return this.identifier;
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    // FIXME(ian): Provider types are totally messed up and we're doing this
    // instead of a 3-part if statement to figure out what type of provider it
    // is.
    let provider;
    if (typeof this.targetProvider === 'string') {
      provider = await loadApiProvider(this.targetProvider, {
        options: {
          id: this.identifier,
          config: {
            provider: this.targetProvider,
          },
        },
      });
    } else if (isProviderOptions(this.targetProvider)) {
      provider = await loadApiProvider(this.targetProvider.config.provider, {
        options: this.targetProvider,
      });
    } else if (isApiProvider(this.targetProvider)) {
      provider = this.targetProvider;
    } else {
      throw new Error(`Sequence provider received invalid provider type: ${this.targetProvider}`);
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
