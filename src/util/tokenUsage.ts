import { AsyncLocalStorage } from 'node:async_hooks';

import logger from '../logger';
import { BaseTokenUsageSchema, type TokenUsage } from '../types/shared';
import { sanitizeProviderIdForLog } from './provider';
import {
  accumulateResponseTokenUsage,
  accumulateTokenUsage,
  createEmptyTokenUsage,
} from './tokenUsageUtils';

const evaluationUsage = new WeakMap<object, Map<string, TokenUsage>>();
const activeUsage = new AsyncLocalStorage<{
  providers: Map<string, TokenUsage>;
  active: boolean;
}>();

/** Own provider accounting for one evaluation, including its async cleanup. */
export async function withTokenUsageTracking<T extends object>(run: () => Promise<T>): Promise<T> {
  const state = { providers: new Map<string, TokenUsage>(), active: true };
  try {
    const evaluation = await activeUsage.run(state, run);
    evaluationUsage.set(evaluation, state.providers);
    return evaluation;
  } finally {
    // Timed-out provider work can outlive the evaluation and inherit its context.
    state.active = false;
  }
}

export function getProviderTokenUsage(evaluation: object): ReadonlyMap<string, TokenUsage> {
  return structuredClone(evaluationUsage.get(evaluation) ?? new Map());
}

/** Add incurred tokens and cache hits to this evaluation's provider totals. */
export function trackResponseUsage(
  providerId: string,
  response: { cached?: boolean; tokenUsage?: TokenUsage } | undefined,
): void {
  const state = activeUsage.getStore();
  if (!state?.active || !response) {
    return;
  }
  let tokenUsage: TokenUsage | undefined;
  try {
    const rawTokenUsage = response.tokenUsage;
    if (rawTokenUsage) {
      const parsedTokenUsage = BaseTokenUsageSchema.safeParse(rawTokenUsage);
      if (parsedTokenUsage.success) {
        tokenUsage = parsedTokenUsage.data;
      }
    }
  } catch {
    tokenUsage = undefined;
  }
  const current = state.providers.get(providerId) ?? createEmptyTokenUsage();
  const updated = { ...current };
  const accounting = createEmptyTokenUsage();
  accumulateResponseTokenUsage(accounting, { cached: response.cached, tokenUsage });
  accumulateTokenUsage(updated, {
    ...(accounting.incurredTokenUsage ?? accounting),
    cached: accounting.cached,
  });
  state.providers.set(providerId, updated);
  logger.debug(
    `Tracked response usage for ${sanitizeProviderIdForLog(providerId)}: total=${tokenUsage?.total ?? 0}, cached=${tokenUsage?.cached ?? 0}`,
  );
}
