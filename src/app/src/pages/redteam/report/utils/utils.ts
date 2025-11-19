/**
 * Misc. utilities for the report page.
 */

/**
 * Comparator function for sorting objects by ASR in descending order.
 * @param a An object with an `asr` property.
 * @param b An object with an `asr` property.
 * @example
 * .sort(compareByASRDescending)
 */
export function compareByASRDescending(a: { asr: number }, b: { asr: number }): number {
  return b.asr - a.asr;
}
