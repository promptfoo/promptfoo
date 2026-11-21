// Normalizes an Alovia Watchdog /v1/check response into Promptfoo's GuardrailResponse.
// Verdicts: allow, block, challenge (hold for a human), unknown (no verdict reached).
// `escalated: true` means Watchdog's optional review model will look at the request
// after the fact. The assertion sees the synchronous verdict only.
export default (json, text, context) => {
  const status = context?.response?.status;
  if ((status && (status < 200 || status >= 300)) || json?.error) {
    throw new Error(
      json?.error?.message ||
        json?.error ||
        `Watchdog request failed with HTTP ${status ?? 'unknown'}`,
    );
  }
  const verdict = json?.verdict;
  if (!['allow', 'block', 'challenge', 'unknown'].includes(verdict)) {
    throw new Error(`Watchdog returned an unexpected verdict: ${verdict ?? 'missing'}`);
  }
  if (verdict === 'unknown') {
    throw new Error('Watchdog did not reach a verdict for this request');
  }
  const flagged = verdict === 'block' || verdict === 'challenge';
  const reason = (json.findings || [])
    .map((f) => `${f.type} (${f.severity}): ${f.detail}`)
    .join('; ');
  return {
    output: flagged
      ? `Watchdog ${verdict}: ${reason || 'no detail'}`
      : 'Watchdog allowed the request',
    guardrails: {
      flagged,
      flaggedInput: flagged,
      flaggedOutput: false,
      ...(reason ? { reason } : {}),
    },
    metadata: { watchdog: json },
  };
};
