import { sampleArray } from '../../util/generation';

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
