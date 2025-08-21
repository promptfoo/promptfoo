import { ModelAuditCheck } from '@promptfoo/types/modelAudit';
export interface ScanPath {
  path: string;
  type: 'file' | 'directory';
  name: string;
}

export interface ScanOptions {
  blacklist: string[];
  timeout: number;
  maxFileSize?: number;
  maxTotalSize?: number;
  verbose: boolean;
  author?: string;
}

export interface ScanIssue {
  // Note: modelaudit scanner can output both 'critical' and 'error' severity.
  // Both are treated as critical/error level issues in the UI.
  severity: 'error' | 'critical' | 'warning' | 'info' | 'debug';
  message: string;
  location?: string;
  details?: Record<string, any> & {
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

// Import the backend type to ensure consistency
import type { ModelAuditScanResults } from '../../../../types/modelAudit';

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
