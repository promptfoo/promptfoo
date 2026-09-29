import { withGenAIToolSpan } from './tracing';

import type { CallbackExecutionRecord } from './functionCallbackTypes';

type Callback = (args: string, context?: unknown) => unknown;
type CallbackState = {
  nextId: number;
  resolvedId: number;
  reference?: unknown;
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
  loadFile: (reference: string) => Promise<Function>;
  loadInline?: (expression: string) => Function;
  context?: unknown;
  passContext?: boolean;
  transformOutput?: (output: unknown) => unknown;
}): Promise<CallbackExecutionRecord> {
  const identity = { name, arguments: args, ...(callId !== undefined && { callId }) };
  try {
    const output = await withGenAIToolSpan({ name, arguments: args, callId }, async () => {
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
      let callback = Object.hasOwn(cache, name) ? cache[name] : undefined;
      if (!callback || state.resolvedId === 0 || state.reference !== reference) {
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
      }
      if (invocationId > state.resolvedId) {
        storeCallback(cache, name, callback);
        state.reference = reference;
        state.resolvedId = invocationId;
      }
      const result = await (passContext
        ? (callback as Callback)(args, context)
        : (callback as Callback)(args));
      return transformOutput(result);
    });
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
