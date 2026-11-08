import type { WorkBudget } from './limits';

/**
 * Native identity strings are copied/hashed for grouping. Charge them before
 * building keys, even for rows outside the selected panel. Inspection and
 * analysis share the same bounds so a structurally invalid identity cannot
 * become an accepted logical match through a different entry point.
 */
export function boundedIdentityString(
  value: unknown,
  maxLength: number,
  work: WorkBudget,
): value is string {
  if (typeof value !== 'string' || value.length > maxLength) {
    return false;
  }
  work.spend(value.length);
  return true;
}
