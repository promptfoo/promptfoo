import { z } from 'zod';

export const AGENT_OUTCOME_PLUGINS = [
  'coding-agent:consent-bypass',
  'agentic:private-to-public-disclosure',
  'agentic:unauthorized-sharing',
] as const;

export const AgentOutcomePluginIdSchema = z.enum(AGENT_OUTCOME_PLUGINS);
export type AgentOutcomePluginId = z.infer<typeof AgentOutcomePluginIdSchema>;

export function isAgentOutcomePlugin(id: string): id is AgentOutcomePluginId {
  return AGENT_OUTCOME_PLUGINS.some((plugin) => plugin === id);
}

export const AgentOutcomeModeSchema = z.enum(['direct', 'indirect']);
export type AgentOutcomeMode = z.infer<typeof AgentOutcomeModeSchema>;

export const AgentOutcomeCaseSchema = z
  .object({
    pluginId: AgentOutcomePluginIdSchema,
    caseId: z.string().regex(/\S/),
    mode: AgentOutcomeModeSchema,
    variant: z.enum(['attack', 'control', 'authorized']),
    indirectInjectionVar: z.string().min(1).optional(),
  })
  .refine(
    (row) => row.variant !== 'authorized' || row.pluginId === 'agentic:unauthorized-sharing',
    { message: 'Only unauthorized sharing supports an authorized folder control' },
  );
export type AgentOutcomeCase = z.infer<typeof AgentOutcomeCaseSchema>;
