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
): { options: Record<string, unknown>; effort: unknown; clearOptions: boolean } {
  const typed = renderResponsesReasoning(config?.reasoning, render, resolveEffort);
  if (typed === null) {
    return { options: {}, effort: null, clearOptions: true };
  }
  const typedEffort = getObject(typed)?.effort;
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
  return { options, effort, clearOptions: passthrough === null };
}

/** Honor literal full clears even when a model does not process typed reasoning options.
 * A prompt's raw object can replace a provider clear; a named null wins in its own scope.
 * Do not evaluate unsupported typed values or raw callbacks while detecting a clear.
 */
export function isResponsesReasoningCleared(
  providerConfig: ReasoningConfig,
  promptConfig: ReasoningConfig | undefined,
): boolean {
  if (promptConfig?.reasoning === null) {
    return true;
  }
  const promptPassthrough = getObject(promptConfig?.passthrough)?.reasoning;
  if (promptPassthrough !== undefined) {
    return promptPassthrough === null;
  }
  return (
    providerConfig.reasoning === null || getObject(providerConfig.passthrough)?.reasoning === null
  );
}

/** Apply literal clear controls to raw legacy options without evaluating unsupported callbacks. */
export function applyResponsesReasoningClears<T>(
  value: T,
  providerConfig: ReasoningConfig,
  promptConfig: ReasoningConfig | undefined,
): T | Record<string, unknown> | undefined {
  if (isResponsesReasoningCleared(providerConfig, promptConfig)) {
    return undefined;
  }
  const options = getObject(value);
  if (!options) {
    return value;
  }
  const effort = firstDefined(
    getObject(promptConfig?.reasoning)?.effort,
    getObject(getObject(promptConfig?.passthrough)?.reasoning)?.effort,
    promptConfig?.reasoning_effort,
    getObject(providerConfig.reasoning)?.effort,
    getObject(getObject(providerConfig.passthrough)?.reasoning)?.effort,
    providerConfig.reasoning_effort,
  );
  if (effort !== null && effort !== '') {
    return value;
  }
  const { effort: _effort, ...remaining } = options;
  return Object.keys(remaining).length ? remaining : undefined;
}

/** Resolve options and explicit clears together so callbacks are evaluated only once. */
export function resolveResponsesReasoningState(
  providerConfig: ReasoningConfig,
  promptConfig: ReasoningConfig | undefined,
  render: (value: unknown) => unknown,
  settings: { includeEffort?: boolean } = {},
): { reasoning: Record<string, unknown> | undefined; hasExplicitConfig: boolean } {
  const includeEffort = settings.includeEffort !== false;
  const prompt = getResponsesReasoning(promptConfig, render, includeEffort);
  const provider = prompt.clearOptions
    ? undefined
    : getResponsesReasoning(providerConfig, render, includeEffort && prompt.effort === undefined);
  const options = { ...provider?.options, ...prompt.options };
  const effort = firstDefined(prompt.effort, provider?.effort);
  const clearsEffort = effort === null || effort === '';
  if (clearsEffort) {
    delete options.effort;
  } else if (effort !== undefined) {
    options.effort = effort;
  }
  for (const key of Object.keys(options)) {
    if (options[key] === undefined) {
      delete options[key];
    }
  }
  const reasoning = Object.keys(options).length ? options : undefined;
  return {
    reasoning,
    hasExplicitConfig:
      reasoning !== undefined ||
      clearsEffort ||
      prompt.clearOptions ||
      provider?.clearOptions === true,
  };
}

/** Merge Responses options across scopes, preserving explicit clears and selected effort. */
export function resolveResponsesReasoning(
  providerConfig: ReasoningConfig,
  promptConfig: ReasoningConfig | undefined,
  render: (value: unknown) => unknown,
  settings: { includeEffort?: boolean } = {},
): Record<string, unknown> | undefined {
  return resolveResponsesReasoningState(providerConfig, promptConfig, render, settings).reasoning;
}
