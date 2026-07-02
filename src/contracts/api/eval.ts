import { z } from 'zod';

// GET /api/eval/:id/config

export const EvalConfigParamsSchema = z.object({
  id: z.string().min(1),
});

export const EvalConfigResponseSchema = z.object({
  config: z.record(z.string(), z.unknown()),
});

export type EvalConfigParams = z.infer<typeof EvalConfigParamsSchema>;
export type EvalConfigResponse = z.infer<typeof EvalConfigResponseSchema>;

// GET /api/eval/:evalId/results/:resultId/detail

export const EvalResultDetailParamsSchema = z.object({
  evalId: z.string().min(1),
  resultId: z.string().min(1),
});

export const EvalResultDetailResponseSchema = z.object({
  evalId: z.string(),
  resultId: z.string(),
  prompt: z.string(),
  providerPrompt: z.unknown().optional(),
  response: z.unknown().optional(),
  testCase: z.record(z.string(), z.unknown()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  gradingResult: z.unknown().optional(),
  text: z.string(),
  output: z.unknown().optional(),
  audio: z.unknown().optional(),
  video: z.unknown().optional(),
  images: z.array(z.record(z.string(), z.unknown())).optional(),
});

export type EvalResultDetailParams = z.infer<typeof EvalResultDetailParamsSchema>;
export type EvalResultDetailResponse = z.infer<typeof EvalResultDetailResponseSchema>;
