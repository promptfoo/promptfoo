export interface ModelAuditIssue {
  severity: 'error' | 'warning' | 'info' | 'debug' | 'critical';
  message: string;
  location?: string;
  details?: Record<string, unknown>;
  why?: string;
}

export interface ModelAuditScanResults {
  path: string;
  issues: ModelAuditIssue[];
  success: boolean;
  scannedFiles: number;
  totalFiles?: number;
  duration?: number;
  rawOutput?: string;
  scannedFilesList?: string[];
}

export interface ModelAuditScanConfig {
  paths: string[];
  options: {
    blacklist?: string[];
    timeout?: number;
    maxFileSize?: number;
    maxTotalSize?: number;
    verbose?: boolean;
  };
}
