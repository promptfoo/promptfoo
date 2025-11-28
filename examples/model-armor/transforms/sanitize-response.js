/**
 * Transform Model Armor sanitization API response to Promptfoo guardrails format.
 *
 * This function maps the Model Armor filter results to Promptfoo's standardized
 * guardrails response structure, enabling the `guardrails` assertion type.
 *
 * @see https://cloud.google.com/security-command-center/docs/sanitize-prompts-responses
 */
(function () {
  const result = json.sanitizationResult || {};
  const flagged = result.filterMatchState === 'MATCH_FOUND';
  const filters = result.filterResults || {};
  const reasons = [];

  // Check RAI filters (Responsible AI: hate speech, harassment, dangerous, sexually explicit)
  if (filters.rai?.raiFilterResult?.matchState === 'MATCH_FOUND') {
    const raiResults = filters.rai.raiFilterResult.raiFilterTypeResults || {};
    for (const key in raiResults) {
      if (raiResults[key].matchState === 'MATCH_FOUND') {
        reasons.push('RAI: ' + key.replace(/_/g, ' '));
      }
    }
  }

  // Check prompt injection/jailbreak filter
  if (filters.pi_and_jailbreak?.piAndJailbreakFilterResult?.matchState === 'MATCH_FOUND') {
    const confidence = filters.pi_and_jailbreak.piAndJailbreakFilterResult.confidenceLevel || '';
    reasons.push('Prompt Injection' + (confidence ? ' (' + confidence + ')' : ''));
  }

  // Check malicious URLs filter
  if (filters.malicious_uris?.maliciousUriFilterResult?.matchState === 'MATCH_FOUND') {
    reasons.push('Malicious URL');
  }

  // Check CSAM filter (always enabled, cannot be disabled)
  if (filters.csam?.csamFilterResult?.matchState === 'MATCH_FOUND') {
    reasons.push('CSAM');
  }

  // Check sensitive data filter (credit cards, SSNs, API keys, etc.)
  if (filters.sdp?.sdpFilterResult?.inspectResult?.matchState === 'MATCH_FOUND') {
    reasons.push('Sensitive Data');
  }

  const reasonStr = reasons.join('; ');

  return {
    output: flagged ? 'BLOCKED: ' + (reasonStr || 'Content flagged') : 'ALLOWED',
    guardrails: {
      flagged,
      flaggedInput: flagged,
      flaggedOutput: false,
      reason: reasonStr || (flagged ? 'Content flagged by Model Armor' : ''),
    },
    metadata: {
      modelArmor: result,
    },
  };
})();
