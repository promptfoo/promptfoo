/**
 * Entry point for the Ink-based auth UI.
 */

import React from 'react';

import { isCI } from '../../envars';
import logger from '../../logger';
import { renderInteractive, shouldUseInteractiveUI } from '../render';
import {
  AuthApp,
  type AuthController,
  createAuthController,
  type TeamInfo,
  type UserInfo,
} from './AuthApp';

import type { RenderResult } from '../render';

export interface AuthRunnerOptions {
  /** Initial phase to start with */
  initialPhase?: 'idle' | 'logging_in';
}

export interface AuthUIResult {
  /** Render result for cleanup */
  renderResult: RenderResult;
  /** Controller for sending progress updates */
  controller: AuthController;
  /** Cleanup function */
  cleanup: () => void;
  /** Promise that resolves when a team is selected (or undefined if no selection needed) */
  teamSelection: Promise<TeamInfo | undefined>;
  /** Promise that resolves when auth completes */
  result: Promise<UserInfo | undefined>;
}

/**
 * Check if the Ink-based auth UI should be used.
 *
 * Interactive UI is enabled by default when:
 * - Running in a TTY environment
 * - Not in a CI environment
 *
 * Can be explicitly disabled via PROMPTFOO_DISABLE_INTERACTIVE_UI=true
 * Can be force-enabled in CI via PROMPTFOO_FORCE_INTERACTIVE_UI=true
 */
export function shouldUseInkAuth(): boolean {
  // Force enable overrides everything (useful for testing in CI)
  if (process.env.PROMPTFOO_FORCE_INTERACTIVE_UI === 'true') {
    logger.debug('Ink auth force-enabled via PROMPTFOO_FORCE_INTERACTIVE_UI');
    return true;
  }

  // CI environments get non-interactive by default
  if (isCI()) {
    logger.debug('Ink auth disabled in CI environment');
    return false;
  }

  // Use the shared interactive UI check (handles TTY, explicit disable, etc.)
  return shouldUseInteractiveUI();
}

/**
 * Initialize the Ink-based auth UI.
 */
export async function initInkAuth(options: AuthRunnerOptions = {}): Promise<AuthUIResult> {
  let resolveTeamSelection: (team: TeamInfo | undefined) => void;
  const teamSelectionPromise = new Promise<TeamInfo | undefined>((resolve) => {
    resolveTeamSelection = resolve;
  });

  let resolveResult: (userInfo: UserInfo | undefined) => void;
  const resultPromise = new Promise<UserInfo | undefined>((resolve) => {
    resolveResult = resolve;
  });

  const controller = createAuthController();

  const renderResult = await renderInteractive(
    React.createElement(AuthApp, {
      initialPhase: options.initialPhase || 'idle',
      onTeamSelect: (team: TeamInfo) => {
        resolveTeamSelection(team);
      },
      onComplete: (userInfo: UserInfo) => {
        resolveResult(userInfo);
      },
      onError: (_error: string) => {
        resolveResult(undefined);
      },
      onExit: () => {
        // Resolve with undefined if exited without completing
        resolveTeamSelection(undefined);
        resolveResult(undefined);
      },
    }),
    {
      exitOnCtrlC: false,
      patchConsole: true,
      onSignal: (signal: string) => {
        logger.debug(`Received ${signal} signal - cancelling auth`);
        resolveTeamSelection(undefined);
        resolveResult(undefined);
      },
    },
  );

  return {
    renderResult,
    controller,
    cleanup: () => {
      renderResult.cleanup();
    },
    teamSelection: teamSelectionPromise,
    result: resultPromise,
  };
}

export { AuthApp, createAuthController };
export type { AuthController, TeamInfo, UserInfo };
