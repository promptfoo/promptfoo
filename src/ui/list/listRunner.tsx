/**
 * Entry point for the Ink-based list UI.
 *
 * IMPORTANT: This module uses dynamic imports for ink-related components to avoid
 * loading ink/React when promptfoo is used as a library.
 *
 * NOTE: Interactive UI is OPT-IN. It will only be used if explicitly enabled via
 * PROMPTFOO_ENABLE_INTERACTIVE_UI=true environment variable.
 */

export { shouldUseInkUI as shouldUseInkList } from '../interactiveCheck';

import { runInkApp } from '../runInkApp';

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
 * Run the Ink-based list UI.
 */
export async function runInkList(options: ListRunnerOptions): Promise<ListResult> {
  const [React, { ListApp }] = await Promise.all([import('react'), import('./ListApp')]);

  return runInkApp<ListResult>({
    componentName: 'ListApp',
    defaultResult: { cancelled: false },
    signalContext: 'list',
    render: (resolve) =>
      React.createElement(ListApp, {
        resourceType: options.resourceType,
        items: options.items,
        pageSize: options.pageSize,
        hasMore: options.hasMore,
        onLoadMore: options.onLoadMore,
        totalCount: options.totalCount,
        onSelect: (item: ListItem) => {
          resolve({ selectedItem: item, cancelled: false });
        },
        onExit: () => {
          resolve({ cancelled: true });
        },
      }),
  });
}

export type { ListItem, ResourceType };
