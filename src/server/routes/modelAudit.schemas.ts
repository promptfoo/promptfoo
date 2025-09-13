import { z } from 'zod';

// Core Schema Definitions
export const ZScanIssue = z.object({
  severity: z.enum(['critical', 'error', 'warning', 'info', 'debug']),
  message: z.string(),
  location: z.string().optional(),
  timestamp: z.number().optional(),
  details: z.record(z.any()).optional(),
});

export const ZScanResult = z.object({
  path: z.string(),
  issues: z.array(ZScanIssue),
  success: z.boolean(),
  scannedFiles: z.number().optional(),
  totalFiles: z.number().optional(),
  duration: z.number().optional(),
  scannedFilesList: z.array(z.string()).optional(),
});

export const ZScanSummary = z.object({
  id: z.string(),
  name: z.string().nullable(),
  author: z.string().nullable().optional(),
  modelPath: z.string(),
  modelType: z.string().nullable().optional(),
  createdAt: z.number(),
  updatedAt: z.number().optional(),
  hasErrors: z.boolean(),
  totalChecks: z.number().nullable().optional(),
  passedChecks: z.number().nullable().optional(),
  failedChecks: z.number().nullable().optional(),
  results: z.object({ issues: z.array(ZScanIssue).optional() }).optional(),
  metadata: z.record(z.any()).nullable().optional(),
});

export const ZScanRecord = ZScanSummary.extend({
  results: ZScanResult,
});

// API Request/Response Schemas
export const ZScansResponse = z.object({
  scans: z.array(ZScanSummary),
  total: z.number(),
});

export const ZCheckInstalledResponse = z.object({
  installed: z.boolean(),
  cwd: z.string().nullable(),
});

export const ZCheckPathRequest = z.object({
  path: z.string().min(1),
});

export const ZCheckPathResponse = z.object({
  exists: z.boolean(),
  type: z.enum(['file', 'directory', 'unknown']),
  name: z.string().optional(),
});

export const ZScanRequest = z.object({
  paths: z.array(z.string().min(1)).min(1),
  options: z.object({
    blacklist: z.array(z.string()),
    timeout: z.number().int().positive().max(24 * 3600),
    verbose: z.boolean().optional(),
    maxSize: z.string().optional(),
    name: z.string().optional(),
    author: z.string().optional(),
    persist: z.boolean().optional(),
  }),
});

export const ZScanResponse = ZScanResult.extend({
  rawOutput: z.string(),
  auditId: z.string().optional(),
  persisted: z.boolean().optional(),
});

export const ZScansQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  search: z.string().optional(),
  sort: z.enum(['createdAt', 'name', 'status']).optional().default('createdAt'),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
});

export const ZDeleteResponse = z.object({
  success: z.boolean(),
  message: z.string(),
});

// Inferred TypeScript Types
export type ScanIssue = z.infer<typeof ZScanIssue>;
export type ScanResult = z.infer<typeof ZScanResult>;
export type ScanSummary = z.infer<typeof ZScanSummary>;
export type ScanRecord = z.infer<typeof ZScanRecord>;
export type ScansResponse = z.infer<typeof ZScansResponse>;
export type CheckInstalledResponse = z.infer<typeof ZCheckInstalledResponse>;
export type CheckPathRequest = z.infer<typeof ZCheckPathRequest>;
export type CheckPathResponse = z.infer<typeof ZCheckPathResponse>;
export type ScanRequest = z.infer<typeof ZScanRequest>;
export type ScanResponse = z.infer<typeof ZScanResponse>;
export type ScansQuery = z.infer<typeof ZScansQuery>;
export type DeleteResponse = z.infer<typeof ZDeleteResponse>;