import type { DefaultColumnVisibility, UnifiedConfig } from '@promptfoo/types';
import type { VisibilityState } from '@tanstack/table-core';

export interface ResolveColumnVisibilityParams {
  allColumns: string[];
  varNames: string[];
  perEvalColumnState?: VisibilityState;
  hiddenVarNames?: string[];
  hasSchemaPreference?: boolean;
  configDefaults?: DefaultColumnVisibility;
}

export interface ResolveColumnVisibilityResult {
  columnVisibility: VisibilityState;
  selectedColumns: string[];
}

export function getVariableNameFromColumnId(columnId: string, varNames: string[]): string | null {
  const match = columnId.match(/^Variable (\d+)$/);
  if (!match) {
    return null;
  }
  const varIndex = parseInt(match[1], 10) - 1;
  return varNames[varIndex] ?? null;
}

function isNamed(set: Set<string>, semanticName: string, columnId: string): boolean {
  return set.has(semanticName) || set.has(columnId);
}

function getConfigVisibility(
  columnId: string,
  semanticName: string,
  configDefaults?: DefaultColumnVisibility,
): boolean {
  if (!configDefaults) {
    return true;
  }

  const shownColumns = new Set(configDefaults.showColumns ?? []);
  if (isNamed(shownColumns, semanticName, columnId)) {
    return true;
  }

  const hiddenColumns = new Set(configDefaults.hideColumns ?? []);
  if (isNamed(hiddenColumns, semanticName, columnId)) {
    return false;
  }

  if (columnId.startsWith('Variable ')) {
    return configDefaults.variables !== 'hidden';
  }

  if (columnId.startsWith('Prompt ')) {
    return configDefaults.prompts !== 'hidden';
  }

  return true;
}

export function resolveColumnVisibility({
  allColumns,
  varNames,
  perEvalColumnState,
  hiddenVarNames = [],
  hasSchemaPreference = false,
  configDefaults,
}: ResolveColumnVisibilityParams): ResolveColumnVisibilityResult {
  const columnVisibility: VisibilityState = {};
  const selectedColumns: string[] = [];

  for (const columnId of allColumns) {
    const varName = getVariableNameFromColumnId(columnId, varNames);
    const isVisible =
      varName === null
        ? (perEvalColumnState?.[columnId] ??
          getConfigVisibility(columnId, columnId, configDefaults))
        : hasSchemaPreference
          ? !hiddenVarNames.includes(varName)
          : getConfigVisibility(columnId, varName, configDefaults);

    columnVisibility[columnId] = isVisible;
    if (isVisible) {
      selectedColumns.push(columnId);
    }
  }

  return { columnVisibility, selectedColumns };
}

export function getConfigColumnVisibility(
  config?: Partial<UnifiedConfig> | null,
): DefaultColumnVisibility | undefined {
  return config?.defaultColumnVisibility as DefaultColumnVisibility | undefined;
}
