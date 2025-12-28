/**
 * Traces API DTOs.
 *
 * These schemas define the request/response shapes for trace-related endpoints.
 */
import { z } from 'zod';

// =============================================================================
// Common Trace Types
// =============================================================================

/**
 * Span schema representing a single operation within a trace.
 * Matches spansTable from src/database/tables.ts
 * Note: Uses statusCode (integer) and statusMessage (text), NOT a status enum.
 */
export const SpanSchema = z.object({
  id: z.string().optional(),
  traceId: z.string().optional(),
  spanId: z.string(),
  parentSpanId: z.string().nullable().optional(),
  name: z.string(),
  startTime: z.number(),
  endTime: z.number().nullable().optional(),
  attributes: z.record(z.unknown()).nullable().optional(),
  statusCode: z.number().nullable().optional(),
  statusMessage: z.string().nullable().optional(),
});
export type Span = z.infer<typeof SpanSchema>;

/**
 * Trace schema representing a complete trace with spans.
 * Matches the tracesTable schema from src/database/tables.ts
 *
 * Note: createdAt is normalized to Unix epoch milliseconds by TraceStore.
 * Legacy string timestamps from SQLite's CURRENT_TIMESTAMP are converted on read.
 */
export const TraceSchema = z.object({
  id: z.string().optional(),
  traceId: z.string(),
  evaluationId: z.string().optional(),
  testCaseId: z.union([z.string(), z.number()]).optional(),
  createdAt: z.number().optional(),
  metadata: z.record(z.unknown()).optional(),
  spans: z.array(SpanSchema).optional(),
});
export type Trace = z.infer<typeof TraceSchema>;

// =============================================================================
// GET /api/traces/evaluation/:evaluationId
// =============================================================================

/**
 * Params for GET /api/traces/evaluation/:evaluationId
 */
export const GetTracesByEvaluationParamsSchema = z.object({
  evaluationId: z.string(),
});
export type GetTracesByEvaluationParams = z.infer<typeof GetTracesByEvaluationParamsSchema>;

/**
 * Response for GET /api/traces/evaluation/:evaluationId
 */
export const GetTracesByEvaluationResponseSchema = z.object({
  traces: z.array(TraceSchema),
});
export type GetTracesByEvaluationResponse = z.infer<typeof GetTracesByEvaluationResponseSchema>;

// =============================================================================
// GET /api/traces/:traceId
// =============================================================================

/**
 * Params for GET /api/traces/:traceId
 */
export const GetTraceParamsSchema = z.object({
  traceId: z.string(),
});
export type GetTraceParams = z.infer<typeof GetTraceParamsSchema>;

/**
 * Response for GET /api/traces/:traceId
 */
export const GetTraceResponseSchema = z.object({
  trace: TraceSchema,
});
export type GetTraceResponse = z.infer<typeof GetTraceResponseSchema>;
