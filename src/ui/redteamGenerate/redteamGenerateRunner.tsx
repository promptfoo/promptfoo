/**
 * Entry point for the Ink-based redteam generate UI.
 */

import React from 'react';

import { isCI } from '../../envars';
import logger from '../../logger';
import { renderInteractive, shouldUseInteractiveUI } from '../render';
import {
  createRedteamGenerateController,
  RedteamGenerateApp,
  type RedteamGenerateController,
} from './RedteamGenerateApp';

import type { RenderResult } from '../render';

export interface RedteamGenerateRunnerOptions {
  /** Abort signal for cancellation */
  abortSignal?: AbortSignal;
}

export interface RedteamGenerateResult {
  /** Whether generation completed successfully */
  success: boolean;
  /** Number of tests generated */
  testsGenerated?: number;
  /** Output file path */
  outputPath?: string;
  /** Error message if failed */
  error?: string;
}

export interface RedteamGenerateUIResult {
  /** Render result for cleanup */
  renderResult: RenderResult;
  /** Controller for sending progress updates */
  controller: RedteamGenerateController;
  /** Cleanup function */
  cleanup: () => void;
  /** Wait for user to exit */
  waitForExit: () => Promise<void>;
}

/**
 * Check if the Ink-based redteam generate UI should be used.
 *
 * Enabled by default when:
 * - stdout is a TTY (interactive terminal)
 * - NOT in a CI environment
 *
 * Can be force-enabled in CI via PROMPTFOO_FORCE_INTERACTIVE_UI=true
 */
export function shouldUseInkRedteamGenerate(): boolean {
  // Force enable overrides everything (useful for testing in CI)
  if (process.env.PROMPTFOO_FORCE_INTERACTIVE_UI === 'true') {
    logger.debug('Ink redteam generate force-enabled via PROMPTFOO_FORCE_INTERACTIVE_UI');
    return true;
  }

  // CI environments get non-interactive by default
  if (isCI()) {
    logger.debug('Ink redteam generate disabled in CI environment');
    return false;
  }

  // Use the shared interactive UI check (handles TTY, explicit disable, etc.)
  return shouldUseInteractiveUI();
}

/**
 * Initialize the Ink-based redteam generate UI.
 */
export async function initInkRedteamGenerate(
  _options: RedteamGenerateRunnerOptions = {},
): Promise<RedteamGenerateUIResult> {
  let resolveExit: () => void;
  const exitPromise = new Promise<void>((resolve) => {
    resolveExit = resolve;
  });

  const controller = createRedteamGenerateController();

  const renderResult = await renderInteractive(
    React.createElement(RedteamGenerateApp, {
      onComplete: () => {
        resolveExit();
      },
      onCancel: () => {
        resolveExit();
      },
    }),
    {
      exitOnCtrlC: false,
      patchConsole: true,
      onSignal: (signal: string) => {
        logger.debug(`Received ${signal} signal - cancelling redteam generate`);
        controller.error(`Interrupted by ${signal}`);
        resolveExit();
      },
    },
  );

  return {
    renderResult,
    controller,
    cleanup: () => {
      renderResult.cleanup();
    },
    waitForExit: () => exitPromise,
  };
}

export { RedteamGenerateApp, createRedteamGenerateController };
export type { RedteamGenerateController };
