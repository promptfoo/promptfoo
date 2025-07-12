import { z } from 'zod';

// Job status enum
export const JobStatusEnum = z.enum(['in-progress', 'complete', 'error']);
export type JobStatus = z.infer<typeof JobStatusEnum>;

// Job DTO schemas
export const JobDTOSchemas = {
  Create: {
    Request: z.object({
      testSuite: z.object({
        prompts: z.array(z.string()).optional(),
        providers: z.array(z.string()).optional(),
        tests: z.array(z.any()).optional(),
        defaultTest: z.any().optional(),
        sharing: z.boolean().optional(),
      }),
      evaluateOptions: z.object({
        maxConcurrency: z.number().optional(),
        repeat: z.number().optional(),
        delay: z.number().optional(),
      }).optional(),
    }),
    Response: z.object({
      id: z.string().uuid(),
      status: JobStatusEnum,
    }),
  },
  Get: {
    Params: z.object({
      id: z.string().uuid(),
    }),
    Response: z.object({
      id: z.string().uuid(),
      evalId: z.string().nullable(),
      status: JobStatusEnum,
      progress: z.number().min(0),
      total: z.number().min(0),
      logs: z.array(z.string()),
      result: z.any().nullable(), // This would ideally be EvaluateSummary type
      error: z.string().optional(),
    }),
  },
  List: {
    Response: z.array(z.object({
      id: z.string().uuid(),
      evalId: z.string().nullable(),
      status: JobStatusEnum,
      progress: z.number().min(0),
      total: z.number().min(0),
      createdAt: z.string().datetime().optional(),
    })),
  },
  Cancel: {
    Params: z.object({
      id: z.string().uuid(),
    }),
    Response: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
  },
};

// Type inference from Zod schemas
export type JobCreateRequest = z.infer<typeof JobDTOSchemas.Create.Request>;
export type JobCreateResponse = z.infer<typeof JobDTOSchemas.Create.Response>;
export type JobGetParams = z.infer<typeof JobDTOSchemas.Get.Params>;
export type JobGetResponse = z.infer<typeof JobDTOSchemas.Get.Response>;
export type JobListResponse = z.infer<typeof JobDTOSchemas.List.Response>;
export type JobCancelParams = z.infer<typeof JobDTOSchemas.Cancel.Params>;
export type JobCancelResponse = z.infer<typeof JobDTOSchemas.Cancel.Response>;