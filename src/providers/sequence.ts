import logger from '../logger';
import invariant from '../util/invariant';
import { getNunjucksEngine } from '../util/templates';

import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderOptions,
  ProviderResponse,
} from '../types';
import { accumulateResponseTokenUsage, createEmptyTokenUsage } from '../util/tokenUsageUtils';

interface SequenceProviderConfig {
  inputs: string[];
  separator?: string;
}

export class SequenceProvider implements ApiProvider {
  private readonly inputs: string[];
  private readonly separator: string;
  private readonly identifier: string;

  constructor({ id, config }: ProviderOptions) {
    invariant(
      config && Array.isArray(config.inputs),
      'Expected sequence provider config to contain an array of inputs',
    );

    const typedConfig = config as SequenceProviderConfig;
    this.inputs = typedConfig.inputs;
    this.separator = typedConfig.separator || '\n---\n';
    this.identifier = id || 'sequence-provider';
  }

  id() {
    return this.identifier;
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    invariant(context?.originalProvider, 'Expected originalProvider to be set');

    const nunjucks = getNunjucksEngine();
    const responses: string[] = [];
    const accumulatedTokenUsage = createEmptyTokenUsage();

    // Send each input to the original provider
    for (const input of this.inputs) {
      const renderedInput = nunjucks.renderString(input, {
        ...context?.vars,
        prompt,
      });

      logger.debug(`Sequence provider sending input: ${renderedInput}`);

      const response = await context.originalProvider.callApi(renderedInput, context, options);

      if (response.error) {
        return response;
      }

      responses.push(response.output);

      accumulateResponseTokenUsage(accumulatedTokenUsage, response);
    }

    return {
      output: responses.join(this.separator),
      tokenUsage: accumulatedTokenUsage,
    };
  }

  toString() {
    return `[Sequence Provider]`;
  }
}
