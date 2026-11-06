import type { ObservationEvidence, Verdict } from './types';

export type DetailOrder = 'problems-first' | 'input-order';
interface DetailSelection<T> {
  items: T[];
  omitted: number;
}

/**
 * Select report details deterministically without mutating the complete ledger.
 * Problem-first order keeps a truncated artifact useful when failures occur
 * after thousands of passing observations. Within each priority bucket the
 * original plan order remains stable, so repeated rendering is reproducible.
 */
export function selectDetails<T>(
  items: readonly T[],
  limit: number,
  order: DetailOrder,
  priority: (item: T) => number,
): DetailSelection<T> {
  if (!Number.isSafeInteger(limit) || limit < 0) {
    throw new Error('Detail limit must be a nonnegative safe integer');
  }
  if (order !== 'input-order' && order !== 'problems-first') {
    throw new Error('Detail order must be input-order or problems-first');
  }
  if (limit === 0) {
    return { items: [], omitted: items.length };
  }
  if (order === 'input-order') {
    const selected = items.slice(0, limit);
    return { items: selected, omitted: items.length - selected.length };
  }
  // At most three linear scans, without allocating or sorting an unbounded
  // secondary array of all details. The analysis already caps ledger size.
  const selected: T[] = [];
  for (let bucket = 0; bucket < 3 && selected.length < limit; bucket++) {
    for (const item of items) {
      const rank = priority(item);
      if (!Number.isInteger(rank) || rank < 0 || rank > 2) {
        throw new Error('Invalid internal detail priority');
      }
      if (rank === bucket) {
        selected.push(item);
        if (selected.length === limit) {
          break;
        }
      }
    }
  }
  return { items: selected, omitted: items.length - selected.length };
}

export function verdictPriority(verdict: Verdict): number {
  switch (verdict) {
    case 'fail':
      return 0;
    case 'inconclusive':
      return 1;
    case 'pass':
      return 2;
  }
}

export function observationPriority(observation: ObservationEvidence): number {
  switch (observation.sourceStatus) {
    case 'assertion-failed':
    case 'execution-failed':
      return 0;
    case 'unknown':
    case 'missing':
      return 1;
    case 'passed':
      return observation.outputAvailable ? 2 : 1;
  }
}
