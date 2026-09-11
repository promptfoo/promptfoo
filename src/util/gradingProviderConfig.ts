import { isApiProvider } from '../types/providers';
import { renderEnvOnlyInObject } from './render';
import { getNunjucksEngine } from './templates';

import type { EnvOverrides } from '../types/env';
import type { NunjucksFilterMap, VarValue } from '../types/index';
import type { ProviderOptions } from '../types/providers';

/** Raw grader configs must survive provider resolution until per-case vars are available. */
export function hasProviderConfigTemplates(provider: unknown): provider is ProviderOptions {
  if (!provider || typeof provider !== 'object' || isApiProvider(provider)) {
    return false;
  }
  const { id, config } = provider as ProviderOptions;
  return (
    typeof id === 'string' &&
    !!config &&
    Object.values(config).some((value) => typeof value === 'string' && /\{[{%#]/.test(value))
  );
}

/** Render config templates once, before constructing an agent-rubric grader. */
export function renderGradingProviderConfig(
  config: ProviderOptions['config'],
  vars?: Record<string, VarValue>,
  env?: EnvOverrides,
  filters?: NunjucksFilterMap,
): ProviderOptions['config'] {
  if (!config) {
    return config;
  }
  const engine = getNunjucksEngine(filters, true, true);
  const context = {
    ...vars,
    env: { ...engine.getGlobal('env'), ...env },
  };
  const renderedConfig = { ...config };
  for (const [key, value] of Object.entries(config)) {
    if (typeof value === 'string') {
      let rendered: string;
      try {
        rendered = engine.renderString(value, context);
      } catch {
        throw new Error(
          `Invalid agent-rubric provider config template in "${key}": check the syntax and ensure all referenced variables are defined.`,
        );
      }
      // Some agent SDK providers render config again at call time. Reject
      // residual syntax so case data cannot become a template on that pass.
      if (/\{[{%#]/.test(rendered)) {
        throw new Error(
          `Invalid agent-rubric provider config in "${key}": the rendered value contains template syntax that a provider could interpret again.`,
        );
      }
      renderedConfig[key] = rendered;
    } else {
      // Preserve the loader's existing env-only behavior for nested objects/arrays.
      renderedConfig[key] = renderEnvOnlyInObject(value, env);
    }
  }
  return renderedConfig;
}
