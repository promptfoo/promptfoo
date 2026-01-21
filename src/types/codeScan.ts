import { z } from 'zod';

// ============================================================================
// Enums
// ============================================================================

export const CodeScanSeverity = {
  CRITICAL: 'critical',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
  NONE: 'none',
} as const;
export type CodeScanSeverity = (typeof CodeScanSeverity)[keyof typeof CodeScanSeverity];

// Zod schema for CodeScanSeverity validation
export const CodeScanSeveritySchema = z.enum(['critical', 'high', 'medium', 'low', 'none']);

export const FileChangeStatus = {
  ADDED: 'added',
  MODIFIED: 'modified',
  REMOVED: 'removed',
  RENAMED: 'renamed',
} as const;
export type FileChangeStatus = (typeof FileChangeStatus)[keyof typeof FileChangeStatus];

// ============================================================================
// Severity Utility Types
// ============================================================================

export interface SeverityDisplay {
  emoji: string;
  rank: number;
}

export interface SeverityCounts {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
}

// ============================================================================
// Severity Utility Functions
// ============================================================================

/**
 * Get emoji representation for a severity level
 * @param severity - The severity level
 * @returns Emoji string representing the severity
 */
export function getSeverityEmoji(severity: CodeScanSeverity): string {
  switch (severity) {
    case CodeScanSeverity.CRITICAL:
      return '🔴';
    case CodeScanSeverity.HIGH:
      return '🟠';
    case CodeScanSeverity.MEDIUM:
      return '🟡';
    case CodeScanSeverity.LOW:
      return '🔵';
    case CodeScanSeverity.NONE:
      return '👍';
  }
}

/**
 * Get numeric rank for a severity level (used for sorting)
 * @param severity - The severity level
 * @returns Numeric rank (higher = more severe)
 */
export function getSeverityRank(severity: CodeScanSeverity): number {
  switch (severity) {
    case CodeScanSeverity.CRITICAL:
      return 4;
    case CodeScanSeverity.HIGH:
      return 3;
    case CodeScanSeverity.MEDIUM:
      return 2;
    case CodeScanSeverity.LOW:
      return 1;
    case CodeScanSeverity.NONE:
      return -1;
  }
}

/**
 * Get display information for a severity level (emoji + rank)
 * @param severity - The severity level
 * @returns Object with emoji and rank properties
 */
export function getSeverityDisplay(severity: CodeScanSeverity): SeverityDisplay {
  return {
    emoji: getSeverityEmoji(severity),
    rank: getSeverityRank(severity),
  };
}

/**
 * Format severity level for display
 * @param severity - The severity level (optional, returns empty string if undefined)
 * @param style - Display style ('plain' or 'markdown')
 * @returns Formatted severity string
 */
export function formatSeverity(
  severity: CodeScanSeverity | undefined,
  style: 'plain' | 'markdown' = 'plain',
): string {
  if (!severity) {
    return '';
  }

  const emoji = getSeverityEmoji(severity);
  const displayText = severity === CodeScanSeverity.NONE ? 'All Clear' : capitalize(severity);

  if (style === 'markdown') {
    return `_${emoji} ${displayText}_\n\n`;
  }

  return `${emoji} ${displayText}`;
}

/**
 * Count comments by severity level
 * @param comments - Array of comments with severity property (optional severity)
 * @returns Object with counts for each severity level
 */
export function countBySeverity(comments: Array<{ severity?: CodeScanSeverity }>): SeverityCounts {
  const validSeverities: CodeScanSeverity[] = [
    CodeScanSeverity.CRITICAL,
    CodeScanSeverity.HIGH,
    CodeScanSeverity.MEDIUM,
    CodeScanSeverity.LOW,
  ];
  const issuesOnly = comments.filter((c) => c.severity && validSeverities.includes(c.severity));

  return {
    total: issuesOnly.length,
    critical: issuesOnly.filter((c) => c.severity === CodeScanSeverity.CRITICAL).length,
    high: issuesOnly.filter((c) => c.severity === CodeScanSeverity.HIGH).length,
    medium: issuesOnly.filter((c) => c.severity === CodeScanSeverity.MEDIUM).length,
    low: issuesOnly.filter((c) => c.severity === CodeScanSeverity.LOW).length,
  };
}

/**
 * Helper function to capitalize the first letter of a string
 */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Validates and parses a severity string into CodeScanSeverity enum
 * Normalizes input by trimming whitespace and converting to lowercase
 * @param severity - String input to validate (e.g., "high", "CRITICAL", " medium ")
 * @returns Validated CodeScanSeverity enum value
 * @throws {z.ZodError} if severity is not a valid CodeScanSeverity value
 * @example
 * validateSeverity('high') // Returns CodeScanSeverity.HIGH
 * validateSeverity('CRITICAL') // Returns CodeScanSeverity.CRITICAL
 * validateSeverity('invalid') // Throws ZodError
 */
export function validateSeverity(severity: string): CodeScanSeverity {
  // Normalize input: trim whitespace and convert to lowercase
  const normalized = severity.trim().toLowerCase();

  // Validate against schema using zod
  return CodeScanSeveritySchema.parse(normalized);
}

// ============================================================================
// Scan Request/Response Schemas (API endpoint payload)
// ============================================================================

/**
 * Schema for a valid line range in a file's diff.
 * Used for validating PR comment line numbers.
 */
export const LineRangeSchema = z.object({
  start: z.number(),
  end: z.number(),
});

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
  /** Valid line ranges in the NEW file (for PR comment validation) */
  lineRanges: z.array(LineRangeSchema).optional(),
});

export const GitMetadataSchema = z.object({
  branch: z.string(),
  baseBranch: z.string(),
  baseRef: z.string(), // Original git ref (e.g., "main", "v1.0")
  baseSha: z.string(), // Resolved SHA (e.g., "a1b2c3d...")
  compareRef: z.string(), // Original git ref (e.g., "feature-branch")
  compareSha: z.string(), // Resolved SHA
  commitMessages: z.array(z.string()),
  author: z.string(),
  timestamp: z.string(),
});

export const ScanConfigSchema = z.object({
  minimumSeverity: CodeScanSeveritySchema,
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
  sessionId: z.string(),
  pullRequest: PullRequestContextSchema.optional(),
});

export const CommentSchema = z.object({
  file: z.string().nullable(),
  startLine: z.number().nullable().optional(),
  line: z.number().nullable(),
  finding: z.string(),
  fix: z.string().nullable().optional(),
  severity: CodeScanSeveritySchema.optional(),
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

export type LineRange = z.infer<typeof LineRangeSchema>;

// Scan Request/Response
export type FileRecord = z.infer<typeof FileRecordSchema>;
export type GitMetadata = z.infer<typeof GitMetadataSchema>;
export type ScanConfig = z.infer<typeof ScanConfigSchema>;
export type PullRequestContext = z.infer<typeof PullRequestContextSchema>;
export type ScanRequest = z.infer<typeof ScanRequestSchema>;
export type Comment = z.infer<typeof CommentSchema>;
export type PhaseResults = z.infer<typeof PhaseResultsSchema>;
export type ScanResponse = z.infer<typeof ScanResponseSchema>;

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

// Socket types
export interface SocketAuthCredentials {
  apiKey?: string;
  oidcToken?: string;
  // Fork PR authentication (when OIDC unavailable due to GitHub blocking OIDC for forks)
  forkPR?: {
    owner: string;
    repo: string;
    number: number;
  };
}

// GitHub types
export interface ParsedGitHubPR {
  owner: string;
  repo: string;
  number: number;
}

export interface FileChange {
  path: string;
  status: FileChangeStatus;
}

// ============================================================================
// Error Classes
// ============================================================================

/**
 * Error thrown when git operations fail
 */
export class GitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GitError';
  }
}

/**
 * Error thrown when git metadata extraction fails
 */
export class GitMetadataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GitMetadataError';
  }
}

/**
 * Error thrown when diff processing fails
 */
export class DiffProcessorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DiffProcessorError';
  }
}

/**
 * Error thrown when MCP filesystem server startup fails
 */
export class FilesystemMcpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FilesystemMcpError';
  }
}

/**
 * Error thrown when Socket.io MCP bridge connection fails
 */
export class SocketIoMcpBridgeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SocketIoMcpBridgeError';
  }
}

/**
 * Error thrown when config file loading or parsing fails
 */
export class ConfigLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigLoadError';
  }
}
