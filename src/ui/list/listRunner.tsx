/**
 * Entry point for the Ink-based list UI.
 *
 * IMPORTANT: This module uses dynamic imports for ink-related components to avoid
 * loading ink/React when promptfoo is used as a library.
 *
 * NOTE: Interactive UI is OPT-IN. It will only be used if explicitly enabled via
 * PROMPTFOO_ENABLE_INTERACTIVE_UI=true environment variable.
 */

import logger from '../../logger';
import { shouldUseInkUI } from '../interactiveCheck';

import type { RenderResult } from '../render';
import type { ListItem, ResourceType } from './ListApp';

export interface ListRunnerOptions {
  /** Resource type to list */
  resourceType: ResourceType;
  /** Initial items */
  items?: ListItem[];
  /** Limit for initial load */
  limit?: number;
  /** Page size for pagination */
  pageSize?: number;
  /** Whether there are more items to load */
  hasMore?: boolean;
  /** Called to load more data (pagination) */
  onLoadMore?: (offset: number, limit: number) => Promise<ListItem[]>;
  /** Total count of items (for "X of Y" display) */
  totalCount?: number;
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
 * Interactive UI is OPT-IN. It will only be used if:
 * 1. User explicitly enabled it via PROMPTFOO_ENABLE_INTERACTIVE_UI=true
 * 2. Running in a TTY environment (stdout.isTTY)
 */
export function shouldUseInkList(): boolean {
  return shouldUseInkUI();
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
        pageSize: options.pageSize,
        hasMore: options.hasMore,
        onLoadMore: options.onLoadMore,
        totalCount: options.totalCount,
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
