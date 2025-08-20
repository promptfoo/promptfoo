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
  // Note: modelaudit scanner outputs 'critical' severity, which is mapped to 'error'
  // internally. The UI displays 'critical' to users for clarity.
  severity: 'error' | 'warning' | 'info' | 'debug';
  message: string;
  location?: string | null;
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

export interface ScanResult {
  path: string;
  issues: ScanIssue[];
  success: boolean;
  scannedFiles?: number;
  totalFiles?: number;
  duration?: number;
  rawOutput?: string;
  scannedFilesList?: string[];

  // Check-related fields
  checks?: ScanCheck[];
  total_checks?: number;
  passed_checks?: number;
  failed_checks?: number;
  assets?: ScanAsset[];
  files_scanned?: number;

  // Alternative camelCase versions (for compatibility)
  totalChecks?: number;
  passedChecks?: number;
  failedChecks?: number;
  filesScanned?: number;
}
