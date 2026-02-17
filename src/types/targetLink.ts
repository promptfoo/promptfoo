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
  /** Server is waiting for CLI to connect (informational, for web UI) */
  WAITING: 'link:waiting_for_cli',
  /** CLI has connected (informational, for web UI) */
  CONNECTED: 'link:cli_connected',
  /** CLI disconnected unexpectedly (for web UI + agent policy) */
  DISCONNECTED: 'link:cli_disconnected',
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

// ─── Types ───────────────────────────────────────────────

export type ProbeRequest = z.infer<typeof ProbeRequestSchema>;
export type ProbeResult = z.infer<typeof ProbeResultSchema>;
export type TokenUsage = z.infer<typeof TokenUsageSchema>;
