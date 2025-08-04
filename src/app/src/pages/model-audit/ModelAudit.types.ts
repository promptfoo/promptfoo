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

export interface ScanResult {
  path: string;
  issues: ScanIssue[];
  success: boolean;
  scannedFiles?: number;
  totalFiles?: number;
  duration?: number;
  rawOutput?: string;
  scannedFilesList?: string[];
}

export interface ScanHistoryItem {
  id: string;
  createdAt: number;
  author: string | null;
  description: string | null;
  primaryPath: string;
  issueCount: number;
  criticalCount: number;
  warningCount: number;
}

export interface StoredScan {
  id: string;
  createdAt: number;
  author: string | null;
  description: string | null;
  primaryPath: string;
  results: ScanResult;
  config: {
    paths: string[];
    options: ScanOptions;
  };
}

export interface ScanApiResponse extends ScanResult {
  scanId?: string;
}

export interface ScanListApiResponse {
  scans: ScanHistoryItem[];
  total: number;
  limit: number;
  offset: number;
}
