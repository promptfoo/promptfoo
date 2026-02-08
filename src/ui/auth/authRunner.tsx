/**
 * Entry point for the Ink-based auth UI.
 *
 * IMPORTANT: This module uses dynamic imports for ink-related components to avoid
 * loading ink/React when promptfoo is used as a library.
 */

import logger from '../../logger';
import { shouldUseInkUI } from '../interactiveCheck';

import type { RenderResult } from '../render';
import type { AuthController, TeamInfo, UserInfo } from './AuthApp';

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
 * Delegates to the shared opt-in check (PROMPTFOO_ENABLE_INTERACTIVE_UI + TTY).
 */
export function shouldUseInkAuth(): boolean {
  return shouldUseInkUI();
}

/**
 * Initialize the Ink-based auth UI.
 */
export async function initInkAuth(options: AuthRunnerOptions = {}): Promise<AuthUIResult> {
  // Dynamic imports to avoid loading ink/React when used as library
  const [React, { renderInteractive }, { AuthApp, createAuthController }, { ErrorBoundary }] =
    await Promise.all([
      import('react'),
      import('../render'),
      import('./AuthApp'),
      import('../components/shared/ErrorBoundary'),
    ]);

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
    React.createElement(
      ErrorBoundary,
      {
        componentName: 'AuthApp',
        onError: () => {
          resolveTeamSelection(undefined);
          resolveResult(undefined);
        },
      },
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
    ),
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

  // Race promises against Ink exit to prevent hangs if component crashes
  const safeTeamSelection = Promise.race([
    teamSelectionPromise,
    renderResult.waitUntilExit().then(() => undefined),
  ]);

  const safeResult = Promise.race([
    resultPromise,
    renderResult.waitUntilExit().then(() => undefined),
  ]);

  return {
    renderResult,
    controller,
    cleanup: () => {
      renderResult.cleanup();
    },
    teamSelection: safeTeamSelection,
    result: safeResult,
  };
}

export type { AuthController, TeamInfo, UserInfo };
