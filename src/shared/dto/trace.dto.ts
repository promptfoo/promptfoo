import { z } from 'zod';

// Trace schemas
const TraceSpanSchema = z.object({
  spanId: z.string(),
  parentSpanId: z.string().optional(),
  traceId: z.string(),
  name: z.string(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime().optional(),
  duration: z.number().optional(),
  attributes: z.record(z.any()).optional(),
  events: z.array(z.object({
    name: z.string(),
    timestamp: z.string().datetime(),
    attributes: z.record(z.any()).optional(),
  })).optional(),
  status: z.object({
    code: z.enum(['UNSET', 'OK', 'ERROR']),
    message: z.string().optional(),
  }).optional(),
});

export const TraceDTOSchemas = {
  GetByEvaluation: {
    Params: z.object({
      evaluationId: z.string(),
    }),
    Response: z.object({
      traces: z.array(z.object({
        traceId: z.string(),
        evalId: z.string(),
        createdAt: z.string().datetime(),
        spans: z.array(TraceSpanSchema),
        metadata: z.record(z.any()).optional(),
      })),
    }),
  },
  Get: {
    Params: z.object({
      traceId: z.string(),
    }),
    Response: z.object({
      trace: z.object({
        traceId: z.string(),
        evalId: z.string().optional(),
        createdAt: z.string().datetime(),
        spans: z.array(TraceSpanSchema),
        metadata: z.record(z.any()).optional(),
      }),
    }),
  },
};

// Type exports
export type TraceGetByEvaluationParams = z.infer<typeof TraceDTOSchemas.GetByEvaluation.Params>;
export type TraceGetByEvaluationResponse = z.infer<typeof TraceDTOSchemas.GetByEvaluation.Response>;
export type TraceGetParams = z.infer<typeof TraceDTOSchemas.Get.Params>;
export type TraceGetResponse = z.infer<typeof TraceDTOSchemas.Get.Response>;