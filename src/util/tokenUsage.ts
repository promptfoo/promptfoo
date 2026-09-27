import { AsyncLocalStorage } from 'node:async_hooks';

import logger from '../logger';
import { sanitizeProviderIdForLog } from './provider';
import {
  accumulateResponseTokenUsage,
  accumulateTokenUsage,
  createEmptyTokenUsage,
} from './tokenUsageUtils';

import type { TokenUsage } from '../types/shared';

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
  return evaluationUsage.get(evaluation) ?? new Map();
}

/** Retain the response-aware incurred/cached accounting used by provider summaries. */
export function trackResponseUsage(
  providerId: string,
  response: { cached?: boolean; tokenUsage?: TokenUsage } | undefined,
): void {
  const state = activeUsage.getStore();
  if (!state?.active) {
    return;
  }
  const current = state.providers.get(providerId) ?? createEmptyTokenUsage();
  const updated = { ...current };
  const accounting = createEmptyTokenUsage();
  accumulateResponseTokenUsage(accounting, response);
  accumulateTokenUsage(updated, {
    ...(accounting.incurredTokenUsage ?? accounting),
    cached: accounting.cached,
  });
  state.providers.set(providerId, updated);
  logger.debug(
    `Tracked response usage for ${sanitizeProviderIdForLog(providerId)}: total=${response?.tokenUsage?.total ?? 0}, cached=${response?.tokenUsage?.cached ?? 0}`,
  );
}
