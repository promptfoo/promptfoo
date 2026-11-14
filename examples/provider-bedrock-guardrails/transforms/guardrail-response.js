/** Map ApplyGuardrail's INPUT assessment to Promptfoo's guardrails format. */
export default function transformGuardrailResponse(json) {
  // Never treat an AWS error or unexpected response as an allowed prompt.
  if (json.action !== 'NONE' && json.action !== 'GUARDRAIL_INTERVENED') {
    throw new Error('Invalid ApplyGuardrail response: expected NONE or GUARDRAIL_INTERVENED');
  }

  const flagged = json.action === 'GUARDRAIL_INTERVENED';
  const message = (json.outputs || []).map((output) => output.text).join('\n');

  return {
    output: flagged ? message || 'BLOCKED' : 'ALLOWED',
    guardrails: {
      flagged,
      flaggedInput: flagged,
      flaggedOutput: false,
      reason: flagged ? message || 'Content flagged by Bedrock Guardrails' : '',
    },
    metadata: {
      bedrockGuardrails: json,
    },
  };
}
