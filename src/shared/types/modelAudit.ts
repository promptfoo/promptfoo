// Shared TypeScript types for Model Audit
// These types are generated from Zod schemas in src/server/routes/modelAudit.schemas.ts

export interface ScanIssue {
  severity: 'critical' | 'error' | 'warning' | 'info' | 'debug';
  message: string;
  location?: string;
  timestamp?: number;
  details?: Record<string, any>;
}

export interface ScanResult {
  path: string;
  issues: ScanIssue[];
  success: boolean;
  scannedFiles?: number;
  totalFiles?: number;
  duration?: number;
  scannedFilesList?: string[];
}

export interface ScanSummary {
  id: string;
  name: string | null;
  author?: string | null;
  modelPath: string;
  modelType?: string | null;
  createdAt: number;
  updatedAt?: number;
  hasErrors: boolean;
  totalChecks?: number | null;
  passedChecks?: number | null;
  failedChecks?: number | null;
  results?: { issues?: ScanIssue[] };
  metadata?: Record<string, any> | null;
}

export interface ScanRecord extends ScanSummary {
  results: ScanResult;
}

export interface ScansResponse {
  scans: ScanSummary[];
  total: number;
}

export interface CheckInstalledResponse {
  installed: boolean;
  cwd: string | null;
}

export interface CheckPathRequest {
  path: string;
}

export interface CheckPathResponse {
  exists: boolean;
  type: 'file' | 'directory' | 'unknown';
  name?: string;
}

export interface ScanRequest {
  paths: string[];
  options: {
    blacklist: string[];
    timeout: number;
    verbose?: boolean;
    maxSize?: string;
    name?: string;
    author?: string;
    persist?: boolean;
  };
}

export interface ScanResponse extends ScanResult {
  rawOutput: string;
  auditId?: string;
  persisted?: boolean;
}

export interface ScansQuery {
  limit?: number;
  offset?: number;
  search?: string;
  sort?: 'createdAt' | 'name' | 'status';
  order?: 'asc' | 'desc';
}

export interface DeleteResponse {
  success: boolean;
  message: string;
}