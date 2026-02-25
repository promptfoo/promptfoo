import { z } from 'zod';
import { TimestampSchema } from './common';

// ---------------------------------------------------------------------------
// GET /api/model-audit/check-installed
// ---------------------------------------------------------------------------

export const CheckInstalledResponseSchema = z.object({
  installed: z.boolean(),
  version: z.string().nullable(),
  cwd: z.string(),
});

export type CheckInstalledResponse = z.infer<typeof CheckInstalledResponseSchema>;

// ---------------------------------------------------------------------------
// POST /api/model-audit/check-path
// ---------------------------------------------------------------------------

export const CheckPathRequestSchema = z.object({
  path: z.string().trim().min(1, 'No path provided'),
});

export const CheckPathResponseSchema = z.union([
  z.object({ exists: z.literal(false), type: z.null() }),
  z.object({
    exists: z.literal(true),
    type: z.enum(['directory', 'file']),
    absolutePath: z.string(),
    name: z.string(),
  }),
]);

export type CheckPathRequest = z.infer<typeof CheckPathRequestSchema>;
export type CheckPathResponse = z.infer<typeof CheckPathResponseSchema>;

// ---------------------------------------------------------------------------
// POST /api/model-audit/scan
// ---------------------------------------------------------------------------

export const ScanRequestSchema = z.object({
  paths: z
    .array(z.string())
    .min(1, 'No paths provided')
    .refine((arr) => arr.some((p) => p.trim() !== ''), {
      message: 'No valid paths to scan',
    }),
  options: z
    .object({
      blacklist: z.array(z.string()).optional(),
      timeout: z.number().positive().optional(),
      maxFileSize: z.string().optional(),
      maxTotalSize: z.string().optional(),
      verbose: z.boolean().optional(),
      format: z.enum(['text', 'json', 'sarif']).optional(),
      strict: z.boolean().optional(),
      dryRun: z.boolean().optional(),
      cache: z.boolean().optional(),
      quiet: z.boolean().optional(),
      progress: z.boolean().optional(),
      sbom: z.string().optional(),
      output: z.string().optional(),
      maxSize: z.string().optional(),
      persist: z.boolean().optional(),
      name: z.string().optional(),
      author: z.string().optional(),
    })
    .optional()
    .default({}),
});

export type ScanRequest = z.infer<typeof ScanRequestSchema>;

// Scan response is highly variable (success vs various error shapes),
// so we do not apply a strict response schema.

// ---------------------------------------------------------------------------
// GET /api/model-audit/scans
// ---------------------------------------------------------------------------

export const ListScansQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(100),
  offset: z.coerce.number().int().min(0).optional().default(0),
  sort: z.enum(['createdAt', 'name', 'modelPath']).optional().default('createdAt'),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
  search: z.string().optional(),
});

/** Shape returned by ModelAudit.toJSON(). */
const ModelAuditRecordSchema = z
  .object({
    id: z.string(),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
    name: z.string().nullable().optional(),
    author: z.string().nullable().optional(),
    modelPath: z.string(),
    modelType: z.string().nullable().optional(),
    results: z.unknown(),
    checks: z.unknown().nullable().optional(),
    issues: z.unknown().nullable().optional(),
    hasErrors: z.boolean(),
    totalChecks: z.number().nullable().optional(),
    passedChecks: z.number().nullable().optional(),
    failedChecks: z.number().nullable().optional(),
    metadata: z.unknown().nullable().optional(),
  })
  .passthrough();

export const ListScansResponseSchema = z.object({
  scans: z.array(ModelAuditRecordSchema),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
});

export type ListScansQuery = z.infer<typeof ListScansQuerySchema>;
export type ListScansResponse = z.infer<typeof ListScansResponseSchema>;

// ---------------------------------------------------------------------------
// GET /api/model-audit/scans/latest
// ---------------------------------------------------------------------------

export const GetLatestScanResponseSchema = ModelAuditRecordSchema;

export type GetLatestScanResponse = z.infer<typeof GetLatestScanResponseSchema>;

// ---------------------------------------------------------------------------
// GET /api/model-audit/scans/:id
// ---------------------------------------------------------------------------

export const GetScanParamsSchema = z.object({
  id: z.string().min(1),
});

export const GetScanResponseSchema = ModelAuditRecordSchema;

export type GetScanParams = z.infer<typeof GetScanParamsSchema>;
export type GetScanResponse = z.infer<typeof GetScanResponseSchema>;

// ---------------------------------------------------------------------------
// DELETE /api/model-audit/scans/:id
// ---------------------------------------------------------------------------

export const DeleteScanParamsSchema = z.object({
  id: z.string().min(1),
});

export const DeleteScanResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
});

export type DeleteScanParams = z.infer<typeof DeleteScanParamsSchema>;
export type DeleteScanResponse = z.infer<typeof DeleteScanResponseSchema>;

// ---------------------------------------------------------------------------
// Grouped schemas for server-side validation
// ---------------------------------------------------------------------------

export const ModelAuditSchemas = {
  CheckInstalled: {
    Response: CheckInstalledResponseSchema,
  },
  CheckPath: {
    Request: CheckPathRequestSchema,
    Response: CheckPathResponseSchema,
  },
  Scan: {
    Request: ScanRequestSchema,
  },
  ListScans: {
    Query: ListScansQuerySchema,
    Response: ListScansResponseSchema,
  },
  GetLatestScan: {
    Response: GetLatestScanResponseSchema,
  },
  GetScan: {
    Params: GetScanParamsSchema,
    Response: GetScanResponseSchema,
  },
  DeleteScan: {
    Params: DeleteScanParamsSchema,
    Response: DeleteScanResponseSchema,
  },
} as const;
