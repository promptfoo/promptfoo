/**
 * Transform a Model Armor sanitization response into Promptfoo guardrail metadata.
 *
 * Both sanitize endpoints (`sanitizeUserPrompt` and `sanitizeModelResponse`) return the
 * same `sanitizationResult` shape, so the direction of a finding cannot be inferred from
 * the payload. Pick the export that matches the endpoint you are calling:
 *
 *   # prompt-side (sanitizeUserPrompt) -> flaggedInput
 *   transformResponse: file://transforms/sanitize-response.mjs
 *
 *   # response-side (sanitizeModelResponse) -> flaggedOutput
 *   transformResponse: file://transforms/sanitize-response.mjs:transformModelArmorModelResponse
 *
 * @see https://cloud.google.com/security-command-center/docs/sanitize-prompts-responses
 */

const VALID_MATCH_STATES = new Set(['MATCH_FOUND', 'NO_MATCH_FOUND']);

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

function collectMatchStates(value, states = []) {
  if (!value || typeof value !== 'object') {
    return states;
  }

  for (const [key, child] of Object.entries(value)) {
    if (key === 'matchState' && typeof child === 'string') {
      states.push(child);
    } else {
      collectMatchStates(child, states);
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
  // SdpFilterResult is a union of `inspectResult` (detect only) and `deidentifyResult`
  // (detect + rewrite). Either branch can report MATCH_FOUND, so check both.
  const sdp = filters.sdp?.sdpFilterResult;
  if (
    sdp?.inspectResult?.matchState === 'MATCH_FOUND' ||
    sdp?.deidentifyResult?.matchState === 'MATCH_FOUND'
  ) {
    reasons.push('Sensitive Data');
  }

  return reasons;
}

/**
 * Fail closed on every child filter: reject partial execution and any match state that is
 * missing or outside Google's schema. Returns whether any child reported a match so the
 * aggregate can be cross-checked by the caller.
 */
function validateFilterResults(filterResults) {
  let anyFilterMatched = false;
  for (const [filterName, filterResult] of Object.entries(filterResults)) {
    const executionStates = collectExecutionStates(filterResult);
    if (executionStates.length === 0) {
      throw new Error(`Model Armor filter ${filterName} did not include an execution state`);
    }
    const incompleteState = executionStates.find((state) => state !== 'EXECUTION_SUCCESS');
    if (incompleteState) {
      throw new Error(`Model Armor filter ${filterName} execution was ${incompleteState}`);
    }

    const matchStates = collectMatchStates(filterResult);
    if (matchStates.length === 0) {
      throw new Error(`Model Armor filter ${filterName} did not include a match state`);
    }
    const unknownMatch = matchStates.find((state) => !VALID_MATCH_STATES.has(state));
    if (unknownMatch) {
      throw new Error(`Model Armor filter ${filterName} match state was ${unknownMatch}`);
    }
    if (matchStates.includes('MATCH_FOUND')) {
      anyFilterMatched = true;
    }
  }
  return anyFilterMatched;
}

function evaluateSanitizationResult(json, context, direction) {
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

  const filterResults = result.filterResults;
  if (
    !filterResults ||
    typeof filterResults !== 'object' ||
    Array.isArray(filterResults) ||
    Object.keys(filterResults).length === 0
  ) {
    throw new Error('Model Armor response did not include any filter results');
  }

  const anyFilterMatched = validateFilterResults(filterResults);

  const matchState = result.filterMatchState;
  if (matchState !== 'MATCH_FOUND' && matchState !== 'NO_MATCH_FOUND') {
    throw new Error(`Unknown Model Armor filter match state: ${matchState ?? 'missing'}`);
  }

  const flagged = matchState === 'MATCH_FOUND';
  // The aggregate must agree with the children. A clean aggregate hiding a matched child
  // (or vice versa) is a malformed/indeterminate response, not a clean scan — fail closed.
  if (flagged !== anyFilterMatched) {
    throw new Error(
      `Model Armor aggregate match state ${matchState} disagrees with its filter results`,
    );
  }

  const reasons = collectMatchReasons(filterResults);
  const reason = reasons.join('; ') || (flagged ? 'Content flagged by Model Armor' : undefined);
  return {
    output: flagged ? `FLAGGED: ${reason}` : 'NO MATCH',
    guardrails: {
      flagged,
      flaggedInput: flagged && direction === 'input',
      flaggedOutput: flagged && direction === 'output',
      ...(reason ? { reason } : {}),
    },
    metadata: { modelArmor: result },
  };
}

/**
 * Build a response transform bound to a finding direction (`input` or `output`).
 */
export function createModelArmorTransform(direction) {
  return (json, _text, context) => evaluateSanitizationResult(json, context, direction);
}

// Prompt-side default: `sanitizeUserPrompt` findings attribute to `flaggedInput`.
export default createModelArmorTransform('input');

// Explicit prompt-side alias for readability.
export const transformModelArmorUserPrompt = createModelArmorTransform('input');

// Response-side: `sanitizeModelResponse` findings attribute to `flaggedOutput`.
export const transformModelArmorModelResponse = createModelArmorTransform('output');
