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

/** Check current row state every time; setup can depend on arbitrary context or external state. */
export async function checkProviderSetup(
  provider: ApiProvider,
  context: CallApiContextParams,
  options: SetupWaitOptions = {},
): Promise<ProviderResponse | undefined> {
  if (!provider.checkSetupOnEval || !provider.checkSetup) {
    return undefined;
  }
  const response = await waitForSetup(async (signal) => {
    try {
      const result = await provider.checkSetup!(context, { abortSignal: signal });
      return result.success
        ? undefined
        : blockedResponse(result.error ?? result.message, result.response);
    } catch {
      return blockedResponse('Provider local setup check failed. No workload was started.');
    }
  }, options);
  // A provider may return the same response object to multiple callers.
  return response ? structuredClone(response) : undefined;
}
