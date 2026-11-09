import { throwIfAborted, waitForPromiseWithAbort } from './shared';
import { withGenAIToolSpan } from './tracing';

import type { CallbackExecutionRecord } from './functionCallbackTypes';

type Callback = (args: string, context?: unknown) => unknown;
type CallbackState = {
  nextId: number;
  resolvedId: number;
  reference?: unknown;
  scope?: unknown;
};

// Each cache retains the newest successfully loaded reference for a tool name.
const callbackStates = new WeakMap<Record<string, Function>, Map<string, CallbackState>>();

interface CallbackResolutionOptions {
  name: string;
  reference: unknown;
  cache: Record<string, Function>;
  /** Effective file-owning directory or another adapter-specific cache discriminator. */
  cacheScope?: unknown;
  loadFile: (reference: string) => Promise<Function>;
  loadInline?: (expression: string) => Function;
}

/** Return ready callbacks synchronously. A cold file load publishes its result even if a caller stops waiting. */
export function resolveCallback({
  name,
  reference,
  cache,
  cacheScope,
  loadFile,
  loadInline,
}: CallbackResolutionOptions): Function | Promise<Function> {
  let states = callbackStates.get(cache);
  if (!states) {
    states = new Map();
    callbackStates.set(cache, states);
  }
  const state: CallbackState = states.get(name) ?? { nextId: 0, resolvedId: 0 };
  states.set(name, state);
  const invocationId = ++state.nextId;
  const publish = (callback: unknown): Function => {
    if (typeof callback !== 'function') {
      throw new Error(`Callback '${name}' did not resolve to a function`);
    }
    if (invocationId > state.resolvedId) {
      storeCallback(cache, name, callback);
      state.reference = reference;
      state.scope = cacheScope;
      state.resolvedId = invocationId;
    }
    return callback;
  };

  const cached = Object.prototype.hasOwnProperty.call(cache, name) ? cache[name] : undefined;
  if (
    cached &&
    state.resolvedId > 0 &&
    state.reference === reference &&
    state.scope === cacheScope
  ) {
    return publish(cached);
  }
  if (typeof reference === 'function') {
    return publish(reference);
  }
  if (typeof reference === 'string' && reference) {
    if (reference.startsWith('file://')) {
      return loadFile(reference).then(publish);
    }
    return publish(loadInline ? loadInline(reference) : new Function('return ' + reference)());
  }
  throw new Error(
    reference == null || reference === ''
      ? `No callback found for function '${name}'`
      : `Invalid callback configuration for ${name}`,
  );
}

/** Run adapters that trace loading, invocation, and output conversion together. */
export async function executeCallback({
  args,
  callId,
  abortSignal,
  context,
  passContext = false,
  transformOutput = (output) => output,
  ...options
}: CallbackResolutionOptions & {
  args: string;
  callId?: string;
  abortSignal?: AbortSignal;
  context?: unknown;
  passContext?: boolean;
  transformOutput?: (output: unknown) => unknown;
}): Promise<CallbackExecutionRecord> {
  const identity = { name: options.name, arguments: args, ...(callId !== undefined && { callId }) };
  try {
    throwIfAborted(abortSignal);
    const output = await withGenAIToolSpan(
      { name: options.name, arguments: args, callId },
      async () => {
        throwIfAborted(abortSignal);
        const resolved = resolveCallback(options);
        const callback =
          typeof resolved === 'function'
            ? resolved
            : await waitForPromiseWithAbort(resolved, abortSignal);
        throwIfAborted(abortSignal);
        const result = await waitForPromiseWithAbort(
          Promise.resolve(
            passContext ? (callback as Callback)(args, context) : (callback as Callback)(args),
          ),
          abortSignal,
        );
        throwIfAborted(abortSignal);
        return transformOutput(result);
      },
    );
    throwIfAborted(abortSignal);
    return { ...identity, output, isError: false };
  } catch (error) {
    return { ...identity, isError: true, error };
  }
}

function storeCallback(cache: Record<string, Function>, name: string, callback: Function): void {
  Object.defineProperty(cache, name, {
    value: callback,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}
