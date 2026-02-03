/**
 * Minimal structural type for Zod schemas — used for type inference only, no runtime use.
 * Avoids importing Zod as a dependency in consumers that only need type inference.
 *
 * This matches Zod v4's internal _zod property structure.
 */
export interface ZodLikeSchema {
  _zod: { output: unknown };
}

/** Infer the output type from a ZodLikeSchema, or fall back to `unknown`. */
export type InferSchema<T> = T extends { _zod: { output: infer O } } ? O : unknown;

// ─── Agent Protocol Payloads ─────────────────────────────────────────────────

/** Payload for agent:error events */
export interface AgentErrorPayload {
  type: string;
  message: string;
}

/** Payload for agent:cancelled events */
export interface AgentCancelledPayload {
  clientType: string;
}
