import type { Reporter } from './types';

/**
 * SilentReporter - No-op reporter that produces no output.
 *
 * Useful for:
 * - Programmatic usage where only the return value matters
 * - CI environments where only exit code matters
 * - Testing where you want to suppress output
 *
 * @example
 * ```yaml
 * evaluateOptions:
 *   reporters:
 *     - silent
 * ```
 */
export class SilentReporter implements Reporter {
  // All methods are intentionally no-ops
}
