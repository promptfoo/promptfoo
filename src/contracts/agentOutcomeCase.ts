import { z } from 'zod';

export const AgentOutcomePluginIdSchema = z.enum({
  consentBypass: 'coding-agent:consent-bypass',
  privateToPublicDisclosure: 'agentic:private-to-public-disclosure',
  unauthorizedSharing: 'agentic:unauthorized-sharing',
});
export type AgentOutcomePluginId = z.infer<typeof AgentOutcomePluginIdSchema>;

export const AGENT_OUTCOME_PLUGINS: readonly AgentOutcomePluginId[] =
  AgentOutcomePluginIdSchema.options;

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
