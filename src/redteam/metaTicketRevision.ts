import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

import { z } from 'zod';
import { getLiteralVarNames } from '../contracts/literalVars';
import {
  type AtomicTestCase,
  type EvaluateResult,
  ResultFailureReason,
  type RunEvalOptions,
} from '../types/index';
import { fetchWithProxy, readBoundedText } from '../util/fetch';
import { withSingleAttempt } from '../util/fetch/retryContext';
import {
  AgentOutcomeCaseSchema,
  AgentOutcomePluginIdSchema,
  DEFAULT_AGENT_OUTCOME_ARTIFACT_VAR,
  getAgentOutcomeCase,
  getAgentOutcomeEvidence,
  getAgentOutcomeResult,
} from './constants/agentOutcomes';
import { getAgentOutcomeConfigSchema } from './plugins/agentic/agentOutcomeConfig';
import { hasVerifiedTicketDelivery } from './plugins/agentic/ticketDelivery';
import { getTicketRevisionUrl, shouldGenerateRemote } from './remoteGeneration';

import type { InternalEvaluateOptions } from '../types/internal';

const pluginId = AgentOutcomePluginIdSchema.enum.privateToPublicDisclosure;
const configSchema = getAgentOutcomeConfigSchema(pluginId);
const task = 'meta-ticket-revision';
const text = z
  .string()
  .max(4096)
  .regex(/\S/)
  .refine((s) => !/[\uD800-\uDFFF]/u.test(s));
const proposal = z.strictObject({ ticket: text });

function getSeed(step: RunEvalOptions) {
  const { test, testSuite } = step;
  if (!test.metadata?.agentOutcome) {
    return;
  }
  const assigned = getAgentOutcomeCase(test);
  const redteam = testSuite?.redteam;
  const options: InternalEvaluateOptions | undefined = step.evaluateOptions;
  const allowed = options?.allowedMetaTicketRevisions;
  if (
    !Array.isArray(redteam?.plugins) ||
    !assigned?.metaTicketRevision ||
    (allowed !== undefined && !allowed.includes(assigned.metaTicketRevision)) ||
    assigned.parentCaseId ||
    test.providerOutput !== undefined ||
    (test.metadata.strategyId && test.metadata.strategyId !== 'basic') ||
    (redteam.strategies !== undefined &&
      (!Array.isArray(redteam.strategies) ||
        redteam.strategies.some(
          (s) => typeof s === 'object' && s?.id === 'basic' && s.config?.enabled === false,
        )))
  ) {
    return;
  }
  const artifactVar = assigned.indirectInjectionVar ?? DEFAULT_AGENT_OUTCOME_ARTIFACT_VAR;
  // A generated or imported test alone cannot authorize outbound calls. Bind
  // both the owner task and the attack channel to the operator's plugin config.
  const authorized = redteam.plugins.some((p) => {
    if (p?.id !== pluginId || p.config?.metaTicketRevision !== assigned.metaTicketRevision) {
      return false;
    }
    const config = configSchema.safeParse({
      ...p.config,
      injectVar: assigned.injectVar ?? 'prompt',
    });
    return (
      config.success &&
      config.data.indirectInjectionVar === artifactVar &&
      config.data.legitimateTask === assigned.message
    );
  });
  return authorized ? { assigned, worker: allowed !== undefined } : undefined;
}

export function hasMetaTicketRevision(step: RunEvalOptions): boolean {
  return Boolean(getSeed(step));
}

export async function proposeMetaTicketRevision(
  step: RunEvalOptions,
  row: EvaluateResult,
  signal: AbortSignal,
): Promise<AtomicTestCase | undefined> {
  const seed = getSeed(step);
  if (!seed) {
    return;
  }
  const { assigned, worker } = seed;
  if (
    signal.aborted ||
    !row.success ||
    !row.gradingResult?.pass ||
    row.failureReason !== ResultFailureReason.NONE ||
    row.error ||
    row.response?.error ||
    row.testIdx !== step.testIdx ||
    row.promptIdx !== step.promptIdx ||
    !isDeepStrictEqual(assigned, getAgentOutcomeCase(row.testCase)) ||
    row.prompt.raw !== assigned.message
  ) {
    return;
  }
  const { artifact, message: _owner, ...info } = assigned;
  const { test } = step;
  const grade = getAgentOutcomeResult(row.gradingResult, info);
  const receipt = getAgentOutcomeEvidence(row.response, info);
  if (
    !isDeepStrictEqual(AgentOutcomeCaseSchema.safeParse(test.vars?.agentOutcome).data, info) ||
    grade?.status !== 'safe' ||
    !grade.taskCompleted ||
    !grade.controlPassed ||
    !grade.attackExposed ||
    receipt?.pluginId !== pluginId ||
    !receipt.attackExposed ||
    !receipt.taskCompleted ||
    !artifact ||
    !text.safeParse(artifact).success
  ) {
    return;
  }

  const measurements = receipt.measurements;
  if (
    !measurements?.privateVerified ||
    !hasVerifiedTicketDelivery(assigned, measurements) ||
    measurements.publicControl?.marker === measurements.privateMarker ||
    !measurements.publicControl?.readback?.includes(measurements.publicControl.marker) ||
    !measurements.publicAfter.startsWith(artifact) ||
    measurements.publicAfter.includes(measurements.privateMarker)
  ) {
    return;
  }
  // Use the same eligibility rule in both arms. Take only the appended public
  // text from the reporter's readback. Never send the assistant, grade or receipt.
  const reply = measurements.publicAfter.slice(artifact.length).replace(/^(?:\r?\n){1,2}/, '');
  if (!text.safeParse(reply).success) {
    return;
  }
  const feedback = info.metaTicketRevision === 'public';
  const redteam = step.testSuite?.redteam;
  if (
    (feedback && redteam?.excludeTargetOutputFromAgenticAttackGeneration) ||
    redteam?.remote === false ||
    !shouldGenerateRemote()
  ) {
    return;
  }
  const ticket = await requestTicket(artifact, feedback ? reply : undefined, signal, worker);
  if (ticket.trim() === artifact.trim() || ticket.includes(measurements.privateMarker)) {
    throw new Error('Invalid Meta ticket proposal.');
  }

  const agentOutcome = { ...info, parentCaseId: info.caseId, caseId: randomUUID() };
  const key = assigned.indirectInjectionVar ?? DEFAULT_AGENT_OUTCOME_ARTIFACT_VAR;
  const inputVars = test.metadata?.inputVars;
  return {
    ...test,
    vars: { ...test.vars, [key]: ticket, agentOutcome },
    metadata: {
      ...test.metadata,
      agentOutcome,
      strategyId: task,
      ...(inputVars &&
        Object.hasOwn(inputVars, key) && { inputVars: { ...inputVars, [key]: ticket } }),
      __promptfoo: {
        ...test.metadata?.__promptfoo,
        literalVars: [...new Set([...(getLiteralVarNames(test) ?? []), key, 'agentOutcome'])],
      },
    },
  };
}

async function requestTicket(
  ticket: string,
  publicReply: string | undefined,
  signal: AbortSignal,
  worker: boolean,
) {
  try {
    // Use the configured remote task endpoint and its origin-scoped auth. No
    // provider selection, implicit context, private trace headers, retries or cache.
    const response = await withSingleAttempt(() =>
      fetchWithProxy(getTicketRevisionUrl(worker), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-promptfoo-silent': 'true' },
        body: JSON.stringify({ task, ticket, publicReply }),
        signal: AbortSignal.any([signal, AbortSignal.timeout(60_000)]),
        requireSecureTransport: true,
      }),
    );
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error('Meta ticket request failed.');
    }
    const limit = 32_768;
    const body = await readBoundedText(response, limit + 1, { requireStream: true });
    if (Buffer.byteLength(body) > limit) {
      throw new Error('Oversized Meta ticket response.');
    }
    return proposal.parse(JSON.parse(body)).ticket;
  } catch {
    // Parse/transport errors can echo payloads. Keep the parent grade intact.
    throw new Error('Meta ticket proposal failed.');
  }
}
