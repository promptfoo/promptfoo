import { sha256 } from '../util/createHash';
import type { z } from 'zod';

import type { PromptSchema } from '../validators/prompts';

type PromptModel = z.infer<typeof PromptSchema>;

export function generateIdFromPrompt(prompt: PromptModel) {
  if (prompt.label) {
    return sha256(prompt.label);
  }
  if (prompt.id) {
    return sha256(prompt.id);
  }
  return sha256(typeof prompt.raw === 'object' ? JSON.stringify(prompt.raw) : prompt.raw);
}
