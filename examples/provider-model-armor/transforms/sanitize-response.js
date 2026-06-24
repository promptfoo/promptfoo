/**
 * Transform a Model Armor sanitization response into Promptfoo guardrail metadata.
 *
 * @see https://cloud.google.com/security-command-center/docs/sanitize-prompts-responses
 */

function collectExecutionStates(value, states = []) {
  if (!value || typeof value !== 'object') {
    return states;
  }

  for (const [key, child] of Object.entries(value)) {
    if (key === 'executionState' && typeof child === 'string') {
      states.push(child);
    } else {
      collectExecutionStates(child, states);
    }
  }

  return states;
}

function collectMatchReasons(filters) {
  const reasons = [];

  if (filters.rai?.raiFilterResult?.matchState === 'MATCH_FOUND') {
    const raiResults = filters.rai.raiFilterResult.raiFilterTypeResults || {};
    for (const [filterType, filterResult] of Object.entries(raiResults)) {
      if (filterResult?.matchState === 'MATCH_FOUND') {
        reasons.push(`RAI: ${filterType.replace(/_/g, ' ')}`);
      }
    }
  }

  const jailbreak = filters.pi_and_jailbreak?.piAndJailbreakFilterResult;
  if (jailbreak?.matchState === 'MATCH_FOUND') {
    reasons.push(
      `Prompt Injection${jailbreak.confidenceLevel ? ` (${jailbreak.confidenceLevel})` : ''}`,
    );
  }
  if (filters.malicious_uris?.maliciousUriFilterResult?.matchState === 'MATCH_FOUND') {
    reasons.push('Malicious URL');
  }
  if (filters.csam?.csamFilterFilterResult?.matchState === 'MATCH_FOUND') {
    reasons.push('CSAM');
  }
  if (filters.sdp?.sdpFilterResult?.inspectResult?.matchState === 'MATCH_FOUND') {
    reasons.push('Sensitive Data');
  }

  return reasons;
}

export default function transformModelArmorResponse(json, _text, context) {
  const status = context?.response?.status;
  if ((status && (status < 200 || status >= 300)) || json?.error) {
    throw new Error(
      json?.error?.message || `Model Armor request failed with HTTP ${status ?? 'unknown'}`,
    );
  }

  const result = json?.sanitizationResult;
  if (!result) {
    throw new Error('Model Armor response did not include sanitizationResult');
  }
  if (result.invocationResult !== 'SUCCESS') {
    throw new Error(`Model Armor invocation was ${result.invocationResult ?? 'unknown'}`);
  }

  const filterResults = result.filterResults || {};
  for (const [filterName, filterResult] of Object.entries(filterResults)) {
    const executionStates = collectExecutionStates(filterResult);
    if (executionStates.length === 0) {
      throw new Error(`Model Armor filter ${filterName} did not include an execution state`);
    }
    const incompleteState = executionStates.find((state) => state !== 'EXECUTION_SUCCESS');
    if (incompleteState) {
      throw new Error(`Model Armor filter ${filterName} execution was ${incompleteState}`);
    }
  }

  const matchState = result.filterMatchState;
  if (matchState !== 'MATCH_FOUND' && matchState !== 'NO_MATCH_FOUND') {
    throw new Error(`Unknown Model Armor filter match state: ${matchState ?? 'missing'}`);
  }

  const flagged = matchState === 'MATCH_FOUND';
  const filters = filterResults;
  const reasons = collectMatchReasons(filters);
  const reason = reasons.join('; ') || (flagged ? 'Content flagged by Model Armor' : undefined);
  return {
    output: flagged ? `FLAGGED: ${reason}` : 'NO MATCH',
    guardrails: {
      flagged,
      flaggedInput: flagged,
      flaggedOutput: false,
      ...(reason ? { reason } : {}),
    },
    metadata: { modelArmor: result },
  };
}
