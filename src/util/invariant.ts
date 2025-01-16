/**
 * Custom invariant function that preserves error messages in production.
 * Similar to tiny-invariant but always includes the full error message.
 *
 * @example
 * ```ts
 * const value: Person | null = { name: 'Alex' };
 * invariant(value, 'Expected value to be a person');
 * // type of `value` has been narrowed to `Person`
 * ```
 *
 * See https://github.com/alexreardon/tiny-invariant
 */
export default function invariant(
  condition: any,
  message?: string | (() => string),
): asserts condition {
  if (condition) {
    return;
  }

  const prefix = 'Invariant failed';
  const provided = typeof message === 'function' ? message() : message;
  const value = provided ? `${prefix}: ${provided}` : prefix;

  throw new Error(value);
}
