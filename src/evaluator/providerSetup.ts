import { renderVarsInObject } from '../util/render';

import type { ProviderResponse } from '../contracts/providers';
import type { ApiProvider, CallApiContextParams } from '../types/providers';

/** Per-evaluation only: neither configuration keys nor results are written to the disk cache. */
export function createProviderSetupCheck() {
  const checks = new WeakMap<ApiProvider, Map<string, Promise<ProviderResponse | undefined>>>();
  return async (provider: ApiProvider, context: CallApiContextParams) => {
    if (!provider.checkSetupOnEval || !provider.checkSetup) {
      return undefined;
    }
    const check = async (): Promise<ProviderResponse | undefined> => {
      try {
        const result = await provider.checkSetup!(context);
        if (result.success) {
          return undefined;
        }
        return {
          ...result.response,
          error: result.response?.error ?? result.error ?? result.message,
          incurredCost: 0,
          tokenUsage: { numRequests: 0 },
          metadata: {
            ...result.response?.metadata,
            providerSetup: { workloadStarted: false },
          },
        };
      } catch {
        return {
          error: 'Provider local setup check failed. No workload was started.',
          incurredCost: 0,
          tokenUsage: { numRequests: 0 },
          metadata: { providerSetup: { workloadStarted: false } },
        };
      }
    };

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
    if (!providerChecks.has(key)) {
      providerChecks.set(key, check());
    }
    const result = await providerChecks.get(key);
    // Later grading hooks may mutate responses. Each skipped attempt keeps its own evidence.
    return result ? structuredClone(result) : undefined;
  };
}
