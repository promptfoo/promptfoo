import logger from '../logger';

/**
 * Retries an operation with deduplication until the target count is reached or max retries are exhausted.
 *
 * @param operation - A function that takes the current items and returns a Promise of new items.
 * @param targetCount - The desired number of unique items to collect.
 * @param maxConsecutiveRetries - Maximum number of consecutive retries allowed when no new items are found. Defaults to 2.
 * @param dedupFn - A function to deduplicate items. Defaults to using a Set for uniqueness.
 * @returns A Promise that resolves to an array of unique items.
 *
 * @typeParam T - The type of items being collected.
 */
export async function retryWithDeduplication<T>(
  operation: (currentItems: T[]) => Promise<T[]>,
  targetCount: number,
  maxConsecutiveRetries: number = 2,
  dedupFn: (items: T[]) => T[] = (items) =>
    Array.from(new Set(items.map((item) => JSON.stringify(item)))).map((item) => JSON.parse(item)),
): Promise<T[]> {
  const allItems: T[] = [];
  let consecutiveRetries = 0;

  while (allItems.length < targetCount && consecutiveRetries <= maxConsecutiveRetries) {
    const newItems = await operation(allItems);

    if (!Array.isArray(newItems)) {
      logger.warn('Operation returned non-iterable result. Skipping this iteration.');
      consecutiveRetries++;
      continue;
    }

    const uniqueNewItems = dedupFn([...allItems, ...newItems]).slice(allItems.length);
    allItems.push(...uniqueNewItems);

    logger.debug(`Added ${uniqueNewItems.length} unique items. Total: ${allItems.length}`);

    if (uniqueNewItems.length === 0) {
      consecutiveRetries++;
      logger.debug(`No new unique items. Consecutive retries: ${consecutiveRetries}`);
    } else {
      consecutiveRetries = 0;
    }
  }

  return allItems;
}

/**
 * Randomly samples n items from an array.
 * If n is greater than the length of the array, the entire array is returned.
 *
 * @param array The array to sample from
 * @param n The number of items to sample
 * @returns A new array with n randomly sampled items
 */
export function sampleArray<T>(array: T[], n: number): T[] {
  logger.debug(`Sampling ${n} items from array of length ${array.length}`);
  const shuffled = array.slice().sort(() => 0.5 - Math.random());
  return shuffled.slice(0, Math.min(n, array.length));
}
