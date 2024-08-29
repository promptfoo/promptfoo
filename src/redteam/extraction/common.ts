import { z } from 'zod';

export const REMOTE_GENERATION_URL = 'https://us-central1-promptfoo.cloudfunctions.net/generate';

export const RedTeamGenerationResponse = z.object({
  task: z.string(),
  result: z.union([z.string(), z.array(z.string())]),
});

export type RedTeamTask = 'purpose' | 'entities';
