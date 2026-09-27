import { renderVarsInObject } from '../util/render';

import type { ProviderResponse } from '../contracts/providers';
import type { ApiProvider, CallApiContextParams } from '../types/providers';

interface SetupWaitOptions {
  abortSignal?: AbortSignal;
  timeoutMs?: number;
}

function blockedResponse(error: string, response?: ProviderResponse): ProviderResponse {
  return {
    ...response,
    error: response?.error ?? error,
    incurredCost: 0,
    tokenUsage: { numRequests: 0 },
    metadata: {
      ...response?.metadata,
      providerSetup: { workloadStarted: false },
    },
  };
}

/** Bound even providers that ignore cancellation; cooperative providers receive the same deadline. */
export async function waitForProviderSetup<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  { abortSignal, timeoutMs }: SetupWaitOptions,
  onTimeout: (message: string) => T,
): Promise<T> {
  if (abortSignal?.aborted) {
    throw new Error('Operation cancelled');
  }
  const setupTimeoutMs =
    timeoutMs !== undefined && Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 30_000;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: () => void = () => {};
  const interrupted = new Promise<T>((resolve, reject) => {
    onAbort = () => {
      controller.abort(abortSignal?.reason);
      reject(new Error('Operation cancelled'));
    };
    abortSignal?.addEventListener('abort', onAbort, { once: true });
    timer = setTimeout(() => {
      const message = `Provider local setup check timed out after ${setupTimeoutMs}ms. No workload was started.`;
      controller.abort(new Error(message));
      resolve(onTimeout(message));
    }, setupTimeoutMs);
  });
  try {
    // Attach rejection handlers before invoking third-party code; late settlements are consumed.
    return await Promise.race([
      Promise.resolve().then(() => {
        if (controller.signal.aborted) {
          throw new Error('Operation cancelled');
        }
        return operation(controller.signal);
      }),
      interrupted,
    ]);
  } finally {
    clearTimeout(timer);
    abortSignal?.removeEventListener('abort', onAbort);
  }
}

function waitForSetup(
  operation: (signal: AbortSignal) => Promise<ProviderResponse | undefined>,
  options: SetupWaitOptions,
) {
  return waitForProviderSetup(operation, options, (message) => ({
    ...blockedResponse(message),
    metadata: { providerSetup: { workloadStarted: false, timedOut: true } },
  }));
}

/** Per-evaluation only: neither configuration keys nor results are written to the disk cache. */
export function createProviderSetupCheck({ cache = true }: { cache?: boolean } = {}) {
  const checks = new WeakMap<ApiProvider, Map<string, Promise<ProviderResponse | undefined>>>();
  return async (
    provider: ApiProvider,
    context: CallApiContextParams,
    options: SetupWaitOptions = {},
  ) => {
    if (!provider.checkSetupOnEval || !provider.checkSetup) {
      return undefined;
    }
    const check = () =>
      waitForSetup(async (signal) => {
        try {
          const result = await provider.checkSetup!(context, { abortSignal: signal });
          return result.success
            ? undefined
            : blockedResponse(result.error ?? result.message, result.response);
        } catch {
          return blockedResponse('Provider local setup check failed. No workload was started.');
        }
      }, options);

    if (!cache) {
      return check();
    }
    let key: string;
    try {
      const config = { ...provider.config, ...context.prompt?.config };
      delete config.provider;
      key = JSON.stringify({
        config: renderVarsInObject(config, context.vars),
        // These can be provider inputs even when absent from the explicit config.
        repository: context.vars.repository,
        finding: context.vars.finding,
      });
    } catch {
      // Leave configuration diagnostics to the provider; never reuse an ambiguous key.
      return check();
    }
    let providerChecks = checks.get(provider);
    if (!providerChecks) {
      providerChecks = new Map();
      checks.set(provider, providerChecks);
    }
    const previous = providerChecks.get(key);
    if (previous) {
      // A concurrent waiter still owns its cancellation and deadline.
      const result = await waitForSetup(() => previous, options);
      return result ? structuredClone(result) : undefined;
    }
    const pending = check();
    providerChecks.set(key, pending);
    try {
      const result = await pending;
      if (result) {
        // Earlier workloads can create missing files. Only successful checks remain reusable.
        providerChecks.delete(key);
      }
      // Later grading hooks may mutate responses. Each skipped attempt keeps its own evidence.
      return result ? structuredClone(result) : undefined;
    } catch (error) {
      // Cancellation is not reusable setup evidence for a later attempt.
      providerChecks.delete(key);
      throw error;
    }
  };
}
