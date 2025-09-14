import { sha256 } from '../util/createHash.js';
import type { z } from 'zod';

import type { PromptSchema } from '../validators/prompts.js';

type PromptModel = z.infer<typeof PromptSchema>;

export function generateIdFromPrompt(prompt: PromptModel) {
  return prompt.id || prompt.label
    ? sha256(prompt.label)
    : sha256(typeof prompt.raw === 'object' ? JSON.stringify(prompt.raw) : prompt.raw);
}
