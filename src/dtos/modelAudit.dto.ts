/**
 * Model Audit API DTOs.
 *
 * These schemas define the request/response shapes for model audit endpoints.
 */
import { z } from 'zod';

// =============================================================================
// Common Model Audit Types
// =============================================================================

/**
 * Model audit check result.
 * Matches ModelAuditCheck from src/types/modelAudit.ts
 */
export const ModelAuditCheckSchema = z.object({
  name: z.string(),
  status: z.enum(['passed', 'failed', 'skipped']),
  message: z.string(),
  location: z.string().optional(),
  details: z.record(z.unknown()).optional(),
  timestamp: z.number().optional(),
  severity: z.enum(['error', 'warning', 'info', 'debug', 'critical']).optional(),
  why: z.string().optional(),
});
export type ModelAuditCheck = z.infer<typeof ModelAuditCheckSchema>;

/**
 * Model audit issue.
 * Matches ModelAuditIssue from src/types/modelAudit.ts
 */
export const ModelAuditIssueSchema = z.object({
  severity: z.enum(['error', 'warning', 'info', 'debug', 'critical']),
  message: z.string(),
  location: z.string().optional(),
  details: z.record(z.unknown()).optional(),
  why: z.string().optional(),
  timestamp: z.number().optional(),
});
export type ModelAuditIssue = z.infer<typeof ModelAuditIssueSchema>;

/**
 * Model audit asset.
 * Matches ModelAuditAsset from src/types/modelAudit.ts
 */
export const ModelAuditAssetSchema = z.object({
  path: z.string(),
  type: z.string(),
  size: z.number().optional(),
});
export type ModelAuditAsset = z.infer<typeof ModelAuditAssetSchema>;

/**
 * Model scan results.
 * Matches ModelAuditScanResults from src/types/modelAudit.ts
 * All fields are optional as the type is Partial<{...}>
 */
export const ModelAuditScanResultsSchema = z.object({
  // Core results
  bytes_scanned: z.number().optional(),
  issues: z.array(ModelAuditIssueSchema).optional(),
  checks: z.array(ModelAuditCheckSchema).optional(),

  // File information
  files_scanned: z.number().optional(),
  assets: z.array(ModelAuditAssetSchema).optional(),
  file_metadata: z.record(z.unknown()).optional(),

  // Summary stats
  has_errors: z.boolean().optional(),
  scanner_names: z.array(z.string()).optional(),
  start_time: z.number().optional(),
  duration: z.number().optional(),
  total_checks: z.number().optional(),
  passed_checks: z.number().optional(),
  failed_checks: z.number().optional(),

  // Additional fields added by server
  path: z.string().optional(),
  success: z.boolean().optional(),
  rawOutput: z.string().optional(),
  scannedFilesList: z.array(z.string()).optional(),
  auditId: z.string().optional(),
  persisted: z.boolean().optional(),
  content_hash: z.string().optional(),

  // Legacy camelCase fields (backward compatibility)
  scannedFiles: z.number().optional(),
  totalFiles: z.number().optional(),
  totalChecks: z.number().optional(),
  passedChecks: z.number().optional(),
  failedChecks: z.number().optional(),
});
export type ModelAuditScanResults = z.infer<typeof ModelAuditScanResultsSchema>;

/**
 * Model audit record from database.
 * Matches ModelAuditRecord interface from src/models/modelAudit.ts
 * Note: Timestamps are Unix integers from SQLite database.
 */
export const ModelAuditRecordSchema = z.object({
  id: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  name: z.string().nullable().optional(),
  author: z.string().nullable().optional(),
  modelPath: z.string(),
  modelType: z.string().nullable().optional(),
  results: ModelAuditScanResultsSchema,
  checks: z.array(ModelAuditCheckSchema).nullable().optional(),
  issues: z.array(ModelAuditIssueSchema).nullable().optional(),
  hasErrors: z.boolean(),
  totalChecks: z.number().nullable().optional(),
  passedChecks: z.number().nullable().optional(),
  failedChecks: z.number().nullable().optional(),
  metadata: z.record(z.unknown()).nullable().optional(),
  // Revision tracking fields for deduplication
  modelId: z.string().nullable().optional(),
  revisionSha: z.string().nullable().optional(),
  contentHash: z.string().nullable().optional(),
  modelSource: z.string().nullable().optional(),
});
export type ModelAuditRecord = z.infer<typeof ModelAuditRecordSchema>;

// =============================================================================
// GET /api/model-audit/check-installed
// =============================================================================

/**
 * Response for GET /api/model-audit/check-installed
 */
export const CheckInstalledResponseSchema = z.object({
  installed: z.boolean(),
  version: z.string().nullable().optional(),
  cwd: z.string(),
});
export type CheckInstalledResponse = z.infer<typeof CheckInstalledResponseSchema>;

// =============================================================================
// POST /api/model-audit/check-path
// =============================================================================

/**
 * Request body for POST /api/model-audit/check-path
 */
export const CheckPathRequestSchema = z.object({
  path: z.string(),
});
export type CheckPathRequest = z.infer<typeof CheckPathRequestSchema>;

/**
 * Response for POST /api/model-audit/check-path
 */
export const CheckPathResponseSchema = z.object({
  exists: z.boolean(),
  type: z.enum(['file', 'directory']).nullable().optional(),
  absolutePath: z.string().optional(),
  name: z.string().optional(),
});
export type CheckPathResponse = z.infer<typeof CheckPathResponseSchema>;

// =============================================================================
// POST /api/model-audit/scan
// =============================================================================

/**
 * Request body for POST /api/model-audit/scan
 */
export const ScanRequestSchema = z.object({
  paths: z.array(z.string()).min(1),
  options: z
    .object({
      name: z.string().optional(),
      author: z.string().optional(),
      blacklist: z.array(z.string()).optional(),
      timeout: z.number().optional(),
      maxFileSize: z.number().optional(),
      maxTotalSize: z.number().optional(),
      verbose: z.boolean().optional(),
      persist: z.boolean().optional(),
    })
    .optional(),
});
export type ScanRequest = z.infer<typeof ScanRequestSchema>;

/**
 * Response for POST /api/model-audit/scan
 */
export const ScanResponseSchema = ModelAuditScanResultsSchema.extend({
  rawOutput: z.string().optional(),
  auditId: z.string().optional(),
  persisted: z.boolean(),
});
export type ScanResponse = z.infer<typeof ScanResponseSchema>;

// =============================================================================
// GET /api/model-audit/scans
// =============================================================================

/**
 * Query params for GET /api/model-audit/scans
 */
export const GetScansQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(100),
  offset: z.coerce.number().int().min(0).default(0),
  sort: z.enum(['createdAt', 'name', 'modelPath']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
  search: z.string().optional(),
});
export type GetScansQuery = z.infer<typeof GetScansQuerySchema>;

/**
 * Response for GET /api/model-audit/scans
 */
export const GetScansResponseSchema = z.object({
  scans: z.array(ModelAuditRecordSchema),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
});
export type GetScansResponse = z.infer<typeof GetScansResponseSchema>;

// =============================================================================
// GET /api/model-audit/scans/latest
// =============================================================================

/**
 * Response for GET /api/model-audit/scans/latest
 * Returns a single ModelAuditRecord.
 */
export const GetLatestScanResponseSchema = ModelAuditRecordSchema;
export type GetLatestScanResponse = z.infer<typeof GetLatestScanResponseSchema>;

// =============================================================================
// GET /api/model-audit/scans/:id
// =============================================================================

/**
 * Params for GET /api/model-audit/scans/:id
 */
export const GetScanParamsSchema = z.object({
  id: z.string(),
});
export type GetScanParams = z.infer<typeof GetScanParamsSchema>;

/**
 * Response for GET /api/model-audit/scans/:id
 * Returns a single ModelAuditRecord.
 */
export const GetScanResponseSchema = ModelAuditRecordSchema;
export type GetScanResponse = z.infer<typeof GetScanResponseSchema>;

// =============================================================================
// DELETE /api/model-audit/scans/:id
// =============================================================================

/**
 * Params for DELETE /api/model-audit/scans/:id
 */
export const DeleteScanParamsSchema = z.object({
  id: z.string(),
});
export type DeleteScanParams = z.infer<typeof DeleteScanParamsSchema>;

/**
 * Response for DELETE /api/model-audit/scans/:id
 */
export const DeleteScanResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});
export type DeleteScanResponse = z.infer<typeof DeleteScanResponseSchema>;

// =============================================================================
// Error Responses
// =============================================================================

/**
 * Standard error response for model audit endpoints.
 */
export const ModelAuditErrorResponseSchema = z.object({
  error: z.string(),
  details: z.string().optional(),
  suggestion: z.string().optional(),
  exitCode: z.number().optional(),
  stderr: z.string().optional(),
  stdout: z.string().optional(),
  type: z.string().optional(),
  debug: z
    .object({
      command: z.string().optional(),
      args: z.array(z.string()).optional(),
      paths: z.array(z.string()).optional(),
      cwd: z.string().optional(),
      exitCode: z.number().nullable().optional(),
    })
    .optional(),
});
export type ModelAuditErrorResponse = z.infer<typeof ModelAuditErrorResponseSchema>;
