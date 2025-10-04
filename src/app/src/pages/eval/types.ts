/**
 * Type definitions for eval page components.
 * Extracted from the old monolithic store for better organization.
 */

import type { VisibilityState } from '@tanstack/table-core';

/**
 * Column visibility state for the results table.
 */
export interface ColumnState {
  selectedColumns: string[];
  columnVisibility: VisibilityState;
}

/**
 * Pagination state for the results table.
 */
export interface PaginationState {
  pageIndex: number;
  pageSize: number;
}

/**
 * Types of filters available for results.
 */
export type ResultsFilterType =
  | 'metric'
  | 'metadata'
  | 'plugin'
  | 'strategy'
  | 'severity'
  | 'policy';

/**
 * Operators for filter comparisons.
 */
export type ResultsFilterOperator = 'equals' | 'contains' | 'not_contains' | 'exists';

/**
 * A filter for results table data.
 */
export type ResultsFilter = {
  /**
   * A unique identifier for the filter.
   */
  id: string;
  type: ResultsFilterType;
  value: string;
  operator: ResultsFilterOperator;
  logicOperator: 'and' | 'or';
  /**
   * For metadata filters, this is the field name in the metadata object
   */
  field?: string;
  /**
   * The order in which this filter was added (for maintaining consistent ordering)
   */
  sortIndex: number;
};
