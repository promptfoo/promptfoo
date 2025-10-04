/**
 * Central export for all model-audit related hooks.
 *
 * This provides a clean migration path:
 * 1. Components import from here instead of '../store'
 * 2. We can gradually switch implementations without changing components
 * 3. Eventually the compatibility layer can be removed
 */

// Re-export the compatibility hook as the main hook
export { useModelAuditStoreCompat as useModelAuditStore } from './useModelAuditStoreCompat';

// Also export new hooks directly for components that want to use them
export { useInstallationCheck } from './useInstallationCheck';
export { useHistoricalScans } from './useHistoricalScans';
export { useDeleteScan } from './useDeleteScan';

// Export UI store for direct access if needed
export { useModelAuditUIStore } from './uiStore';
