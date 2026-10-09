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

/** Load and execute once, preserving the caller's loading and invocation policy. */
export async function executeCallback({
  name,
  args,
  callId,
  reference,
  cache,
  cacheScope,
  abortSignal,
  loadFile,
  loadInline,
  context,
  passContext = false,
  transformOutput = (output) => output,
}: {
  name: string;
  args: string;
  callId?: string;
  reference: unknown;
  cache: Record<string, Function>;
  /** Effective file-owning directory or another adapter-specific cache discriminator. */
  cacheScope?: unknown;
  abortSignal?: AbortSignal;
  loadFile: (reference: string) => Promise<Function>;
  loadInline?: (expression: string) => Function;
  context?: unknown;
  passContext?: boolean;
  transformOutput?: (output: unknown) => unknown;
}): Promise<CallbackExecutionRecord> {
  const identity = { name, arguments: args, ...(callId !== undefined && { callId }) };
  try {
    throwIfAborted(abortSignal);
    const output = await withGenAIToolSpan({ name, arguments: args, callId }, async () => {
      throwIfAborted(abortSignal);
      let states = callbackStates.get(cache);
      if (!states) {
        states = new Map();
        callbackStates.set(cache, states);
      }
      let state = states.get(name);
      if (!state) {
        state = { nextId: 0, resolvedId: 0 };
        states.set(name, state);
      }
      const invocationId = ++state.nextId;
      const currentState = state;
      const resolveCallback = async (): Promise<Function> => {
        let callback = Object.prototype.hasOwnProperty.call(cache, name) ? cache[name] : undefined;
        if (
          !callback ||
          currentState.resolvedId === 0 ||
          currentState.reference !== reference ||
          currentState.scope !== cacheScope
        ) {
          callback = await loadConfiguredCallback(name, reference, loadFile, loadInline);
        }
        if (invocationId > currentState.resolvedId) {
          storeCallback(cache, name, callback);
          currentState.reference = reference;
          currentState.scope = cacheScope;
          currentState.resolvedId = invocationId;
        }
        return callback;
      };
      // File imports still publish their cache entry if this caller stops waiting.
      const callback = await waitForPromiseWithAbort(resolveCallback(), abortSignal);
      throwIfAborted(abortSignal);
      const result = await waitForPromiseWithAbort(
        Promise.resolve(
          passContext ? (callback as Callback)(args, context) : (callback as Callback)(args),
        ),
        abortSignal,
      );
      throwIfAborted(abortSignal);
      return transformOutput(result);
    });
    throwIfAborted(abortSignal);
    return { ...identity, output, isError: false };
  } catch (error) {
    return { ...identity, isError: true, error };
  }
}

async function loadConfiguredCallback(
  name: string,
  reference: unknown,
  loadFile: (reference: string) => Promise<Function>,
  loadInline?: (expression: string) => Function,
): Promise<Function> {
  let callback: unknown;
  if (typeof reference === 'function') {
    callback = reference;
  } else if (typeof reference === 'string' && reference) {
    callback = reference.startsWith('file://')
      ? await loadFile(reference)
      : loadInline
        ? loadInline(reference)
        : new Function('return ' + reference)();
  } else {
    throw new Error(
      reference == null || reference === ''
        ? `No callback found for function '${name}'`
        : `Invalid callback configuration for ${name}`,
    );
  }
  if (typeof callback !== 'function') {
    throw new Error(`Callback '${name}' did not resolve to a function`);
  }
  return callback;
}

function storeCallback(cache: Record<string, Function>, name: string, callback: Function): void {
  Object.defineProperty(cache, name, {
    value: callback,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}
