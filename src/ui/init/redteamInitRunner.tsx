/**
 * Entry point for the Ink-based redteam init wizard.
 *
 * This module provides the function to run the interactive redteam init experience.
 */

import React from 'react';

import { isCI } from '../../envars';
import logger from '../../logger';
import { renderInteractive, shouldUseInteractiveUI } from '../render';
import { RedteamInitApp } from './components/RedteamInitApp';

import type { RenderResult } from '../render';

export interface RedteamInitRunnerOptions {
  /** Target directory for initialization */
  directory?: string;
}

export interface RedteamInitResult {
  /** Whether init completed successfully */
  success: boolean;
  /** Path to the created config file */
  configPath?: string;
  /** Directory where files were written */
  outputDirectory?: string;
  /** Error message if failed */
  error?: string;
  /** List of files written */
  filesWritten?: string[];
}

/**
 * Check if the Ink-based redteam init UI should be used.
 *
 * Interactive UI is enabled by default when:
 * - Running in a TTY environment
 * - Not in a CI environment
 *
 * Can be explicitly disabled via PROMPTFOO_DISABLE_INTERACTIVE_UI=true
 * Can be force-enabled in CI via PROMPTFOO_FORCE_INTERACTIVE_INIT=true
 */
export function shouldUseInkRedteamInit(): boolean {
  // Force enable overrides everything (useful for testing in CI)
  if (process.env.PROMPTFOO_FORCE_INTERACTIVE_INIT === 'true') {
    logger.debug('Ink redteam init force-enabled via PROMPTFOO_FORCE_INTERACTIVE_INIT');
    return true;
  }

  // CI environments get non-interactive by default
  if (isCI()) {
    logger.debug('Ink redteam init disabled in CI environment');
    return false;
  }

  // Use the shared interactive UI check (handles TTY, explicit disable, etc.)
  return shouldUseInteractiveUI();
}

/**
 * Run the Ink-based redteam init wizard.
 */
export async function runInkRedteamInit(
  options: RedteamInitRunnerOptions = {},
): Promise<RedteamInitResult> {
  // Track result
  let result: RedteamInitResult = { success: false };
  let resolveResult: (result: RedteamInitResult) => void;
  const resultPromise = new Promise<RedteamInitResult>((resolve) => {
    resolveResult = resolve;
  });

  let renderResult: RenderResult | null = null;

  try {
    // Render the app
    renderResult = await renderInteractive(
      React.createElement(RedteamInitApp, {
        directory: options.directory,
        onComplete: (initResult: { directory: string; filesWritten: string[] }) => {
          result = {
            success: true,
            outputDirectory: initResult.directory,
            configPath: `${initResult.directory}/promptfooconfig.yaml`,
            filesWritten: initResult.filesWritten,
          };
          resolveResult(result);
        },
        onCancel: () => {
          result = { success: false, error: 'Cancelled by user' };
          resolveResult(result);
        },
      }),
      {
        exitOnCtrlC: false,
        patchConsole: true,
        onSignal: (signal: string) => {
          logger.debug(`Received ${signal} signal - cancelling redteam init`);
          result = { success: false, error: `Interrupted by ${signal}` };
          resolveResult(result);
        },
      },
    );

    // Wait for completion
    result = await resultPromise;

    // Brief pause before cleanup
    await new Promise((resolve) => setTimeout(resolve, 100));
  } finally {
    if (renderResult) {
      renderResult.cleanup();
    }
  }

  return result;
}

export { RedteamInitApp } from './components/RedteamInitApp';
