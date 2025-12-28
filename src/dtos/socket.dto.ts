/**
 * WebSocket Event DTOs.
 *
 * These schemas define the event payloads for socket.io events
 * between the server and client.
 *
 * Events:
 * - 'init': Sent on connection with latest eval
 * - 'update': Sent when an eval is updated
 */
import { z } from 'zod';

// =============================================================================
// Eval Summary (serialized Eval instance)
// =============================================================================

/**
 * Eval summary sent over socket.io.
 * Contains only the public fields needed by the frontend.
 *
 * Note: The Eval class may have additional internal fields (prefixed with _)
 * that get serialized, but they are not part of the public API contract
 * and should not be relied upon by clients.
 */
export const EvalSummarySchema = z
  .object({
    id: z.string(),
    createdAt: z.number(),
    author: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    config: z.record(z.unknown()).optional(),
    prompts: z.array(z.unknown()).optional(),
    datasetId: z.string().nullable().optional(),
    persisted: z.boolean().optional(),
    vars: z.array(z.string()).nullable().optional(),
    durationMs: z.number().optional(),
  })
  .passthrough();
export type EvalSummary = z.infer<typeof EvalSummarySchema>;

// =============================================================================
// Socket Events
// =============================================================================

/**
 * Payload for 'init' event.
 * Sent when a client connects to the socket.
 * Contains the latest eval or undefined if none exists.
 */
export const SocketInitPayloadSchema = EvalSummarySchema.nullable();
export type SocketInitPayload = z.infer<typeof SocketInitPayloadSchema>;

/**
 * Payload for 'update' event.
 * Sent when an eval is updated (e.g., new results available).
 * Contains the updated eval.
 */
export const SocketUpdatePayloadSchema = EvalSummarySchema;
export type SocketUpdatePayload = z.infer<typeof SocketUpdatePayloadSchema>;

// =============================================================================
// Typed Socket Interface
// =============================================================================

/**
 * Server-to-client events for type-safe socket.io usage.
 *
 * Usage on server:
 *   io.emit('update', evalData satisfies SocketUpdatePayload);
 *
 * Usage on client:
 *   socket.on('init', (data: SocketInitPayload) => { ... });
 *   socket.on('update', (data: SocketUpdatePayload) => { ... });
 */
export interface ServerToClientEvents {
  init: (data: SocketInitPayload) => void;
  update: (data: SocketUpdatePayload) => void;
}

/**
 * Client-to-server events (currently none).
 */
export interface ClientToServerEvents {
  // Add client-to-server events here as needed
}
