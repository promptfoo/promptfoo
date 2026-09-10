const REASONING_EFFORTS = new Set(['low', 'medium', 'high', 'xhigh', 'max']);

export function isGpt6AstraModel(modelName: unknown): boolean {
  return typeof modelName === 'string' && /(?:^|[/-])gpt-6-astra(?:-|$)/.test(modelName);
}

/** Apply Astra's request restrictions after config and passthrough have been merged. */
export function applyGpt6AstraRequestRules(
  body: Record<string, unknown>,
  modelName: unknown,
  api: 'chat' | 'responses',
  allowChatTools = false,
): void {
  if (!isGpt6AstraModel(modelName)) {
    return;
  }

  const reasoning = body.reasoning as { effort?: unknown } | null | undefined;
  if (body.reasoning_effort == null || body.reasoning_effort === '') {
    delete body.reasoning_effort;
  }
  if (reasoning?.effort === null || reasoning?.effort === '') {
    const normalizedReasoning = { ...reasoning };
    delete normalizedReasoning.effort;
    if (Object.keys(normalizedReasoning).length > 0) {
      body.reasoning = normalizedReasoning;
    } else {
      delete body.reasoning;
    }
  }
  if (api === 'responses' && body.reasoning_effort !== undefined) {
    throw new Error(
      'GPT-6 Astra Responses requests use reasoning.effort. Configure reasoning or reasoning_effort instead of passthrough.reasoning_effort.',
    );
  }
  const effort = api === 'chat' ? (body.reasoning_effort ?? reasoning?.effort) : reasoning?.effort;
  if (
    effort != null &&
    effort !== '' &&
    (typeof effort !== 'string' || !REASONING_EFFORTS.has(effort))
  ) {
    throw new Error(
      'GPT-6 Astra supports reasoning effort low, medium, high, xhigh, or max. Use low instead of none or minimal.',
    );
  }

  if (
    api === 'chat' &&
    !allowChatTools &&
    ['tools', 'tool_choice', 'functions', 'function_call'].some((key) => body[key] != null)
  ) {
    throw new Error(
      'GPT-6 Astra tool calling requires the Responses API. Use openai:responses:gpt-6-astra or azure:responses:<deployment>.',
    );
  }

  for (const key of ['temperature', 'top_p', 'logprobs', 'top_logprobs', 'max_tokens']) {
    delete body[key];
  }
  delete body[api === 'chat' ? 'max_output_tokens' : 'max_completion_tokens'];
  if (Array.isArray(body.include)) {
    body.include = body.include.filter((item) => item !== 'message.output_text.logprobs');
  }
}
