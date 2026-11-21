import { AsyncLocalStorage } from 'node:async_hooks';

import logger from '../logger';
import { BaseTokenUsageSchema, type TokenUsage } from '../types/shared';
import { sanitizeProviderIdForLog } from './provider';
import {
  accumulateResponseTokenUsage,
  accumulateTokenUsage,
  createEmptyTokenUsage,
} from './tokenUsageUtils';

// CLI hooks and package callers can mix CJS and ESM copies. Share the
// async context and result lookup while keeping totals local to each run.
const USAGE = Symbol.for('promptfoo.tokenUsage.v1');
type Totals = Map<string, TokenUsage>;
type UsageState = {
  active: AsyncLocalStorage<{ totals?: Totals }>;
  finished: WeakMap<object, Totals>;
};
const shared = globalThis as { [USAGE]?: UsageState };
const usage: UsageState = (shared[USAGE] ??= {
  active: new AsyncLocalStorage(),
  finished: new WeakMap(),
});

/** Own provider accounting for one evaluation, including its async cleanup. */
export async function withTokenUsageTracking<T extends object>(run: () => Promise<T>): Promise<T> {
  const totals: Totals = new Map();
  const state: { totals?: Totals } = { totals };
  try {
    const evaluation = await usage.active.run(state, run);
    usage.finished.set(evaluation, totals);
    return evaluation;
  } finally {
    // Timed-out provider work can outlive the evaluation and inherit its context.
    state.totals = undefined;
  }
}

export function getProviderTokenUsage(evaluation: object): ReadonlyMap<string, TokenUsage> {
  return structuredClone(usage.finished.get(evaluation) ?? new Map());
}

/** Add incurred tokens and cache hits to this evaluation's provider totals. */
export function trackResponseUsage(
  providerId: string,
  response: { cached?: boolean; tokenUsage?: TokenUsage } | undefined,
): void {
  const totals = usage.active.getStore()?.totals;
  if (!totals || !response) {
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
  const current = totals.get(providerId) ?? createEmptyTokenUsage();
  const updated = { ...current };
  const accounting = createEmptyTokenUsage();
  accumulateResponseTokenUsage(accounting, { cached: response.cached, tokenUsage });
  accumulateTokenUsage(updated, {
    ...(accounting.incurredTokenUsage ?? accounting),
    cached: accounting.cached,
  });
  totals.set(providerId, updated);
  logger.debug(
    `Tracked response usage for ${sanitizeProviderIdForLog(providerId)}: total=${tokenUsage?.total ?? 0}, cached=${tokenUsage?.cached ?? 0}`,
  );
}
