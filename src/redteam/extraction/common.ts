import { z } from 'zod';

export const RedTeamGenerationResponse = z.object({
  task: z.string(),
  result: z.union([z.string(), z.array(z.string())]),
});

export type RedTeamTask = 'purpose' | 'entities';
