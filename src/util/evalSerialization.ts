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
  const snapshotProvider = (item: unknown): unknown => {
    if (!isApiProvider(item)) {
      return item;
    }
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
  };
  const containers = new WeakMap<object, object>();
  const serialized = safeJsonStringify(snapshotProvider(value), false, (_key, item) => {
    // A provider's own replacer runs after toJSON(), which can redact or throw. Project
    // the root above and each container's children before JSON.stringify visits them.
    // Ordinary values still use native toJSON behavior (dates, buffers, custom classes).
    const projected = snapshotProvider(item);
    if (
      projected === null ||
      typeof projected !== 'object' ||
      projected instanceof Number ||
      projected instanceof String ||
      projected instanceof Boolean
    ) {
      return projected;
    }
    const container: object = Array.isArray(projected)
      ? Array.from({ length: projected.length }, (_, index) => snapshotProvider(projected[index]))
      : Object.fromEntries(
          Object.entries(projected).map(([key, child]) => [key, snapshotProvider(child)]),
        );
    const cached = containers.get(projected);
    if (cached) {
      // toJSON(key) can update a shared object between occurrences. Refresh its contents
      // while retaining the identity needed by safeJsonStringify's cycle detection.
      for (const key of Object.keys(cached)) {
        Reflect.deleteProperty(cached, key);
      }
      Object.defineProperties(cached, Object.getOwnPropertyDescriptors(container));
      return cached;
    }
    containers.set(projected, container);
    return container;
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
