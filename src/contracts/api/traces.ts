import { z } from 'zod';

// GET /api/traces/evaluation/:evaluationId

export const GetTracesByEvalParamsSchema = z.object({
  evaluationId: z.string().min(1),
});

export const GetTracesByEvalResponseSchema = z.object({
  traces: z.array(z.unknown()),
});

export type GetTracesByEvalParams = z.infer<typeof GetTracesByEvalParamsSchema>;
export type GetTracesByEvalResponse = z.infer<typeof GetTracesByEvalResponseSchema>;

// GET /api/traces/:traceId

export const GetTraceParamsSchema = z.object({
  traceId: z.string().min(1),
});

export const GetTraceResponseSchema = z.object({
  trace: z.unknown(),
});

export type GetTraceParams = z.infer<typeof GetTraceParamsSchema>;
export type GetTraceResponse = z.infer<typeof GetTraceResponseSchema>;

/** Grouped schemas for server-side validation. */
export const TracesSchemas = {
  GetByEval: {
    Params: GetTracesByEvalParamsSchema,
    Response: GetTracesByEvalResponseSchema,
  },
  Get: {
    Params: GetTraceParamsSchema,
    Response: GetTraceResponseSchema,
  },
} as const;
