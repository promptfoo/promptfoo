/**
 * Lightweight module for checking if interactive UI should be used.
 *
 * This module intentionally has NO dependencies on ink or React to avoid
 * loading those modules when promptfoo is used as a library.
 */

import { getEnvBool, isCI } from '../envars';
import logger from '../logger';

/**
 * Check if the current environment supports interactive UI.
 *
 * Returns false if:
 * - Not running in a TTY
 * - PROMPTFOO_DISABLE_INTERACTIVE_UI is set
 * - CI environment is detected
 * - Output is being piped
 */
export function shouldUseInteractiveUI(): boolean {
  // Explicit disable via environment variable
  if (getEnvBool('PROMPTFOO_DISABLE_INTERACTIVE_UI')) {
    logger.debug('Interactive UI disabled via PROMPTFOO_DISABLE_INTERACTIVE_UI');
    return false;
  }

  // Check if stdout is a TTY
  if (!process.stdout.isTTY) {
    logger.debug('Interactive UI disabled: stdout is not a TTY');
    return false;
  }

  // Check for CI environments
  if (process.env.CI || process.env.CONTINUOUS_INTEGRATION) {
    logger.debug('Interactive UI disabled: CI environment detected');
    return false;
  }

  // Check for common CI environment variables
  const ciEnvVars = [
    'GITHUB_ACTIONS',
    'GITLAB_CI',
    'CIRCLECI',
    'TRAVIS',
    'JENKINS_URL',
    'BUILDKITE',
    'DRONE',
    'TEAMCITY_VERSION',
  ];

  for (const envVar of ciEnvVars) {
    if (process.env[envVar]) {
      logger.debug(`Interactive UI disabled: ${envVar} detected`);
      return false;
    }
  }

  return true;
}

/**
 * Check if the Ink UI should be used for this evaluation.
 *
 * The Ink UI is enabled by default when:
 * - stdout is a TTY (interactive terminal)
 * - NOT in a CI environment
 *
 * Can be controlled via:
 * - PROMPTFOO_FORCE_INTERACTIVE_UI=true - Force enable (even in CI)
 * - PROMPTFOO_DISABLE_INTERACTIVE_UI=true - Force disable
 * - --no-interactive CLI flag (sets disabled)
 */
export function shouldUseInkUI(): boolean {
  // Force enable overrides everything (useful for testing in CI)
  if (process.env.PROMPTFOO_FORCE_INTERACTIVE_UI === 'true') {
    logger.debug('Ink UI force-enabled via PROMPTFOO_FORCE_INTERACTIVE_UI');
    return true;
  }

  // CI environments get non-interactive by default
  if (isCI()) {
    logger.debug('Ink UI disabled in CI environment');
    return false;
  }

  // Use the shared interactive UI check (handles TTY, explicit disable, etc.)
  return shouldUseInteractiveUI();
}

/**
 * Check if the user has explicitly requested interactive UI.
 * This is used to override the default behavior.
 */
export function isInteractiveUIForced(): boolean {
  return getEnvBool('PROMPTFOO_FORCE_INTERACTIVE_UI');
}
