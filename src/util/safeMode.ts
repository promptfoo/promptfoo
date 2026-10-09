import cliState from '../cliState';
import { getEnvBool, parseEnvBool } from '../envars';

export class SafeModeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SafeModeError';
    Object.setPrototypeOf(this, SafeModeError.prototype);
  }
}

/**
 * Checks whether safe mode is active.
 *
 * This guard disables string-based JavaScript assertions and shared transforms.
 * It is not a sandbox: file callbacks and other execution surfaces remain enabled.
 *
 * Precedence / Security Contract:
 * 1. CLI flag `--safe-mode` (`cliState.safeMode`) - Highest precedence.
 * 2. Process environment variable `PROMPTFOO_SAFE_MODE` (raw `process.env`) - cannot be overridden
 *    by untrusted config files.
 * 3. Suite/config environment variable `getEnvBool('PROMPTFOO_SAFE_MODE')` - allows opting into
 *    safe mode from config, but CANNOT disable safe mode if enabled via CLI or process.env.
 */
export function isSafeMode(): boolean {
  if (cliState.safeMode) {
    return true;
  }
  if (parseEnvBool(process.env.PROMPTFOO_SAFE_MODE)) {
    return true;
  }
  if (getEnvBool('PROMPTFOO_SAFE_MODE')) {
    return true;
  }
  return false;
}
