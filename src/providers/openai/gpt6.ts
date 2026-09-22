const REASONING_EFFORTS = new Set(['low', 'medium', 'high', 'xhigh', 'max']);

type Gpt6Variant = 'astra' | 'sol' | 'luna';
type Gpt6Reasoning = { effort?: unknown } | null | undefined;

function getGpt6Variant(modelName: unknown): Gpt6Variant | undefined {
  return typeof modelName === 'string'
    ? (/(?:^|[/-])gpt-6-(astra|sol|luna)(?:-|$)/.exec(modelName)?.[1] as Gpt6Variant | undefined)
    : undefined;
}

export function isGpt6Model(modelName: unknown): boolean {
  return getGpt6Variant(modelName) !== undefined;
}

function normalizeReasoning(body: Record<string, unknown>): Gpt6Reasoning {
  if (body.reasoning_effort == null || body.reasoning_effort === '') {
    delete body.reasoning_effort;
  }
  const reasoning = body.reasoning as Gpt6Reasoning;
  if (reasoning?.effort !== null && reasoning?.effort !== '') {
    return reasoning;
  }

  const normalizedReasoning = { ...reasoning };
  delete normalizedReasoning.effort;
  if (Object.keys(normalizedReasoning).length > 0) {
    body.reasoning = normalizedReasoning;
  } else {
    delete body.reasoning;
  }
  return body.reasoning as Gpt6Reasoning;
}

function validateChatTools(
  body: Record<string, unknown>,
  variant: Gpt6Variant,
  modelLabel: string,
  effort: unknown,
  allowChatTools: boolean,
): void {
  if (variant !== 'astra') {
    for (const key of ['tools', 'functions']) {
      const value = body[key];
      if (Array.isArray(value) && value.length === 0) {
        delete body[key];
      }
    }
  }
  if (
    allowChatTools ||
    !['tools', 'tool_choice', 'functions', 'function_call'].some((key) => body[key] != null)
  ) {
    return;
  }

  if (variant === 'astra') {
    throw new Error(
      'GPT-6 Astra tool calling requires the Responses API. Use openai:responses:gpt-6-astra or azure:responses:<deployment>.',
    );
  }
  if (effort !== 'none') {
    throw new Error(
      `${modelLabel} Chat Completions function calling requires reasoning_effort: none. Set reasoning_effort to none or use openai:responses:gpt-6-${variant}.`,
    );
  }
}

/** Apply GPT-6 request restrictions after config and passthrough have been merged. */
export function applyGpt6RequestRules(
  body: Record<string, unknown>,
  modelName: unknown,
  api: 'chat' | 'responses',
  allowChatTools = false,
): void {
  const variant = getGpt6Variant(modelName);
  if (!variant) {
    return;
  }
  const modelLabel = `GPT-6 ${variant[0].toUpperCase()}${variant.slice(1)}`;

  const reasoning = normalizeReasoning(body);
  if (api === 'responses' && body.reasoning_effort !== undefined) {
    throw new Error(
      `${modelLabel} Responses requests use reasoning.effort. Configure reasoning or reasoning_effort instead of passthrough.reasoning_effort.`,
    );
  }
  if (api === 'chat' && variant !== 'astra' && !allowChatTools && body.reasoning != null) {
    throw new Error(
      `${modelLabel} Chat Completions requests use reasoning_effort. Configure reasoning_effort instead of passthrough.reasoning.`,
    );
  }
  const effort = api === 'chat' ? (body.reasoning_effort ?? reasoning?.effort) : reasoning?.effort;
  if (
    effort != null &&
    effort !== '' &&
    (typeof effort !== 'string' ||
      (!REASONING_EFFORTS.has(effort) && !(variant !== 'astra' && effort === 'none')))
  ) {
    throw new Error(
      variant === 'astra'
        ? `${modelLabel} supports reasoning effort low, medium, high, xhigh, or max. Use low instead of none or minimal.`
        : `${modelLabel} supports reasoning effort none, low, medium, high, xhigh, or max.`,
    );
  }

  if (api === 'chat') {
    validateChatTools(body, variant, modelLabel, effort, allowChatTools);
  }

  if (variant === 'astra' || effort !== 'none') {
    for (const key of ['temperature', 'top_p', 'logprobs', 'top_logprobs']) {
      delete body[key];
    }
    if (Array.isArray(body.include)) {
      body.include = body.include.filter((item) => item !== 'message.output_text.logprobs');
    }
  }
  delete body.max_tokens;
  delete body[api === 'chat' ? 'max_output_tokens' : 'max_completion_tokens'];
}
