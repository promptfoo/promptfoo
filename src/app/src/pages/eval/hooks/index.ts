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

// Table metrics hooks
export { usePassingTestCounts, useTestCounts, usePassRates } from './useTableMetrics';

// Settings hooks
export { useSettingsState } from './useSettingsState';

// Re-export settings store
export { useResultsViewSettingsStore } from '../store/settingsStore';

// Re-export types from centralized types file
export type {
  ResultsFilter,
  ResultsFilterType,
  ResultsFilterOperator,
  PaginationState,
  ColumnState,
} from '../types';
