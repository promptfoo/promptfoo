/**
 * Column visibility resolution utilities.
 *
 * This module provides functions to resolve column visibility from multiple sources:
 * 1. Per-eval override (legacy columnStates)
 * 2. User's name-based preferences (columnVisibilityByName)
 * 3. Config defaults (defaultColumnVisibility from promptfooconfig.yaml)
 * 4. Global defaults (globalColumnDefaults)
 *
 * Resolution priority (highest to lowest):
 * - Per-eval override > Name-based prefs > Config defaults > Global defaults
 */

import type { DefaultColumnVisibility, UnifiedConfig } from '@promptfoo/types';
import type { VisibilityState } from '@tanstack/table-core';

import type { ColumnVisibilityByName, GlobalColumnDefaults } from './store';

/**
 * Parameters for resolving column visibility.
 */
export interface ResolveColumnVisibilityParams {
  /** Variable names from the current eval (e.g., ["question", "context", "expected"]) */
  varNames: string[];
  /** Number of prompt columns in the current eval */
  promptCount: number;
  /** Whether the eval has a description column */
  hasDescription?: boolean;
  /** Optional per-eval column state (legacy format, keyed by "Variable 1", "Prompt 1", etc.) */
  perEvalColumnState?: VisibilityState;
  /** User's name-based column visibility preferences */
  columnVisibilityByName: ColumnVisibilityByName;
  /** Global column defaults from user preferences */
  globalColumnDefaults: GlobalColumnDefaults;
  /** Config-based column visibility defaults (from promptfooconfig.yaml) */
  configDefaults?: DefaultColumnVisibility;
}

/**
 * Result of column visibility resolution, including both the visibility state
 * and metadata about which columns were affected.
 */
export interface ResolveColumnVisibilityResult {
  /** The resolved visibility state (keyed by column ID like "Variable 1", "Prompt 1") */
  columnVisibility: VisibilityState;
  /** List of all column IDs */
  allColumns: string[];
  /** List of visible column IDs */
  visibleColumns: string[];
}

/**
 * Resolves column visibility from multiple sources.
 *
 * Priority (highest to lowest):
 * 1. Per-eval override (if a specific eval has saved column state)
 * 2. Name-based user preferences (e.g., always hide "context")
 * 3. Config defaults (from promptfooconfig.yaml)
 * 4. Global defaults (show all by default)
 */
export function resolveColumnVisibility(
  params: ResolveColumnVisibilityParams,
): ResolveColumnVisibilityResult {
  const {
    varNames,
    promptCount,
    hasDescription = false,
    perEvalColumnState,
    columnVisibilityByName,
    globalColumnDefaults,
    configDefaults,
  } = params;

  const visibility: VisibilityState = {};
  const allColumns: string[] = [];

  // 1. If per-eval override exists and is non-empty, use it directly (legacy behavior)
  if (perEvalColumnState && Object.keys(perEvalColumnState).length > 0) {
    // Build allColumns list
    if (hasDescription) {
      allColumns.push('description');
    }
    varNames.forEach((_, idx) => allColumns.push(`Variable ${idx + 1}`));
    for (let i = 0; i < promptCount; i++) {
      allColumns.push(`Prompt ${i + 1}`);
    }

    // Use per-eval state, defaulting to visible for any missing columns
    for (const col of allColumns) {
      visibility[col] = perEvalColumnState[col] ?? true;
    }

    return {
      columnVisibility: visibility,
      allColumns,
      visibleColumns: allColumns.filter((col) => visibility[col] !== false),
    };
  }

  // 2. Resolve from name-based preferences, config defaults, and global defaults

  // Determine base visibility from config
  const configShowVars = configDefaults?.variables !== 'hidden';
  const configShowPrompts = configDefaults?.prompts !== 'hidden';
  const configHiddenColumns = new Set(configDefaults?.hideColumns ?? []);
  const configShownColumns = new Set(configDefaults?.showColumns ?? []);

  // Ensure columnVisibilityByName is an object (handles undefined/null from tests)
  const namePrefs = columnVisibilityByName ?? {};
  // Ensure globalColumnDefaults has proper defaults (handles undefined from tests)
  const defaults = {
    showAllVariables: globalColumnDefaults?.showAllVariables ?? true,
    showAllPrompts: globalColumnDefaults?.showAllPrompts ?? true,
  };

  // Handle description column
  if (hasDescription) {
    const descKey = 'description';
    allColumns.push(descKey);
    // Description follows the same precedence as variable columns:
    // name prefs > config showColumns > config hideColumns > config.variables > global default
    if (namePrefs[descKey] !== undefined) {
      visibility[descKey] = namePrefs[descKey];
    } else if (configShownColumns.has(descKey)) {
      visibility[descKey] = true;
    } else if (configHiddenColumns.has(descKey)) {
      visibility[descKey] = false;
    } else if (configDefaults?.variables !== undefined) {
      visibility[descKey] = configShowVars;
    } else {
      visibility[descKey] = defaults.showAllVariables;
    }
  }

  // Handle variable columns
  varNames.forEach((varName, idx) => {
    const colId = `Variable ${idx + 1}`;
    allColumns.push(colId);

    // Resolution priority:
    // 1. Name-based user preference (if set for this variable name)
    // 2. Config showColumns (explicit show)
    // 3. Config hideColumns (explicit hide)
    // 4. Config variables visibility
    // 5. Global default

    if (namePrefs[varName] !== undefined) {
      // User has a specific preference for this variable name
      visibility[colId] = namePrefs[varName];
    } else if (configShownColumns.has(varName)) {
      // Config explicitly shows this column
      visibility[colId] = true;
    } else if (configHiddenColumns.has(varName)) {
      // Config explicitly hides this column
      visibility[colId] = false;
    } else if (configDefaults?.variables !== undefined) {
      // Use config's variables visibility setting
      visibility[colId] = configShowVars;
    } else {
      // Fall back to global default
      visibility[colId] = defaults.showAllVariables;
    }
  });

  // Handle prompt columns
  for (let i = 0; i < promptCount; i++) {
    const colId = `Prompt ${i + 1}`;
    allColumns.push(colId);

    // Prompts use global defaults (config doesn't support per-prompt hiding currently)
    if (configDefaults?.prompts !== undefined) {
      visibility[colId] = configShowPrompts;
    } else {
      visibility[colId] = defaults.showAllPrompts;
    }
  }

  return {
    columnVisibility: visibility,
    allColumns,
    visibleColumns: allColumns.filter((col) => visibility[col] !== false),
  };
}

/**
 * Extracts the semantic column name from a column ID.
 * For variable columns, returns the actual variable name.
 * For other columns, returns the column ID as-is.
 *
 * @param colId - The column ID (e.g., "Variable 1", "Prompt 1", "description")
 * @param varNames - Array of variable names from the eval
 * @returns The semantic column name
 */
export function getSemanticColumnName(colId: string, varNames: string[]): string {
  const varMatch = colId.match(/^Variable (\d+)$/);
  if (varMatch) {
    const idx = parseInt(varMatch[1], 10) - 1;
    return varNames[idx] ?? colId;
  }
  return colId;
}

/**
 * Extracts default column visibility settings from an eval config.
 *
 * @param config - The eval config
 * @returns The defaultColumnVisibility settings, or undefined if not set
 */
export function getConfigColumnVisibility(
  config?: Partial<UnifiedConfig> | null,
): DefaultColumnVisibility | undefined {
  return config?.defaultColumnVisibility as DefaultColumnVisibility | undefined;
}
