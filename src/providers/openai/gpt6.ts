const REASONING_EFFORTS = new Set(['low', 'medium', 'high', 'xhigh', 'max']);
const UNKNOWN_PERSISTED_EFFORT = Symbol('unknown persisted effort');
const COMPACTED_EFFORT = Symbol('effort before compaction');

type Gpt6Variant = 'astra' | 'sol' | 'luna';
type Gpt6Reasoning = { effort?: unknown; enabled?: unknown; mode?: unknown } | null | undefined;

export function getGpt6Variant(modelName: unknown): Gpt6Variant | undefined {
  if (typeof modelName !== 'string') {
    return undefined;
  }
  const model = modelName.split('/').at(-1) ?? modelName;
  return /(?:^|[.-])gpt-6-(astra|sol|luna)(?:[-:]|$)/.exec(model)?.[1] as Gpt6Variant | undefined;
}

export function isGpt6Model(modelName: unknown): boolean {
  return getGpt6Variant(modelName) !== undefined;
}

type ReasoningConfig = { reasoning?: unknown; reasoning_effort?: unknown; passthrough?: unknown };

function getObject(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function firstDefined(...values: unknown[]): unknown {
  return values.find((value) => value !== undefined);
}

export function getGpt6ChatReasoningEffort(
  providerConfig: ReasoningConfig,
  promptConfig?: ReasoningConfig,
): unknown {
  return firstDefined(
    promptConfig?.reasoning_effort,
    getObject(promptConfig?.passthrough)?.reasoning_effort,
    providerConfig.reasoning_effort,
    getObject(providerConfig.passthrough)?.reasoning_effort,
  );
}

function getResponsesReasoning(
  config: ReasoningConfig | undefined,
  render: (value: unknown) => unknown,
) {
  const typed = render(config?.reasoning);
  const passthrough = render(getObject(config?.passthrough)?.reasoning);
  for (const value of [typed, passthrough]) {
    if (value != null && !getObject(value)) {
      throw new Error('GPT-6 Responses reasoning must be an object or null. Use { effort: none }.');
    }
  }
  const options = { ...getObject(passthrough), ...getObject(typed) };
  const nestedEffort = firstDefined(
    typed === null ? null : getObject(typed)?.effort,
    passthrough === null ? null : getObject(passthrough)?.effort,
  );
  const effort = nestedEffort === undefined ? render(config?.reasoning_effort) : nestedEffort;
  return { options, effort, clearOptions: typed === null || passthrough === null };
}

export function getGpt6ResponsesReasoning(
  providerConfig: ReasoningConfig,
  promptConfig: ReasoningConfig | undefined,
  render: (value: unknown) => unknown,
): Record<string, unknown> | undefined {
  const prompt = getResponsesReasoning(promptConfig, render);
  const provider = prompt.clearOptions ? undefined : getResponsesReasoning(providerConfig, render);
  const options = { ...provider?.options, ...prompt.options };
  const effort = firstDefined(prompt.effort, provider?.effort);
  if (effort === null) {
    delete options.effort;
  } else if (effort !== undefined) {
    options.effort = effort;
  }
  return Object.keys(options).length ? options : undefined;
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

function getResponsesEffortUpdates(input: unknown): unknown[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const efforts: unknown[] = [];
  for (const item of input) {
    if (
      typeof item?.id === 'string' &&
      (item.type === 'item_reference' ||
        (item.type == null && Object.keys(item).every((key) => key === 'id' || key === 'type')))
    ) {
      efforts.push(UNKNOWN_PERSISTED_EFFORT);
      continue;
    }
    if (item?.type === 'compaction') {
      efforts.push(COMPACTED_EFFORT);
      continue;
    }
    if (item?.type === 'configuration_update') {
      const effort = item.reasoning?.effort;
      if (effort != null && effort !== '') {
        efforts.push(effort);
      }
    }
  }
  return efforts;
}

function getOpenRouterChatEffortUpdates(messages: unknown): unknown[] {
  if (!Array.isArray(messages)) {
    return [];
  }

  const efforts: unknown[] = [];
  for (const message of messages) {
    if ((message?.role === 'system' || message?.role === 'developer') && message.content === '') {
      const effort = message.configuration_update?.reasoning?.effort;
      if (effort != null && effort !== '') {
        efforts.push(effort);
      }
    }
  }
  return efforts;
}

function validateReasoningEffort(effort: unknown, variant: Gpt6Variant, modelLabel: string): void {
  if (
    effort == null ||
    effort === '' ||
    (typeof effort === 'string' &&
      (REASONING_EFFORTS.has(effort) || (variant !== 'astra' && effort === 'none')))
  ) {
    return;
  }

  throw new Error(
    variant === 'astra'
      ? `${modelLabel} supports reasoning effort low, medium, high, xhigh, or max. Use low instead of none or minimal.`
      : `${modelLabel} supports reasoning effort none, low, medium, high, xhigh, or max.`,
  );
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
  // Native Chat rejects an explicit tool_choice or function_call without definitions, even `none`.
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

function getSamplingEffort(
  body: Record<string, unknown>,
  api: 'chat' | 'responses',
  effort: unknown,
  variant: Gpt6Variant,
  modelLabel: string,
  isOpenRouter: boolean,
  supportsPersistedEffortUpdates: boolean,
): unknown {
  if (
    (api === 'chat' && !isOpenRouter) ||
    (api === 'responses' && !supportsPersistedEffortUpdates)
  ) {
    return effort;
  }
  const updates =
    api === 'chat'
      ? getOpenRouterChatEffortUpdates(body.messages)
      : getResponsesEffortUpdates(body.input);
  for (const update of updates) {
    if (update !== UNKNOWN_PERSISTED_EFFORT && update !== COMPACTED_EFFORT) {
      validateReasoningEffort(update, variant, modelLabel);
    }
  }
  if (updates.length) {
    const latest = updates.at(-1);
    return latest === COMPACTED_EFFORT ? effort : latest;
  }
  // A linked response or stored conversation can carry an effort we cannot see locally.
  if (api === 'responses' && (body.previous_response_id || body.conversation)) {
    return UNKNOWN_PERSISTED_EFFORT;
  }
  return effort;
}

/** Apply GPT-6 request restrictions after config and passthrough have been merged. */
export function applyGpt6RequestRules(
  body: Record<string, unknown>,
  modelName: unknown,
  api: 'chat' | 'responses',
  options: {
    isOpenRouter?: boolean;
    defaultResponsesTemperature?: number;
    supportsPersistedEffortUpdates?: boolean;
  } = {},
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
  if (api === 'chat' && variant !== 'astra' && !options.isOpenRouter && body.reasoning != null) {
    throw new Error(
      `${modelLabel} Chat Completions requests use reasoning_effort. Configure reasoning_effort instead of passthrough.reasoning.`,
    );
  }
  const effort =
    api === 'chat'
      ? (body.reasoning_effort ??
        reasoning?.effort ??
        (options.isOpenRouter && reasoning?.enabled === false ? 'none' : undefined))
      : reasoning?.effort;
  validateReasoningEffort(effort, variant, modelLabel);

  if (api === 'chat') {
    validateChatTools(body, variant, modelLabel, effort, options.isOpenRouter ?? false);
  }
  const samplingEffort = getSamplingEffort(
    body,
    api,
    effort,
    variant,
    modelLabel,
    options.isOpenRouter ?? false,
    (options.supportsPersistedEffortUpdates ?? true) &&
      reasoning?.mode !== 'pro' &&
      getObject(body.multi_agent)?.enabled !== true,
  );
  if (
    api === 'responses' &&
    samplingEffort === 'none' &&
    !Object.hasOwn(body, 'temperature') &&
    options.defaultResponsesTemperature !== undefined
  ) {
    body.temperature = options.defaultResponsesTemperature;
  }

  if (
    variant === 'astra' ||
    (samplingEffort !== UNKNOWN_PERSISTED_EFFORT && samplingEffort !== 'none')
  ) {
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
