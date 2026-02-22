import { z } from 'zod';

// POST /api/redteam/run

export const RedteamRunRequestSchema = z.object({
  config: z.record(z.string(), z.unknown()),
  force: z.boolean().optional(),
  verbose: z.boolean().optional(),
  delay: z.coerce.number().min(0).optional(),
  maxConcurrency: z.coerce.number().int().min(1).optional(),
});

export type RedteamRunRequest = z.infer<typeof RedteamRunRequestSchema>;

// POST /api/redteam/:taskId

export const RedteamTaskParamsSchema = z.object({
  taskId: z.string().min(1).max(128),
});

export type RedteamTaskParams = z.infer<typeof RedteamTaskParamsSchema>;

export const RedteamTaskRequestSchema = z.record(z.string(), z.unknown());

export type RedteamTaskRequest = z.infer<typeof RedteamTaskRequestSchema>;

/** Grouped schemas for server-side validation. */
export const RedteamSchemas = {
  Run: { Request: RedteamRunRequestSchema },
  Task: { Params: RedteamTaskParamsSchema, Request: RedteamTaskRequestSchema },
} as const;
