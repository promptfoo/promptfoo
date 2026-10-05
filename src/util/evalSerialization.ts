import { isApiProvider } from '../types/providers';
import { safeJsonStringify } from './json';
import { sanitizeTracingConfigForPersistence } from './sanitizer';

import type { ProviderOptions, UnifiedConfig } from '../types';

/** Serialize local eval data without interpreting or redacting its contents. */
export function serializeEvalValue<T>(value: T): T {
  if (value === null || value === undefined) {
    return value;
  }
  const providers = new WeakMap<object, ProviderOptions>();
  const serialized = safeJsonStringify(value, false, (_key, serializedItem, item) => {
    if (!isApiProvider(item)) {
      return serializedItem;
    }
    // Inspect the original value: provider toJSON() methods may omit config or identity.
    // Persist the provider's configuration, never its live SDK clients or transports.
    let snapshot = providers.get(item);
    if (!snapshot) {
      const provider: ProviderOptions = {
        id: item.id(),
        label: item.label,
        ...(item.config && { config: item.config }),
        ...('env' in item && { env: item.env as ProviderOptions['env'] }),
      };
      providers.set(item, provider);
      snapshot = provider;
    }
    return snapshot;
  });
  return serialized === undefined
    ? ((Array.isArray(value) ? [] : null) as T)
    : JSON.parse(serialized);
}

/** Apply only explicitly requested exclusions to a detached local config. */
export function projectConfigForOutput(
  config: Partial<UnifiedConfig>,
  options: {
    shouldStripPromptText?: boolean;
    shouldStripTestVars?: boolean;
    shouldStripMetadata?: boolean;
    shouldStripResponseOutput?: boolean;
  } = {},
): Partial<UnifiedConfig> {
  const output = serializeEvalValue(sanitizeTracingConfigForPersistence(config));
  if (options.shouldStripPromptText) {
    delete output.prompts;
  }
  const tests = [
    ...(Array.isArray(output.tests) ? output.tests : []),
    output.defaultTest,
    ...(output.scenarios ?? []).flatMap((scenario) =>
      typeof scenario === 'object'
        ? [...(scenario.config ?? []), ...(Array.isArray(scenario.tests) ? scenario.tests : [])]
        : [],
    ),
  ];
  for (const test of tests) {
    if (!test || typeof test !== 'object') {
      continue;
    }
    if (options.shouldStripTestVars && 'vars' in test) {
      delete test.vars;
    }
    if (options.shouldStripMetadata && 'metadata' in test) {
      // Retain the existing remote-row marker and local origins needed for replay.
      const origin = test.metadata?.__promptfoo;
      if (origin?.remote === true) {
        test.metadata = { __promptfoo: { remote: true } };
      } else if (typeof origin?.providerBasePath === 'string') {
        test.metadata = { __promptfoo: { providerBasePath: origin.providerBasePath } };
      } else {
        delete test.metadata;
      }
    }
    if (options.shouldStripResponseOutput && 'providerOutput' in test) {
      delete test.providerOutput;
    }
  }
  return output;
}
