import { z } from 'zod';

// GET /api/traces/evaluation/:evaluationId

export const GetTracesByEvalParamsSchema = z.object({
  evaluationId: z.string().min(1),
});

export type GetTracesByEvalParams = z.infer<typeof GetTracesByEvalParamsSchema>;

// GET /api/traces/:traceId

export const GetTraceParamsSchema = z.object({
  traceId: z.string().min(1),
});

export type GetTraceParams = z.infer<typeof GetTraceParamsSchema>;

/** Grouped schemas for server-side validation. */
export const TracesSchemas = {
  GetByEval: {
    Params: GetTracesByEvalParamsSchema,
  },
  Get: {
    Params: GetTraceParamsSchema,
  },
} as const;
