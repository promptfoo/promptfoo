import invariant from '../util/invariant';

import type { AssertionValue } from '../types/index';

function toReferenceText(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  // YAML and CSV turn values like `2024` or `0.5` into numbers. Compare them as
  // the text they were written as; non-finite numbers are not valid references.
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

/**
 * Normalizes the expected value of a text-similarity assertion (BLEU, GLEU,
 * METEOR) to a list of reference strings. Accepts a string, a finite number, or
 * an array of them.
 */
export function getTextReferences(value: AssertionValue | undefined, message: string): string[] {
  const items = Array.isArray(value) ? value : [value];
  const references = items.map(toReferenceText);
  invariant(
    references.every((reference) => reference !== undefined),
    message,
  );
  return references as string[];
}

/** Single-reference variant, for assertions such as ROUGE that take one string. */
export function getTextReference(value: AssertionValue | undefined, message: string): string {
  const reference = toReferenceText(value);
  invariant(reference !== undefined, message);
  return reference;
}
