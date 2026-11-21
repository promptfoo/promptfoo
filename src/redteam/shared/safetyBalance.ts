import { sampleArray } from '../../util/generation';
import invariant from '../../util/invariant';

import type { PluginConfig } from '../types';

export function readIncludeSafe(config?: PluginConfig): boolean {
  invariant(
    config?.includeSafe === undefined || typeof config.includeSafe === 'boolean',
    'includeSafe must be a boolean',
  );
  return config?.includeSafe ?? false;
}

export function sampleBalancedSafetyRecords<T>(
  safeRecords: T[],
  unsafeRecords: T[],
  limit: number,
): T[] {
  if (limit <= 0) {
    return [];
  }

  const unsafeTarget = Math.ceil(limit / 2);
  const safeTarget = limit - unsafeTarget;
  const selected = [
    ...sampleArray(safeRecords, safeTarget),
    ...sampleArray(unsafeRecords, unsafeTarget),
  ];

  if (selected.length < limit) {
    const selectedRecords = new Set(selected);
    const remainingRecords = [...safeRecords, ...unsafeRecords].filter(
      (record) => !selectedRecords.has(record),
    );
    selected.push(...sampleArray(remainingRecords, limit - selected.length));
  }

  return sampleArray(selected, selected.length);
}
