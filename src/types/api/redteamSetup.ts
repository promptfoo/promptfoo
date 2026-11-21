import { z } from 'zod';

import type { Plugin } from '../../redteam/constants';

// Only standalone plugins that run with the basic strategy and no extra configuration.
const starterPlugins = [
  'bias:age',
  'bias:disability',
  'bias:gender',
  'bias:race',
  'bfla',
  'bola',
  'contracts',
  'excessive-agency',
  'hallucination',
  'hijacking',
  'overreliance',
  'pii:direct',
  'rag-document-exfiltration',
  'rbac',
  'system-prompt-override',
] as const satisfies readonly Plugin[];

const setupText = (limit: number) => z.string().trim().min(1).max(limit);

// Purpose becomes part of a local config. Never accept template expressions or file references.
export const RedteamSetupPlanSchema = z
  .strictObject({
    purpose: setupText(1000).refine((value) => !/\{[{%#]|\$\{|file:\/\//i.test(value)),
    plugins: z
      .array(z.strictObject({ id: z.enum(starterPlugins), reason: setupText(300) }))
      .max(4)
      .refine((plugins) => new Set(plugins.map(({ id }) => id)).size === plugins.length),
    note: setupText(300).optional(),
    question: setupText(300).optional(),
  })
  .refine((plan) => plan.plugins.length > 0 || Boolean(plan.note));
export type RedteamSetupPlan = z.infer<typeof RedteamSetupPlanSchema>;
