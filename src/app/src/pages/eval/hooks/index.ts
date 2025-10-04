/**
 * Central export for all eval-related hooks.
 *
 * This provides a clean migration path:
 * 1. Components import from here instead of '../components/store'
 * 2. We can gradually switch implementations without changing components
 * 3. Eventually remove old store entirely
 */

// Re-export the compatibility hook as the main hook
export { useTableStoreCompat as useTableStore } from './useTableStoreCompat';

// Also export new hooks directly for components that want to use them
export { useEvalTable, usePrefetchEvalTable } from './useEvalTable';
export { useMetadataKeys } from './useMetadataKeys';

// Re-export settings store (no changes needed)
export { useResultsViewSettingsStore } from '../components/store';

// Re-export types from centralized types file
export type {
  ResultsFilter,
  ResultsFilterType,
  ResultsFilterOperator,
  PaginationState,
  ColumnState,
} from '../types';
