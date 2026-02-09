/**
 * Lightweight module for checking if interactive UI should be used.
 *
 * This module intentionally has NO dependencies on ink or React to avoid
 * loading those modules when promptfoo is used as a library.
 *
 * NOTE: Interactive UI is OPT-IN by default. Users must explicitly enable it
 * via PROMPTFOO_ENABLE_INTERACTIVE_UI=true environment variable.
 */

import { getEnvBool, isCI } from '../envars';
import logger from '../logger';

/**
 * Check if the current environment supports interactive UI.
 *
 * Returns false if stdout is not a TTY (Ink requires TTY to render).
 *
 * This only checks if the environment CAN support interactive UI,
 * not whether it SHOULD be used. Use shouldUseInkUI() for that.
 */
export function canUseInteractiveUI(): boolean {
  // Check if stdout is a TTY - Ink requires this to function
  if (!process.stdout.isTTY) {
    logger.debug('Interactive UI not available: stdout is not a TTY');
    return false;
  }

  return true;
}

/**
 * Check if interactive UI has been explicitly enabled by the user.
 *
 * Interactive UI is OPT-IN. Returns true only if:
 * - PROMPTFOO_ENABLE_INTERACTIVE_UI=true
 */
export function isInteractiveUIEnabled(): boolean {
  return getEnvBool('PROMPTFOO_ENABLE_INTERACTIVE_UI');
}

/**
 * Check if the interactive UI has been force-enabled (bypasses opt-in and CI checks).
 *
 * This is a debug/testing escape hatch. When set, the UI is enabled regardless
 * of other checks (except TTY, which Ink physically requires).
 */
export function isInteractiveUIForced(): boolean {
  return process.env.PROMPTFOO_FORCE_INTERACTIVE_UI === 'true';
}

/**
 * Check if the Ink UI should be used.
 *
 * Interactive UI is OPT-IN by default. The UI will only be used if:
 * 1. PROMPTFOO_FORCE_INTERACTIVE_UI=true (bypasses all other checks), OR
 * 2. User explicitly enabled it (PROMPTFOO_ENABLE_INTERACTIVE_UI=true)
 *    AND stdout is a TTY (required for Ink to render)
 */
export function shouldUseInkUI(): boolean {
  // Force enable overrides opt-in check (useful for testing in CI)
  if (isInteractiveUIForced()) {
    logger.debug('Ink UI force-enabled via PROMPTFOO_FORCE_INTERACTIVE_UI');
    return true;
  }

  // Check if user has explicitly disabled
  if (getEnvBool('PROMPTFOO_DISABLE_INTERACTIVE_UI')) {
    logger.debug('Ink UI disabled via PROMPTFOO_DISABLE_INTERACTIVE_UI');
    return false;
  }

  // Check if user has opted in
  if (!isInteractiveUIEnabled()) {
    logger.debug(
      'Ink UI disabled: not explicitly enabled (set PROMPTFOO_ENABLE_INTERACTIVE_UI=true)',
    );
    return false;
  }

  // Check if environment can support it (TTY required)
  if (!canUseInteractiveUI()) {
    logger.debug('Ink UI disabled: TTY required but not available');
    return false;
  }

  logger.debug('Ink UI enabled via PROMPTFOO_ENABLE_INTERACTIVE_UI');
  return true;
}

/**
 * Alias for shouldUseInkUI() - used by individual runner modules.
 */
export const shouldUseInteractiveUI = shouldUseInkUI;

/**
 * Check if the Ink-based init UI (regular or redteam) should be used.
 *
 * Requires PROMPTFOO_ENABLE_INTERACTIVE_UI=true (same opt-in as other Ink commands),
 * plus additional guards: disabled in CI environments by default.
 * Can be force-enabled in CI via PROMPTFOO_FORCE_INTERACTIVE_INIT=true.
 */
export function shouldUseInkInitUI(): boolean {
  // Force enable overrides everything (useful for testing in CI)
  if (process.env.PROMPTFOO_FORCE_INTERACTIVE_INIT === 'true') {
    logger.debug('Ink init force-enabled via PROMPTFOO_FORCE_INTERACTIVE_INIT');
    return true;
  }

  // CI environments get non-interactive by default
  if (isCI()) {
    logger.debug('Ink init disabled in CI environment');
    return false;
  }

  // Use the shared interactive UI check (handles TTY, explicit disable, etc.)
  return shouldUseInteractiveUI();
}
