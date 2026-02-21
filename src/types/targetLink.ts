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
  errorCategory: z.string().optional(),
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
  redirects: z
    .array(z.object({ url: z.string(), statusCode: z.number() }))
    .optional(),
  finalUrl: z.string().optional(),
  authScheme: z
    .object({
      scheme: z.string(),
      realm: z.string().optional(),
      params: z.record(z.string(), z.string()).optional(),
    })
    .optional(),
});

// ─── Types ───────────────────────────────────────────────

export type ProbeRequest = z.infer<typeof ProbeRequestSchema>;
export type ProbeResult = z.infer<typeof ProbeResultSchema>;
export type TokenUsage = z.infer<typeof TokenUsageSchema>;
export type ProbeHttpRequest = z.infer<typeof ProbeHttpRequestSchema>;
export type ProbeHttpResult = z.infer<typeof ProbeHttpResultSchema>;
