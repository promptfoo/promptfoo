import { z } from 'zod';

// Redteam schemas
export const RedteamDTOSchemas = {
  Run: {
    Request: z.object({
      config: z.any(), // RedteamConfig
      force: z.boolean().optional(),
      verbose: z.boolean().optional(),
      delay: z.number().optional(),
      maxConcurrency: z.number().optional(),
    }),
    Response: z.object({
      id: z.string(),
    }),
  },
  Cancel: {
    Response: z.object({
      message: z.string(),
    }),
  },
  Status: {
    Response: z.object({
      hasRunningJob: z.boolean(),
      jobId: z.string().optional(),
    }),
  },
  ForwardTask: {
    Params: z.object({
      task: z.string(),
    }),
    Request: z.any(), // Dynamic based on task
    Response: z.any(), // Dynamic based on task
  },
};

// Type exports
export type RedteamRunRequest = z.infer<typeof RedteamDTOSchemas.Run.Request>;
export type RedteamRunResponse = z.infer<typeof RedteamDTOSchemas.Run.Response>;
export type RedteamCancelResponse = z.infer<typeof RedteamDTOSchemas.Cancel.Response>;
export type RedteamStatusResponse = z.infer<typeof RedteamDTOSchemas.Status.Response>;
export type RedteamForwardTaskParams = z.infer<typeof RedteamDTOSchemas.ForwardTask.Params>;