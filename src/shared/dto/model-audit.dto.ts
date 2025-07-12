import { z } from 'zod';

// Model audit schemas
export const ModelAuditDTOSchemas = {
  CheckInstalled: {
    Response: z.object({
      installed: z.boolean(),
      cwd: z.string(),
    }),
  },
  CheckPath: {
    Request: z.object({
      path: z.string(),
    }),
    Response: z.object({
      exists: z.boolean(),
      type: z.enum(['file', 'directory', 'other']).optional(),
      absolutePath: z.string(),
      name: z.string(),
    }),
  },
  Scan: {
    Request: z.object({
      paths: z.array(z.string()),
      options: z.object({
        outputFormat: z.enum(['json', 'html']).optional(),
        outputFile: z.string().optional(),
        modelFormats: z.array(z.string()).optional(),
        exclude: z.array(z.string()).optional(),
        verbose: z.boolean().optional(),
      }).optional(),
    }),
    Response: z.object({
      success: z.boolean(),
      output: z.string().optional(),
      error: z.string().optional(),
      results: z.object({
        totalFiles: z.number(),
        scannedFiles: z.number(),
        findings: z.array(z.object({
          file: z.string(),
          severity: z.enum(['low', 'medium', 'high', 'critical']),
          type: z.string(),
          message: z.string(),
          details: z.any().optional(),
        })),
        summary: z.object({
          critical: z.number(),
          high: z.number(),
          medium: z.number(),
          low: z.number(),
        }),
      }).optional(),
    }),
  },
};

// Type exports
export type ModelAuditCheckInstalledResponse = z.infer<typeof ModelAuditDTOSchemas.CheckInstalled.Response>;
export type ModelAuditCheckPathRequest = z.infer<typeof ModelAuditDTOSchemas.CheckPath.Request>;
export type ModelAuditCheckPathResponse = z.infer<typeof ModelAuditDTOSchemas.CheckPath.Response>;
export type ModelAuditScanRequest = z.infer<typeof ModelAuditDTOSchemas.Scan.Request>;
export type ModelAuditScanResponse = z.infer<typeof ModelAuditDTOSchemas.Scan.Response>;