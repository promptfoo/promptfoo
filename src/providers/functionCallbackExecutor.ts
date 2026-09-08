import { awaitProviderOperation } from './shared';
import { withGenAIToolSpan } from './tracing';

import type { CallbackExecutionRecord } from './functionCallbackTypes';

type Callback = (args: string, context?: unknown) => unknown;
type CallbackLoad = {
  previous?: CallbackLoad;
  callback?: Function;
  reference?: unknown;
  failed?: boolean;
};

// Keep existing per-provider caches compatible, but invalidate a name when a
// prompt changes its configured function or file reference. Weak ownership lets
// cleanup/replacement of a provider release this metadata too.
const callbackReferences = new WeakMap<Record<string, Function>, Map<string, unknown>>();
const callbackLoads = new WeakMap<Record<string, Function>, Map<string, CallbackLoad>>();

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
  signal,
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
  signal?: AbortSignal;
  transformOutput?: (output: unknown) => unknown;
}): Promise<CallbackExecutionRecord> {
  const identity = { name, arguments: args, ...(callId !== undefined && { callId }) };
  signal?.throwIfAborted();
  try {
    const output = await withGenAIToolSpan({ name, arguments: args, callId }, async () => {
      let references = callbackReferences.get(cache);
      if (!references) {
        references = new Map();
        callbackReferences.set(cache, references);
      }
      let loads = callbackLoads.get(cache);
      if (!loads) {
        loads = new Map();
        callbackLoads.set(cache, loads);
      }
      const load: CallbackLoad = { previous: loads.get(name) };
      loads.set(name, load);
      let callback = cache[name];
      if (!callback || references.get(name) !== reference) {
        let resolved = false;
        try {
          if (typeof reference === 'function') {
            callback = reference;
          } else if (typeof reference === 'string' && reference) {
            callback = reference.startsWith('file://')
              ? await awaitProviderOperation(loadFile(reference), signal)
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
          resolved = true;
        } finally {
          if (!resolved) {
            load.failed = true;
            if (loads.get(name) === load) {
              let previous = load.previous;
              while (previous?.failed) {
                previous = previous.previous;
              }
              if (previous) {
                loads.set(name, previous);
                if (previous.callback) {
                  cache[name] = previous.callback;
                  references.set(name, previous.reference);
                  previous.previous = undefined;
                }
              } else {
                loads.delete(name);
              }
            }
          }
        }
        if (loads.get(name) === load) {
          cache[name] = callback;
          references.set(name, reference);
        }
      }
      load.callback = callback;
      load.reference = reference;
      if (loads.get(name) === load) {
        load.previous = undefined;
      }
      signal?.throwIfAborted();
      const result = await awaitProviderOperation(
        Promise.resolve(
          passContext ? (callback as Callback)(args, context) : (callback as Callback)(args),
        ),
        signal,
      );
      return transformOutput(result);
    });
    return { ...identity, output, isError: false };
  } catch (error) {
    signal?.throwIfAborted();
    return { ...identity, isError: true, error };
  }
}
