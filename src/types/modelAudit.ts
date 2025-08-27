export interface ModelAuditCheck {
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  message: string;
  location?: string;
  details?: Record<string, unknown>;
  timestamp?: number;
  severity?: 'error' | 'warning' | 'info' | 'debug' | 'critical';
  why?: string;
}

export interface ModelAuditIssue {
  severity: 'error' | 'warning' | 'info' | 'debug' | 'critical';
  message: string;
  location?: string;
  details?: Record<string, unknown>;
  why?: string;
  timestamp?: number;
}

export interface ModelAuditAsset {
  path: string;
  type: string;
  size?: number; // Making size optional since it's not present in the example
}

export interface ModelAuditFileMetadata {
  // File hash information - making these optional
  file_size?: number;
  file_hashes?: {
    md5?: string;
    sha256?: string;
    sha512?: string;
  };

  // Analysis metadata - all optional
  max_stack_depth?: number;
  ml_context?: {
    frameworks: Record<string, unknown>;
    overall_confidence: number;
    is_ml_content: boolean;
    detected_patterns: string[];
  };
  opcode_count?: number;
  suspicious_count?: number;

  // License and copyright info
  license_info?: string[];
  copyright_notices?: string[];
  license_files_nearby?: string[];

  // Model/dataset flags
  is_dataset?: boolean;
  is_model?: boolean;
}

/**
 * Results from a model audit scan.
 * Contains information about scanned files, detected issues, and metadata.
 * Based on the actual CLI output structure from ModelAudit tool.
 */
export type ModelAuditScanResults = Partial<{
  // Core results that are usually present
  bytes_scanned: number;
  issues: ModelAuditIssue[];
  checks: ModelAuditCheck[];

  // File information
  files_scanned: number;
  assets: ModelAuditAsset[];
  file_metadata: Record<string, ModelAuditFileMetadata>;

  // Summary stats
  has_errors: boolean;
  scanner_names: string[];
  start_time: number;
  duration: number;
  total_checks: number;
  passed_checks: number;
  failed_checks: number;

  // Additional fields that may be added by the server
  path: string;
  success: boolean;
  rawOutput: string;
  scannedFilesList: string[];
  auditId: string;
  persisted: boolean;

  // Legacy camelCase fields (for backward compatibility)
  scannedFiles: number;
  totalFiles: number;
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
}>;

export interface ModelAuditScanConfig {
  paths: string[];
  options: {
    blacklist?: string[];
    timeout?: number;
    maxFileSize?: number;
    maxTotalSize?: number;
    verbose?: boolean;
    format?: 'text' | 'json';
  };
}
