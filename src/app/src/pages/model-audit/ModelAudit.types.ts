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
