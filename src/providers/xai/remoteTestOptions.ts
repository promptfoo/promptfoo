type TestWithOptions = {
  metadata?: Record<string, unknown>;
  options?: Record<string, unknown>;
};

const remoteTemplateOptions = new WeakMap<object, boolean>();

export function hasGrok47RemoteTemplateOptions(test?: TestWithOptions): boolean {
  if (!test) {
    return false;
  }
  if (remoteTemplateOptions.has(test)) {
    return remoteTemplateOptions.get(test) === true;
  }
  const internal = test.metadata?.__promptfoo;
  if (
    !internal ||
    typeof internal !== 'object' ||
    !('remote' in internal) ||
    internal.remote !== true ||
    !test.options
  ) {
    return false;
  }

  const { options } = test;
  const passthrough = options.passthrough as Record<string, unknown> | undefined;
  const pending = [
    options.max_completion_tokens,
    options.max_tokens,
    options.reasoning_effort,
    options.reasoning,
    passthrough?.max_completion_tokens,
    passthrough?.max_tokens,
    passthrough?.reasoning_effort,
    passthrough?.reasoning,
  ];
  const visited = new WeakSet<object>();
  for (const value of pending) {
    if (typeof value === 'string' && /\{[{%#]/.test(value)) {
      return true;
    }
    if (value && typeof value === 'object' && !visited.has(value)) {
      visited.add(value);
      pending.push(...Object.values(value));
    }
  }
  return false;
}

/** Carry the remote row's decision through evaluator copies without treating local defaults as remote. */
export function inheritGrok47RemoteTemplateOptions<T extends object>(
  target: T,
  ...sources: TestWithOptions[]
): T {
  remoteTemplateOptions.set(target, sources.some(hasGrok47RemoteTemplateOptions));
  return target;
}
