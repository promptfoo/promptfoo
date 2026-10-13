/** Resolve user configuration independently of model-specific API restrictions. */
type ReasoningConfig = { reasoning?: unknown; reasoning_effort?: unknown; passthrough?: unknown };

function getObject(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function firstDefined(...values: unknown[]): unknown {
  return values.find((value) => value !== undefined);
}

/** Prompt settings override provider settings; named fields override passthrough within each scope.
 * Keep null and empty strings as explicit clears so callers do not restore a default.
 */
export function resolveChatReasoningEffort(
  providerConfig: ReasoningConfig,
  promptConfig: ReasoningConfig | undefined,
  render: (value: unknown) => unknown,
): unknown {
  const candidates = [
    promptConfig?.reasoning_effort,
    getObject(promptConfig?.passthrough)?.reasoning_effort,
    providerConfig.reasoning_effort,
    getObject(providerConfig.passthrough)?.reasoning_effort,
  ];
  for (const candidate of candidates) {
    if (candidate !== undefined) {
      const effort = render(candidate);
      if (effort !== undefined) {
        return effort;
      }
    }
  }
  return undefined;
}

function renderResponsesReasoning(
  value: unknown,
  render: (value: unknown) => unknown,
  resolveEffort: boolean,
): unknown {
  const object = getObject(value);
  if (!resolveEffort && object) {
    const { effort: _effort, ...options } = object;
    return render(options);
  }
  const result = render(value);
  const renderedObject = getObject(result);
  if (!resolveEffort && renderedObject) {
    const { effort: _effort, ...options } = renderedObject;
    return options;
  }
  return result;
}

function getResponsesReasoning(
  config: ReasoningConfig | undefined,
  render: (value: unknown) => unknown,
  resolveEffort = true,
) {
  const typed = renderResponsesReasoning(config?.reasoning, render, resolveEffort);
  const typedEffort = typed === null ? null : getObject(typed)?.effort;
  const passthrough = renderResponsesReasoning(
    getObject(config?.passthrough)?.reasoning,
    render,
    resolveEffort && typedEffort === undefined,
  );
  for (const value of [typed, passthrough]) {
    if (value != null && !getObject(value)) {
      throw new Error('Responses reasoning must be an object or null. Use { effort: low }.');
    }
  }
  const options = { ...getObject(passthrough), ...getObject(typed) };
  const nestedEffort = firstDefined(
    typedEffort,
    passthrough === null ? null : getObject(passthrough)?.effort,
  );
  const effort =
    nestedEffort === undefined && resolveEffort ? render(config?.reasoning_effort) : nestedEffort;
  return { options, effort, clearOptions: typed === null || passthrough === null };
}

/** Merge Responses options across scopes, preserving explicit clears and rendering only selected effort. */
export function resolveResponsesReasoning(
  providerConfig: ReasoningConfig,
  promptConfig: ReasoningConfig | undefined,
  render: (value: unknown) => unknown,
  settings: { includeEffort?: boolean } = {},
): Record<string, unknown> | undefined {
  const includeEffort = settings.includeEffort !== false;
  const prompt = getResponsesReasoning(promptConfig, render, includeEffort);
  const provider = prompt.clearOptions
    ? undefined
    : getResponsesReasoning(providerConfig, render, includeEffort && prompt.effort === undefined);
  const options = { ...provider?.options, ...prompt.options };
  const effort = firstDefined(prompt.effort, provider?.effort);
  if (effort === null || effort === '') {
    delete options.effort;
  } else if (effort !== undefined) {
    options.effort = effort;
  }
  return Object.keys(options).length ? options : undefined;
}
