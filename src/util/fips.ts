import { getFips } from 'node:crypto';

/** Use the running crypto module, not an eval-configurable environment flag. */
export function isFipsEnabled(): boolean {
  return getFips() === 1;
}
