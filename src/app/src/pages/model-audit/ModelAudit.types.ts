export interface ScanPath {
  path: string;
  type: 'file' | 'directory';
  name: string;
}

export interface ScanOptions {
  blacklist: string[];
  timeout: number;
  maxFileSize?: number;
  verbose: boolean;
}

export interface ScanIssue {
  severity: 'error' | 'warning' | 'info' | 'debug';
  message: string;
  location?: string | null;
  details?: Record<string, any>;
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
