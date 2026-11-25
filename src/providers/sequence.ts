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
    // incurredCost can only differ from cost when a step was cached or reported its own.
    let reportIncurredCost = false;
    let everyStepCached = this.sequenceInputs.length > 0;

    // Totals across every step sent so far, so a failure keeps what earlier steps cost.
    // The step's own cost and cache fields are replaced, never left beside the totals:
    // the sequence counts as cached only when every step it sent was a cache replay.
    const withTotals = (response: ProviderResponse): ProviderResponse => {
      const {
        cost: _stepCost,
        incurredCost: _stepIncurredCost,
        cached: _stepCached,
        ...rest
      } = response;
      return {
        ...rest,
        tokenUsage: accumulatedTokenUsage,
        ...(everyStepCached && { cached: true }),
        ...(cost !== undefined && { cost }),
        ...(incurredCost !== undefined && reportIncurredCost && { incurredCost }),
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
      everyStepCached &&= response.cached === true;
      reportIncurredCost ||= response.cached === true || response.incurredCost !== undefined;
      if (response.cost !== undefined) {
        cost = (cost ?? 0) + response.cost;
      }
      const stepIncurredCost =
        response.incurredCost ??
        (response.cost === undefined || response.cached ? 0 : response.cost);
      if (response.incurredCost !== undefined || response.cost !== undefined) {
        incurredCost = (incurredCost ?? 0) + stepIncurredCost;
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
