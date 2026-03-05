/**
 * Shared types and event constants for the TargetLink connection.
 *
 * Source of truth for both CLI and server — import from here, not from
 * implementation files.
 */

import { z } from 'zod';

// ─── Events ──────────────────────────────────────────────

export const TargetLinkEvents = {
  /** CLI signals it can accept probes */
  READY: 'link:ready',
  /** Server requests a probe */
  PROBE: 'link:probe',
  /** CLI returns probe result */
  PROBE_RESULT: 'link:probe_result',
  /** Server requests an HTTP probe (setup agent) */
  PROBE_HTTP: 'link:probe_http',
  /** CLI returns HTTP probe result */
  PROBE_HTTP_RESULT: 'link:probe_http_result',
  /** Server is waiting for CLI to connect (informational, for web UI) */
  WAITING: 'link:waiting_for_cli',
  /** CLI has connected (informational, for web UI) */
  CONNECTED: 'link:cli_connected',
  /** CLI disconnected unexpectedly (for web UI + agent policy) */
  DISCONNECTED: 'link:cli_disconnected',
  /** CLI reports target is unreachable */
  TARGET_UNRESPONSIVE: 'link:target_unresponsive',
  /** Server requests a file read from CLI */
  FS_READ: 'link:fs_read',
  /** CLI returns file read result */
  FS_READ_RESULT: 'link:fs_read_result',
  /** Server requests a directory listing from CLI */
  FS_LIST: 'link:fs_list',
  /** CLI returns directory listing result */
  FS_LIST_RESULT: 'link:fs_list_result',
  /** Server requests a grep search from CLI */
  FS_GREP: 'link:fs_grep',
  /** CLI returns grep search result */
  FS_GREP_RESULT: 'link:fs_grep_result',
  /** Server requests a file write to CLI */
  FS_WRITE: 'link:fs_write',
  /** CLI returns file write result */
  FS_WRITE_RESULT: 'link:fs_write_result',
} as const;

// ─── Schemas ─────────────────────────────────────────────

export const ProbeRequestSchema = z.object({
  requestId: z.string(),
  prompt: z.string(),
});

export const TokenUsageSchema = z.object({
  input: z.number(),
  output: z.number(),
  total: z.number(),
});

export const ProbeResultSchema = z.object({
  requestId: z.string(),
  output: z.string().optional(),
  error: z.string().optional(),
  tokenUsage: TokenUsageSchema.optional(),
});

// ─── HTTP Error Categories ───────────────────────────────

export const HTTP_ERROR_CATEGORIES = [
  'auth',
  'dns',
  'tls',
  'timeout',
  'connection_refused',
  'client_error',
  'server_error',
  'parse',
  'unknown',
] as const;

export type HttpErrorCategory = (typeof HTTP_ERROR_CATEGORIES)[number];

// ─── HTTP Probe Schemas (setup agent) ────────────────────

export const ProbeHttpRequestSchema = z.object({
  requestId: z.string(),
  url: z.string(),
  method: z.string().default('POST'),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.union([z.record(z.string(), z.any()), z.string()]).optional(),
  queryParams: z.record(z.string(), z.string()).optional(),
  tls: z.record(z.string(), z.any()).optional(),
});

export const ProbeHttpResultSchema = z.object({
  requestId: z.string(),
  success: z.boolean(),
  statusCode: z.number().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  rawResponse: z.string().optional(),
  error: z.string().optional(),
  errorCategory: z.enum(HTTP_ERROR_CATEGORIES).optional(),
  latencyMs: z.number().optional(),
  tls: z
    .object({
      subject: z.string().optional(),
      issuer: z.string().optional(),
      validFrom: z.string().optional(),
      validTo: z.string().optional(),
      selfSigned: z.boolean().optional(),
      protocol: z.string().optional(),
    })
    .optional(),
  redirects: z.array(z.object({ url: z.string(), statusCode: z.number() })).optional(),
  finalUrl: z.string().optional(),
  authScheme: z
    .object({
      scheme: z.string(),
      realm: z.string().optional(),
      params: z.record(z.string(), z.string()).optional(),
    })
    .optional(),
});

// ─── Filesystem Schemas (recon) ──────────────────────────

export const FsReadRequestSchema = z.object({
  requestId: z.string(),
  path: z.string(),
});

export const FsReadResultSchema = z.object({
  requestId: z.string(),
  content: z.string().optional(),
  error: z.string().optional(),
});

export const FsListRequestSchema = z.object({
  requestId: z.string(),
  path: z.string(),
});

export const FsListResultSchema = z.object({
  requestId: z.string(),
  entries: z
    .array(
      z.object({
        name: z.string(),
        type: z.enum(['file', 'directory']),
        size: z.number().optional(),
      }),
    )
    .optional(),
  error: z.string().optional(),
});

export const FsGrepRequestSchema = z.object({
  requestId: z.string(),
  pattern: z.string(),
  path: z.string().optional(),
  include: z.string().optional(),
});

export const FsGrepResultSchema = z.object({
  requestId: z.string(),
  matches: z
    .array(
      z.object({
        file: z.string(),
        line: z.number(),
        content: z.string(),
      }),
    )
    .optional(),
  error: z.string().optional(),
  truncated: z.boolean().optional(),
});

// ─── Filesystem Write Schemas ───────────────────────────

export const FsWriteRequestSchema = z.object({
  requestId: z.string(),
  path: z.string(),
  content: z.string(),
  envVarSummary: z.array(z.string()).optional(),
});

export const FsWriteResultSchema = z.object({
  requestId: z.string(),
  success: z.boolean(),
  writtenPath: z.string().optional(),
  error: z.string().optional(),
});

// ─── Ready Payload ──────────────────────────────────────

export const ReadyPayloadSchema = z.object({
  clientName: z.string().optional(),
  capabilities: z.array(z.string()).optional(),
});

// ─── Types ───────────────────────────────────────────────

export type ProbeRequest = z.infer<typeof ProbeRequestSchema>;
export type ProbeResult = z.infer<typeof ProbeResultSchema>;
export type TokenUsage = z.infer<typeof TokenUsageSchema>;
export type ProbeHttpRequest = z.infer<typeof ProbeHttpRequestSchema>;
export type ProbeHttpResult = z.infer<typeof ProbeHttpResultSchema>;
export type ReadyPayload = z.infer<typeof ReadyPayloadSchema>;
export type FsReadRequest = z.infer<typeof FsReadRequestSchema>;
export type FsReadResult = z.infer<typeof FsReadResultSchema>;
export type FsListRequest = z.infer<typeof FsListRequestSchema>;
export type FsListResult = z.infer<typeof FsListResultSchema>;
export type FsGrepRequest = z.infer<typeof FsGrepRequestSchema>;
export type FsGrepResult = z.infer<typeof FsGrepResultSchema>;
export type FsWriteRequest = z.infer<typeof FsWriteRequestSchema>;
export type FsWriteResult = z.infer<typeof FsWriteResultSchema>;
