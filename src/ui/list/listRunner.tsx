/**
 * Entry point for the Ink-based list UI.
 *
 * IMPORTANT: This module uses dynamic imports for ink-related components to avoid
 * loading ink/React when promptfoo is used as a library.
 */

import { isCI } from '../../envars';
import logger from '../../logger';
import { shouldUseInteractiveUI } from '../interactiveCheck';

import type { RenderResult } from '../render';
import type { ListItem, ResourceType } from './ListApp';

export interface ListRunnerOptions {
  /** Resource type to list */
  resourceType: ResourceType;
  /** Initial items */
  items?: ListItem[];
  /** Limit for initial load */
  limit?: number;
}

export interface ListResult {
  /** Selected item, if any */
  selectedItem?: ListItem;
  /** Whether user cancelled */
  cancelled: boolean;
}

/**
 * Check if the Ink-based list UI should be used.
 *
 * Interactive UI is enabled by default when:
 * - Running in a TTY environment
 * - Not in a CI environment
 *
 * Can be explicitly disabled via PROMPTFOO_DISABLE_INTERACTIVE_UI=true
 * Can be force-enabled in CI via PROMPTFOO_FORCE_INTERACTIVE_UI=true
 */
export function shouldUseInkList(): boolean {
  // Force enable overrides everything (useful for testing in CI)
  if (process.env.PROMPTFOO_FORCE_INTERACTIVE_UI === 'true') {
    logger.debug('Ink list force-enabled via PROMPTFOO_FORCE_INTERACTIVE_UI');
    return true;
  }

  // CI environments get non-interactive by default
  if (isCI()) {
    logger.debug('Ink list disabled in CI environment');
    return false;
  }

  // Use the shared interactive UI check (handles TTY, explicit disable, etc.)
  return shouldUseInteractiveUI();
}

/**
 * Run the Ink-based list UI.
 */
export async function runInkList(options: ListRunnerOptions): Promise<ListResult> {
  // Dynamic imports to avoid loading ink/React when used as library
  const [React, { renderInteractive }, { ListApp }] = await Promise.all([
    import('react'),
    import('../render'),
    import('./ListApp'),
  ]);

  let result: ListResult = { cancelled: false };
  let resolveResult: (result: ListResult) => void;
  const resultPromise = new Promise<ListResult>((resolve) => {
    resolveResult = resolve;
  });

  let renderResult: RenderResult | null = null;

  try {
    renderResult = await renderInteractive(
      React.createElement(ListApp, {
        resourceType: options.resourceType,
        items: options.items,
        onSelect: (item: ListItem) => {
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
          logger.debug(`Received ${signal} signal - cancelling list`);
          result = { cancelled: true };
          resolveResult(result);
        },
      },
    );

    result = await resultPromise;

    await new Promise((resolve) => setTimeout(resolve, 100));
  } finally {
    if (renderResult) {
      renderResult.cleanup();
    }
  }

  return result;
}

export type { ListItem, ResourceType };
