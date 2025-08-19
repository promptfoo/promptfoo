export interface ModelAuditCheck {
  name: string;
  status: 'passed' | 'failed';
  message: string;
  location: string;
  details?: Record<string, unknown>;
  timestamp: number;
  severity?: 'error' | 'warning' | 'info' | 'debug' | 'critical';
  why?: string;
}

export interface ModelAuditIssue {
  severity: 'error' | 'warning' | 'info' | 'debug' | 'critical';
  message: string;
  location?: string;
  details?: Record<string, unknown>;
  why?: string;
  timestamp: number;
}

export interface ModelAuditAsset {
  path: string;
  type: string;
  size: number;
}

export interface ModelAuditFileMetadata {
  file_size: number;
  file_hashes: {
    md5: string;
    sha256: string;
    sha512?: string;
  };
  max_stack_depth?: number;
  ml_context?: {
    frameworks: Record<string, unknown>;
    overall_confidence: number;
    is_ml_content: boolean;
    detected_patterns: string[];
  };
  opcode_count?: number;
  suspicious_count?: number;
  license_info?: string[];
  copyright_notices?: string[];
  license_files_nearby?: string[];
  is_dataset?: boolean;
  is_model?: boolean;
}

export interface ModelAuditScanResults {
  // Core results
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

  // Legacy fields for backwards compatibility
  path?: string;
  success?: boolean;
  scannedFiles?: number;
  totalFiles?: number;
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
    format?: 'text' | 'json';
  };
}
