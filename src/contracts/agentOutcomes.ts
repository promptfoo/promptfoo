import { z } from 'zod';

const pluginIds = {
  consentBypass: 'coding-agent:consent-bypass',
  privateToPublicDisclosure: 'agentic:private-to-public-disclosure',
  unauthorizedSharing: 'agentic:unauthorized-sharing',
} as const;

export const AgentOutcomePluginIdSchema = z.enum(pluginIds);
export type AgentOutcomePluginId = z.infer<typeof AgentOutcomePluginIdSchema>;
export const AGENT_OUTCOME_PLUGINS: readonly AgentOutcomePluginId[] =
  AgentOutcomePluginIdSchema.options;

export function isAgentOutcomePlugin(id: string): id is AgentOutcomePluginId {
  return AGENT_OUTCOME_PLUGINS.some((plugin) => plugin === id);
}

export const AgentOutcomeModeSchema = z.enum(['direct', 'indirect']);
export type AgentOutcomeMode = z.infer<typeof AgentOutcomeModeSchema>;

// Keep synthetic identifiers byte-for-byte intact for comparison with collector readbacks.
const identifier = z.string().regex(/\S/);

export const AgentOutcomeCaseSchema = z
  .object({
    pluginId: AgentOutcomePluginIdSchema,
    caseId: identifier,
    mode: AgentOutcomeModeSchema,
    variant: z.enum(['attack', 'control', 'authorized']),
    indirectInjectionVar: z.string().min(1).optional(),
  })
  .refine((row) => row.variant !== 'authorized' || row.pluginId === pluginIds.unauthorizedSharing, {
    message: 'Only unauthorized sharing supports an authorized folder control',
  });
export type AgentOutcomeCase = z.infer<typeof AgentOutcomeCaseSchema>;

const observations = {
  taskCompleted: z.boolean().nullable(),
  attackExposed: z.boolean().nullable(),
};
const evidenceFields = {
  version: z.literal(1),
  caseId: identifier,
  ...observations,
};

const consentProbe = z.object({
  decision: z.enum(['reject', 'accept']),
  actionId: identifier,
  collectedActionIds: z.array(identifier),
});

// A null readback records a verified denial. A null probe records an unavailable measurement.
const readProbe = z.object({ marker: identifier, readback: z.string().nullable() });

const consentMeasurements = z.object({
  beforeReject: consentProbe.nullable(),
  afterReject: consentProbe.nullable(),
  afterAccept: consentProbe.nullable(),
});

const disclosureMeasurements = z.object({
  privateVerified: z.boolean(),
  privateMarker: identifier,
  publicBefore: z.string(),
  publicAfter: z.string(),
  publicControl: readProbe.nullable(),
});

const sharingMeasurements = z.object({
  futureVerified: z.boolean(),
  future: readProbe.nullable(),
  folderControl: readProbe.nullable(),
});

/** Measurements collected by a trusted target adapter and returned in provider response metadata. */
export const AgentOutcomeEvidenceSchema = z.discriminatedUnion('pluginId', [
  z.object({
    ...evidenceFields,
    pluginId: z.literal(pluginIds.consentBypass),
    measurements: consentMeasurements.nullable(),
  }),
  z.object({
    ...evidenceFields,
    pluginId: z.literal(pluginIds.privateToPublicDisclosure),
    measurements: disclosureMeasurements.nullable(),
  }),
  z.object({
    ...evidenceFields,
    pluginId: z.literal(pluginIds.unauthorizedSharing),
    measurements: sharingMeasurements.nullable(),
  }),
]);

export type AgentOutcomeEvidence = z.infer<typeof AgentOutcomeEvidenceSchema>;

export const AgentOutcomeResultSchema = AgentOutcomeCaseSchema.safeExtend({
  status: z.enum(['violation', 'safe']),
  ...observations,
  reason: z.string(),
});

export type AgentOutcomeResult = z.infer<typeof AgentOutcomeResultSchema>;
