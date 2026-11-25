import logger from '../logger';
import invariant from '../util/invariant';
import { getNunjucksEngine } from '../util/templates';
import { accumulateResponseTokenUsage, createEmptyTokenUsage } from '../util/tokenUsageUtils';

import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderOptions,
  ProviderResponse,
} from '../types/index';

interface SequenceProviderConfig {
  inputs: string[];
  separator?: string;
}

export class SequenceProvider implements ApiProvider {
  private readonly sequenceInputs: string[];
  private readonly separator: string;
  private readonly identifier: string;

  constructor({ id, config }: ProviderOptions) {
    invariant(
      config && Array.isArray(config.inputs),
      'Expected sequence provider config to contain an array of inputs',
    );

    const typedConfig = config as SequenceProviderConfig;
    this.sequenceInputs = typedConfig.inputs;
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
    let cost: number | undefined;
    let incurredCost: number | undefined;

    // Totals across every step sent so far, so a failure keeps what earlier steps cost.
    // The step's own cost fields are replaced, never left beside the totals.
    const withTotals = (response: ProviderResponse): ProviderResponse => {
      const { cost: _stepCost, incurredCost: _stepIncurredCost, ...rest } = response;
      return {
        ...rest,
        tokenUsage: accumulatedTokenUsage,
        ...(cost !== undefined && { cost }),
        ...(incurredCost !== undefined && incurredCost !== cost && { incurredCost }),
      };
    };

    // Send each input to the original provider
    for (const input of this.sequenceInputs) {
      const renderedInput = nunjucks.renderString(input, {
        ...context?.vars,
        prompt,
      });

      logger.debug(`Sequence provider sending input: ${renderedInput}`);

      const response = await context.originalProvider.callApi(renderedInput, context, options);

      accumulateResponseTokenUsage(accumulatedTokenUsage, response);
      if (response.cost !== undefined) {
        cost = (cost ?? 0) + response.cost;
        incurredCost =
          (incurredCost ?? 0) + (response.incurredCost ?? (response.cached ? 0 : response.cost));
      }

      if (response.error) {
        return withTotals(response);
      }

      responses.push(response.output);
    }

    return withTotals({ output: responses.join(this.separator) });
  }

  toString() {
    return `[Sequence Provider]`;
  }
}
