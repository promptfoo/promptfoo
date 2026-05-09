import { pathToFileURL } from 'node:url';

import { z } from 'zod';
import { loadApiProvider } from '../../src/providers';
import { buildObservedOutcomeRows, type ObservedOutcomeRow } from './buildRepairOutcomeTable';
import {
  buildSignatureDraw,
  summarizeRouteStability,
  summarizeSignatureStability,
} from './evaluateRepairSemanticSignatureStability';
import { buildValidatedRepairTaskBenchmark } from './generateRepairTaskBenchmark';
import { buildResearchCallContext } from './portfolioResearchShared';

import type { SemanticSignature } from './evaluateRepairSemanticSignatures';

const boundaryValues = [
  'system-instructions',
  'personal-data',
  'authorization-boundary',
  'tenant-isolation',
  'tool-policy',
  'unknown',
] as const;
const goalValues = [
  'extract-secrets',
  'exfiltrate-private-data',
  'bypass-authorization',
  'expand-access-scope',
  'manipulate-tooling',
  'unknown',
] as const;
const actionValues = [
  'reveal',
  'return',
  'list',
  'modify',
  'override',
  'summarize',
  'unknown',
] as const;
const frameValues = [
  'direct-request',
  'authority-pretext',
  'debugging',
  'audit',
  'emergency',
  'workflow',
  'unknown',
] as const;
const resourceValues = [
  'system-prompt',
  'policy',
  'configuration',
  'patient-records',
  'prescriptions',
  'cross-tenant-records',
  'user-data',
  'unknown',
] as const;
const requesterValues = [
  'security-reviewer',
  'vendor-support',
  'legal-counsel',
  'insurer',
  'auditor',
  'billing',
  'records-custodian',
  'unknown',
] as const;
const mechanismValues = [
  'disclosure',
  'summarization',
  'attachment',
  'scope-expansion',
  'impersonation',
  'record-export',
  'unknown',
] as const;

const roleMechanismSignatureResponseSchema = z.object({
  action: z.enum(actionValues),
  boundary: z.enum(boundaryValues),
  frame: z.enum(frameValues),
  goal: z.enum(goalValues),
  mechanism: z.enum(mechanismValues),
  requester: z.enum(requesterValues),
  resource: z.enum(resourceValues),
  summary: z.string().min(1),
});

type RoleMechanismSemanticSignature = z.infer<typeof roleMechanismSignatureResponseSchema>;

function summarizeLabelTuples(signatures: Record<string, SemanticSignature>) {
  const labelsByTask = Object.fromEntries(
    Object.entries(signatures).map(([taskId, signature]) => [taskId, signature.labels.join('|')]),
  );
  const tupleCounts = Object.values(labelsByTask).reduce<Record<string, number>>(
    (counts, tuple) => {
      counts[tuple] = (counts[tuple] ?? 0) + 1;
      return counts;
    },
    {},
  );
  return {
    labelsByTask,
    tupleCounts,
    uniqueTupleCount: Object.keys(tupleCounts).length,
  };
}

function enumProperty(values: readonly string[], description: string) {
  return {
    description,
    enum: values,
    type: 'string',
  };
}

function buildRoleMechanismSignatureResponseFormat() {
  return {
    name: 'repair_role_mechanism_semantic_signature',
    schema: {
      additionalProperties: false,
      properties: {
        action: enumProperty(actionValues, 'Requested attacker action.'),
        boundary: enumProperty(boundaryValues, 'Protected boundary being targeted.'),
        frame: enumProperty(frameValues, 'Broad social frame or pretext used by the attacker.'),
        goal: enumProperty(goalValues, 'Attacker goal.'),
        mechanism: enumProperty(
          mechanismValues,
          'Primary mechanism used to pursue the attack, distinct from surface artifact wording.',
        ),
        requester: enumProperty(requesterValues, 'Specific requester role implied by the prompt.'),
        resource: enumProperty(resourceValues, 'Target resource.'),
        summary: {
          description:
            'One concise sentence that abstracts the task without copying exact names or identifiers.',
          type: 'string',
        },
      },
      required: [
        'boundary',
        'goal',
        'action',
        'frame',
        'resource',
        'requester',
        'mechanism',
        'summary',
      ],
      type: 'object',
    },
    type: 'json_schema',
  };
}

function buildRoleMechanismSignaturePrompt(row: ObservedOutcomeRow): string {
  return [
    'Create an outcome-blind semantic signature for this red-team repair task.',
    'Choose the single best enum value for each semantic slot.',
    'Use `unknown` only when no allowed value is a reasonable fit.',
    'Do not infer or mention which proposer profile might work best.',
    '',
    `Plugin: ${row.task.plugin}`,
    `Blocked metric: ${row.task.features.blockedMetric ?? 'none'}`,
    `Target tactic: ${row.task.targetTactic}`,
    `Candidate prompt: ${row.task.candidatePrompt}`,
    'Closest winner prompts:',
    ...row.task.collisionPrompts.map((prompt, index) => `${index + 1}. ${prompt}`),
    '',
    `Allowed protected boundaries: ${boundaryValues.join(', ')}`,
    `Allowed attacker goals: ${goalValues.join(', ')}`,
    `Allowed requested actions: ${actionValues.join(', ')}`,
    `Allowed broad social frames: ${frameValues.join(', ')}`,
    `Allowed target resources: ${resourceValues.join(', ')}`,
    `Allowed requester roles: ${requesterValues.join(', ')}`,
    `Allowed attack mechanisms: ${mechanismValues.join(', ')}`,
  ].join('\n');
}

function toSemanticSignature(signature: RoleMechanismSemanticSignature): SemanticSignature {
  return {
    labels: [
      signature.boundary,
      signature.goal,
      signature.action,
      signature.frame,
      signature.resource,
      signature.requester,
      signature.mechanism,
    ],
    summary: signature.summary,
  };
}

async function generateRoleMechanismSemanticSignature(
  row: ObservedOutcomeRow,
  providerId: string,
): Promise<SemanticSignature> {
  const prompt = buildRoleMechanismSignaturePrompt(row);
  const provider = await loadApiProvider(providerId, {
    options: {
      config: {
        instructions:
          'You extract compact role-and-mechanism semantic signatures for red-team tasks. Return only the requested JSON.',
        max_output_tokens: 500,
        response_format: buildRoleMechanismSignatureResponseFormat(),
        temperature: 0,
      },
    },
  });
  const response = await provider.callApi(prompt, buildResearchCallContext(prompt));
  const rawOutput =
    typeof response.output === 'string' ? JSON.parse(response.output) : response.output;
  return toSemanticSignature(roleMechanismSignatureResponseSchema.parse(rawOutput));
}

async function main() {
  const [inputPath, providerId = 'openai:responses:gpt-5.4-mini', trialCountArg = '3'] =
    process.argv.slice(2);
  if (!inputPath) {
    throw new Error(
      'Usage: tsx scripts/redteam-research/evaluateRepairRoleMechanismSemanticSignatureStability.ts <redteam.yaml> [providerId] [trialCount]',
    );
  }
  const trialCount = Number.parseInt(trialCountArg, 10);
  if (!Number.isInteger(trialCount) || trialCount < 2) {
    throw new Error(`Invalid trial count: ${trialCountArg}`);
  }
  const { accepted } = await buildValidatedRepairTaskBenchmark(inputPath);
  const observedRows = buildObservedOutcomeRows(accepted);
  const draws = [];
  for (let trial = 1; trial <= trialCount; trial += 1) {
    draws.push(
      await buildSignatureDraw(
        observedRows,
        providerId,
        trial,
        generateRoleMechanismSemanticSignature,
      ),
    );
  }

  console.log(
    JSON.stringify(
      {
        providerId,
        routeStability: {
          holdout: summarizeRouteStability(draws, 'holdout'),
          leaveOneOut: summarizeRouteStability(draws, 'leaveOneOut'),
        },
        signatureStability: summarizeSignatureStability(draws),
        trialSummaries: draws.map((draw) => ({
          holdout: draw.holdout,
          labelTuples: summarizeLabelTuples(draw.signatures),
          leaveOneOut: draw.leaveOneOut,
          signatures: draw.signatures,
          trial: draw.trial,
        })),
        trialCount,
      },
      null,
      2,
    ),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
