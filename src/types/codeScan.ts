import { z } from 'zod';

// ============================================================================
// Enums
// ============================================================================

export enum SeverityLevel {
  NONE = 'none',
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

// ============================================================================
// Scan Request/Response Schemas (API endpoint payload)
// ============================================================================

export const FileRecordSchema = z.object({
  path: z.string(),
  status: z.string(),
  shaA: z.string().nullable(),
  shaB: z.string().nullable(),
  linesAdded: z.number().optional(),
  linesRemoved: z.number().optional(),
  beforeSizeBytes: z.number().optional(),
  afterSizeBytes: z.number().optional(),
  isText: z.boolean().optional(),
  skipReason: z.string().optional(),
  patch: z.string().optional(),
});

export const GitMetadataSchema = z.object({
  branch: z.string(),
  baseBranch: z.string(),
  commitMessages: z.array(z.string()),
  author: z.string(),
  timestamp: z.string(),
});

export const ScanConfigSchema = z.object({
  minimumSeverity: z.nativeEnum(SeverityLevel),
  diffsOnly: z.boolean(),
  guidance: z.string().optional(),
});

export const PullRequestContextSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  number: z.number(),
  sha: z.string(),
});

export const ScanRequestSchema = z.object({
  files: z.array(FileRecordSchema).min(1, 'Files array cannot be empty'),
  metadata: GitMetadataSchema,
  config: ScanConfigSchema,
  sessionId: z.string().optional(),
  pullRequest: PullRequestContextSchema.optional(),
});

export const CommentSchema = z.object({
  file: z.string().nullable(),
  startLine: z.number().nullable().optional(),
  line: z.number().nullable(),
  finding: z.string(),
  fix: z.string().nullable().optional(),
  severity: z.nativeEnum(SeverityLevel).optional(),
  aiAgentPrompt: z.string().nullable().optional(),
});

export const PhaseResultsSchema = z.object({
  inventory: z.string(),
  tracing: z.string(),
  analysis: z.string(),
  filtering: z.string(),
  fixes: z.string(),
  comments: z.string(),
});

export const ScanResponseSchema = z.object({
  success: z.boolean(),
  review: z.string().optional(),
  comments: z.array(CommentSchema),
  commentsPosted: z.boolean().optional(), // True if server posted comments, false if action should post them
  batchCount: z.number().optional(),
  error: z.string().optional(),
});

// ============================================================================
// TypeScript Types (inferred from schemas)
// ============================================================================

// Scan Request/Response
export type FileRecord = z.infer<typeof FileRecordSchema>;
export type GitMetadata = z.infer<typeof GitMetadataSchema>;
export type ScanConfig = z.infer<typeof ScanConfigSchema>;
export type PullRequestContext = z.infer<typeof PullRequestContextSchema>;
export type ScanRequest = z.infer<typeof ScanRequestSchema>;
export type Comment = z.infer<typeof CommentSchema>;
export type PhaseResults = z.infer<typeof PhaseResultsSchema>;
export type ScanResponse = z.infer<typeof ScanResponseSchema>;

// ============================================================================
// MCP / JSON-RPC Types
// ============================================================================

/**
 * JSON-RPC 2.0 message structure for MCP communication
 * Used for Socket.IO transport and MCP server communication
 */
export interface JsonRpcMessage {
  jsonrpc: '2.0';
  id?: string | number | null;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
  // Allow additional properties for internal routing (e.g., _batch_id)
  [key: string]: unknown;
}
