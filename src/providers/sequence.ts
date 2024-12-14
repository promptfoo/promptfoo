import logger from '../logger';
import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderOptions,
  ProviderResponse,
} from '../types';
import invariant from '../util/invariant';
import { getNunjucksEngine } from '../util/templates';

interface SequenceProviderConfig {
  inputs?: string[];
  separator?: string;
  targetProvider?: string;
  strategy?: string;
  maxTurns?: number;
  systemPrompt?: string;
}

export class SequenceProvider implements ApiProvider {
  private readonly inputs: string[];
  private readonly separator: string;
  private readonly identifier: string;
  private readonly targetProvider?: ApiProvider;
  private readonly strategy?: string;
  private readonly maxTurns?: number;
  private readonly systemPrompt?: string;

  constructor({ id, config, provider }: ProviderOptions) {
    invariant(config, 'Expected sequence provider config');

    const typedConfig = config as SequenceProviderConfig;
    this.inputs = typedConfig.inputs || [];
    this.separator = typedConfig.separator || '\n---\n';
    this.identifier = id || 'sequence-provider';
    this.targetProvider = provider;
    this.strategy = typedConfig.strategy;
    this.maxTurns = typedConfig.maxTurns;
    this.systemPrompt = typedConfig.systemPrompt;
  }

  id() {
    return this.identifier;
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const provider = context?.originalProvider || this.targetProvider;
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
