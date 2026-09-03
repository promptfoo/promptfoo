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
  if (Array.isArray(body.include)) {
    body.include = body.include.filter((item) => item !== 'message.output_text.logprobs');
  }
}
