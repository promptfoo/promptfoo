import { ProviderProgressSchema } from '../contracts/providers';
import logger from '../logger';

import type { EvalProviderProgress, ProviderProgress } from '../contracts/providers';

/** A bounded observer must never make a successful provider operation fail. */
export function createProviderProgressReporter({
  provider,
  testIdx,
  promptIdx,
  callback,
  silent,
}: {
  provider: string;
  testIdx: number;
  promptIdx: number;
  callback?: (progress: EvalProviderProgress, completed: boolean) => void;
  silent?: boolean;
}) {
  const identity = { provider: provider.slice(0, 200), testIdx, promptIdx };
  let last: EvalProviderProgress | undefined;
  let emittedAt = -Infinity;
  let loggedAt = -Infinity;
  let closed = false;
  const notify = (progress: EvalProviderProgress, completed: boolean) => {
    try {
      const pending = callback?.(progress, completed);
      void Promise.resolve(pending).catch(() => {
        logger.debug('Provider progress observer failed');
      });
    } catch {
      logger.debug('Provider progress observer failed');
    }
  };
  return {
    update(update: ProviderProgress) {
      if (closed) {
        return;
      }
      const parsed = ProviderProgressSchema.safeParse(update);
      if (!parsed.success) {
        return;
      }
      const now = Date.now();
      const changedPhase = parsed.data.phase !== last?.phase;
      last = { ...parsed.data, ...identity };
      if (changedPhase || now - emittedAt >= 500) {
        emittedAt = now;
        notify(last, false);
      }
      if (!silent && (changedPhase || now - loggedAt >= 10_000)) {
        loggedAt = now;
        const elapsed =
          last.elapsedMs === undefined ? '' : ` (${Math.round(last.elapsedMs / 1000)}s)`;
        const cost =
          last.estimatedCostUsd === undefined
            ? ''
            : `, estimated $${last.estimatedCostUsd.toFixed(4)}`;
        logger.info(`[${identity.provider}, case ${testIdx + 1}] ${last.phase}${elapsed}${cost}`);
      }
    },
    close() {
      if (closed) {
        return;
      }
      closed = true;
      if (last) {
        notify(last, true);
      }
    },
  };
}
