/**
 * Entry point for the Ink-based auth UI.
 *
 * IMPORTANT: This module uses dynamic imports for ink-related components to avoid
 * loading ink/React when promptfoo is used as a library.
 */

import { initInkApp } from '../initInkApp';

export { shouldUseInkUI as shouldUseInkAuth } from '../interactiveCheck';

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
 * Initialize the Ink-based auth UI.
 */
export async function initInkAuth(options: AuthRunnerOptions = {}): Promise<AuthUIResult> {
  const [React, { AuthApp, createAuthController }] = await Promise.all([
    import('react'),
    import('./AuthApp'),
  ]);

  const controller = createAuthController();

  const { renderResult, cleanup, promises } = await initInkApp<AuthController>({
    componentName: 'AuthApp',
    controller,
    channels: {
      teamSelection: undefined,
      result: undefined,
    },
    signalContext: 'auth',
    render: (resolvers) =>
      React.createElement(AuthApp, {
        initialPhase: options.initialPhase || 'idle',
        onTeamSelect: (team: TeamInfo) => {
          resolvers.teamSelection(team);
        },
        onComplete: (userInfo: UserInfo) => {
          resolvers.result(userInfo);
        },
        onError: (_error: string) => {
          resolvers.result(undefined);
        },
        onExit: () => {
          // Resolve with undefined if exited without completing
          resolvers.teamSelection(undefined);
          resolvers.result(undefined);
        },
      }),
  });

  return {
    renderResult,
    controller,
    cleanup,
    teamSelection: promises.teamSelection as Promise<TeamInfo | undefined>,
    result: promises.result as Promise<UserInfo | undefined>,
  };
}

export type { AuthController, TeamInfo, UserInfo };
