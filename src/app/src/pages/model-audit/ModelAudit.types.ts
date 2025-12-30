import type { ModelAuditCheck } from '@promptfoo/types/modelAudit';

import type { ModelAuditScanResults } from '../../../../types/modelAudit';

/**
 * Represents a path to be scanned.
 */
export interface ScanPath {
  path: string;
  type: 'file' | 'directory';
  name: string;
}

/**
 * Represents a recently executed scan configuration (stored in localStorage).
 */
export interface RecentScan {
  id: string;
  paths: ScanPath[];
  timestamp: number;
  label?: string;
}

/**
 * Status of the modelaudit CLI installation.
 */
export interface InstallationStatus {
  checking: boolean;
  installed: boolean | null;
  error: string | null;
  cwd: string | null;
}

export interface ScanOptions {
  blacklist: string[];
  timeout: number;
  maxSize?: string; // Replaced maxFileSize/maxTotalSize with single maxSize option
  verbose?: boolean; // Optional since we handle this automatically in the server
  format?: 'text' | 'json' | 'sarif';
  strict?: boolean;
  dryRun?: boolean;
  cache?: boolean;
  quiet?: boolean;
  progress?: boolean;
  sbom?: string;
  output?: string;
  author?: string;
}

export interface ScanIssue {
  // Note: modelaudit scanner can output both 'critical' and 'error' severity.
  // Both are treated as critical/error level issues in the UI.
  severity: 'error' | 'critical' | 'warning' | 'info' | 'debug';
  message: string;
  location?: string;
  why?: string;
  details?: Record<string, unknown> & {
    path?: string;
    files?: string[];
  };
  timestamp?: number;
}

export type ScanCheck = ModelAuditCheck;

export interface ScanAsset {
  path: string;
  type?: string;
  size?: number;
}

/**
 * Frontend ScanResult type that aligns with backend ModelAuditScanResults
 * Ensures type consistency between backend and frontend while maintaining compatibility
 *
 * This type represents what the frontend actually receives from the API,
 * which is the ModelAuditScanResults plus some UI-specific required fields.
 */
export interface ScanResult extends ModelAuditScanResults {
  // Fields that are required in UI context but optional in backend
  path: string;
  success: boolean;

  // Override issues field to use frontend ScanIssue type
  issues: ScanIssue[];
}

/**
 * A historical scan record retrieved from the database.
 */
export interface HistoricalScan {
  id: string;
  createdAt: number;
  updatedAt: number;
  name?: string | null;
  author?: string | null;
  modelPath: string;
  modelType?: string | null;
  results: ScanResult;
  hasErrors: boolean;
  totalChecks?: number | null;
  passedChecks?: number | null;
  failedChecks?: number | null;
  metadata?: Record<string, unknown> | null;
}
