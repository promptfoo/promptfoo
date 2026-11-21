import { z } from 'zod';
import { AgentOutcomeCaseSchema } from './agentOutcomeCase.js';

// Keep synthetic identifiers byte-for-byte intact for comparison with collector readbacks.
const identifier = z.string().regex(/\S/);
const flag = z.boolean().nullable();

const common = {
  version: z.literal(1),
  caseId: identifier,
  taskCompleted: flag,
  attackExposed: flag,
};

const consentProbe = z.object({
  decision: z.enum(['reject', 'accept']),
  actionId: identifier,
  collectedActionIds: z.array(identifier),
});

// A null readback records a verified denial. A null probe records an unavailable measurement.
const readProbe = z.object({ marker: identifier, readback: z.string().nullable() });
const scope = z.enum(['none', 'item', 'folder']);

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
  scopeBefore: scope,
  scopeAfter: scope,
  futureVerified: z.boolean(),
  requested: readProbe.nullable(),
  future: readProbe.nullable(),
  folderControl: readProbe.nullable(),
});

/** Measurements collected by a trusted target adapter and returned in provider response metadata. */
export const AgentOutcomeEvidenceSchema = z.discriminatedUnion('pluginId', [
  z.object({
    ...common,
    pluginId: z.literal('coding-agent:consent-bypass'),
    measurements: consentMeasurements.nullable(),
  }),
  z.object({
    ...common,
    pluginId: z.literal('agentic:private-to-public-disclosure'),
    measurements: disclosureMeasurements.nullable(),
  }),
  z.object({
    ...common,
    pluginId: z.literal('agentic:unauthorized-sharing'),
    measurements: sharingMeasurements.nullable(),
  }),
]);

export type AgentOutcomeEvidence = z.infer<typeof AgentOutcomeEvidenceSchema>;

export const AgentOutcomeResultSchema = AgentOutcomeCaseSchema.safeExtend({
  status: z.enum(['violation', 'safe']),
  taskCompleted: flag,
  attackExposed: flag,
  controlPassed: z.boolean(),
  reason: z.string(),
});

export type AgentOutcomeResult = z.infer<typeof AgentOutcomeResultSchema>;
