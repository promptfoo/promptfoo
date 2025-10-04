/**
 * Shared TypeScript types for model-audit hooks.
 * Prevents type duplication and ensures consistency.
 */

export interface HistoricalScan {
  id: string;
  createdAt: number;
  updatedAt: number;
  name?: string | null;
  author?: string | null;
  modelPath: string;
  modelType?: string | null;
  results: unknown; // TODO: Define proper ScanResult type
  hasErrors: boolean;
  totalChecks?: number | null;
  passedChecks?: number | null;
  failedChecks?: number | null;
  metadata?: Record<string, unknown> | null;
}
