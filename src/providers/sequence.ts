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

function getResponseGuardrails(response: ProviderResponse): ProviderResponse['guardrails'] {
  const history = response.metadata?.redteamHistory;
  return (
    response.guardrails ||
    (Array.isArray(history) ? history[history.length - 1]?.guardrails : undefined)
  );
}

function mergeGuardrails(
  current: ProviderResponse['guardrails'],
  next: ProviderResponse['guardrails'],
): ProviderResponse['guardrails'] {
  if (!current) {
    return next ? { ...next } : undefined;
  }
  if (!next) {
    return current;
  }

  const flagged = current.flagged === true || next.flagged === true;
  const reason = flagged
    ? ((current.flagged === true ? current.reason : undefined) ??
      (next.flagged === true ? next.reason : undefined))
    : (current.reason ?? next.reason);

  return {
    flagged,
    flaggedInput: current.flaggedInput === true || next.flaggedInput === true,
    flaggedOutput: current.flaggedOutput === true || next.flaggedOutput === true,
    ...(reason !== undefined && { reason }),
  };
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
    let allStepsCached = true;
    let accumulatedCost: number | undefined;
    let accumulatedIncurredCost: number | undefined;
    let accumulatedGuardrails: ProviderResponse['guardrails'];

    // Send each input to the original provider
    for (const input of this.sequenceInputs) {
      const renderedInput = nunjucks.renderString(input, {
        ...context?.vars,
        prompt,
      });

      logger.debug(`Sequence provider sending input: ${renderedInput}`);

      const response = await context.originalProvider.callApi(renderedInput, context, options);

      allStepsCached &&= response.cached === true;
      accumulateResponseTokenUsage(accumulatedTokenUsage, response);
      if (response.cost !== undefined && Number.isFinite(response.cost)) {
        accumulatedCost = (accumulatedCost ?? 0) + response.cost;
      }
      const responseIncurredCost = response.incurredCost ?? (response.cached ? 0 : response.cost);
      if (responseIncurredCost !== undefined && Number.isFinite(responseIncurredCost)) {
        accumulatedIncurredCost = (accumulatedIncurredCost ?? 0) + responseIncurredCost;
      }
      accumulatedGuardrails = mergeGuardrails(
        accumulatedGuardrails,
        getResponseGuardrails(response),
      );

      if (response.error) {
        return {
          ...response,
          cached: allStepsCached,
          tokenUsage: accumulatedTokenUsage,
          cost: accumulatedCost,
          incurredCost: accumulatedIncurredCost,
          ...(accumulatedGuardrails && { guardrails: accumulatedGuardrails }),
        };
      }

      responses.push(response.output);
    }

    return {
      output: responses.join(this.separator),
      tokenUsage: accumulatedTokenUsage,
      ...(accumulatedCost !== undefined && { cost: accumulatedCost }),
      ...(accumulatedIncurredCost !== undefined && { incurredCost: accumulatedIncurredCost }),
      ...(accumulatedGuardrails && { guardrails: accumulatedGuardrails }),
    };
  }

  toString() {
    return `[Sequence Provider]`;
  }
}
