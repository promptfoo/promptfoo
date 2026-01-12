/**
 * Entry point for the Ink-based main menu UI.
 *
 * IMPORTANT: This module uses dynamic imports for ink-related components to avoid
 * loading ink/React when promptfoo is used as a library.
 */

import { isCI } from '../../envars';
import { getUserEmail } from '../../globalConfig/accounts';
import { cloudConfig } from '../../globalConfig/cloud';
import logger from '../../logger';
import { resolveTeamId } from '../../util/cloud';
import { fetchWithProxy } from '../../util/fetch/index';
import { VERSION } from '../../version';
import { shouldUseInteractiveUI } from '../interactiveCheck';

import type { RenderResult } from '../render';
import type { AuthStatus, MenuItem } from './MenuApp';

export interface MenuRunnerOptions {
  /** Skip auth status check */
  skipAuthCheck?: boolean;
}

export interface MenuResult {
  /** Selected menu item, if any */
  selectedItem?: MenuItem;
  /** Whether user cancelled */
  cancelled: boolean;
}

/**
 * Check if the Ink-based menu UI should be used.
 *
 * Interactive UI is enabled by default when:
 * - Running in a TTY environment
 * - Not in a CI environment
 *
 * Can be explicitly disabled via PROMPTFOO_DISABLE_INTERACTIVE_UI=true
 * Can be force-enabled in CI via PROMPTFOO_FORCE_INTERACTIVE_UI=true
 */
export function shouldUseInkMenu(): boolean {
  // Force enable overrides everything (useful for testing in CI)
  if (process.env.PROMPTFOO_FORCE_INTERACTIVE_UI === 'true') {
    logger.debug('Ink menu force-enabled via PROMPTFOO_FORCE_INTERACTIVE_UI');
    return true;
  }

  // CI environments get non-interactive by default
  if (isCI()) {
    logger.debug('Ink menu disabled in CI environment');
    return false;
  }

  // Use the shared interactive UI check (handles TTY, explicit disable, etc.)
  return shouldUseInteractiveUI();
}

/**
 * Get current auth status.
 */
async function getAuthStatus(): Promise<AuthStatus> {
  const email = getUserEmail();
  const apiKey = cloudConfig.getApiKey();

  if (!email || !apiKey) {
    return { isLoggedIn: false };
  }

  try {
    const apiHost = cloudConfig.getApiHost();
    const response = await fetchWithProxy(`${apiHost}/api/v1/users/me`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      return { isLoggedIn: false };
    }

    const { user, organization } = await response.json();

    let teamName: string | undefined;
    try {
      const team = await resolveTeamId();
      teamName = team.name;
    } catch {
      // Team resolution can fail, that's ok
    }

    return {
      isLoggedIn: true,
      email: user.email,
      organization: organization.name,
      team: teamName,
      appUrl: cloudConfig.getAppUrl(),
    };
  } catch (error) {
    logger.debug(`Failed to get auth status: ${(error as Error).message}`);
    return { isLoggedIn: false };
  }
}

/**
 * Run the Ink-based main menu UI.
 */
export async function runInkMenu(options: MenuRunnerOptions = {}): Promise<MenuResult> {
  // Dynamic imports to avoid loading ink/React when used as library
  const [React, { renderInteractive }, { MenuApp }] = await Promise.all([
    import('react'),
    import('../render'),
    import('./MenuApp'),
  ]);

  let result: MenuResult = { cancelled: false };
  let resolveResult: (result: MenuResult) => void;
  const resultPromise = new Promise<MenuResult>((resolve) => {
    resolveResult = resolve;
  });

  let renderResult: RenderResult | null = null;
  let authStatus: AuthStatus | undefined;
  let loading = !options.skipAuthCheck;

  // Start fetching auth status
  const authPromise = options.skipAuthCheck ? Promise.resolve(undefined) : getAuthStatus();

  try {
    // Initial render with loading state
    renderResult = await renderInteractive(
      React.createElement(MenuApp, {
        version: VERSION,
        loading,
        authStatus,
        onSelect: (item: MenuItem) => {
          result = { selectedItem: item, cancelled: false };
          resolveResult(result);
        },
        onExit: () => {
          result = { cancelled: true };
          resolveResult(result);
        },
      }),
      {
        exitOnCtrlC: false,
        patchConsole: true,
        onSignal: (signal: string) => {
          logger.debug(`Received ${signal} signal - exiting menu`);
          result = { cancelled: true };
          resolveResult(result);
        },
      },
    );

    // Wait for auth status and re-render
    if (!options.skipAuthCheck) {
      authStatus = await authPromise;
      loading = false;

      // Re-render with auth status
      renderResult.rerender(
        React.createElement(MenuApp, {
          version: VERSION,
          loading: false,
          authStatus,
          onSelect: (item: MenuItem) => {
            result = { selectedItem: item, cancelled: false };
            resolveResult(result);
          },
          onExit: () => {
            result = { cancelled: true };
            resolveResult(result);
          },
        }),
      );
    }

    result = await resultPromise;

    // Small delay for clean exit
    await new Promise((resolve) => setTimeout(resolve, 100));
  } finally {
    if (renderResult) {
      renderResult.cleanup();
    }
  }

  return result;
}

export type { AuthStatus, MenuItem };
