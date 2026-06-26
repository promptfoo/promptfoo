import { sanitizeProvider } from '../../models/evalResult';
import { sanitizeObject } from '../sanitizer';
import { INLINE_FUNCTION_LABEL, TRANSFORM_KEYS } from '../transform';
import {
  addPersistedScenarioSourceContext,
  getScenarioOriginalValue,
  getScenarioSourceContext,
  getScenarioTestSourceContext,
} from './scenarioContext';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

interface ApiProviderRecord extends Record<string, unknown> {
  callApi: (...args: unknown[]) => unknown;
  id: () => string;
}

function isApiProvider(provider: unknown): provider is ApiProviderRecord {
  return Boolean(
    isRecord(provider) &&
      typeof provider.id === 'function' &&
      typeof provider.callApi === 'function',
  );
}

function isProviderOptions(provider: unknown): provider is Record<string, unknown> {
  return isRecord(provider) && typeof provider.id === 'string';
}

export function toSerializableProviderRef(
  provider: unknown,
  ancestors = new Set<object>(),
): unknown {
  if (isApiProvider(provider)) {
    return sanitizeProvider(provider as never);
  }
  if (isProviderOptions(provider)) {
    return sanitizeObject(provider, {
      context: 'provider options',
      maxDepth: Number.POSITIVE_INFINITY,
    });
  }
  if (Array.isArray(provider)) {
    if (ancestors.has(provider)) {
      return undefined;
    }
    ancestors.add(provider);
    const sanitized = provider.map((nestedProvider) =>
      toSerializableProviderRef(nestedProvider, ancestors),
    );
    ancestors.delete(provider);
    return sanitized;
  }
  if (isRecord(provider)) {
    if (ancestors.has(provider)) {
      return undefined;
    }
    ancestors.add(provider);
    const sanitized = Object.fromEntries(
      Object.entries(provider)
        .map(([providerKey, nestedProvider]) => [
          providerKey,
          toSerializableProviderRef(nestedProvider, ancestors),
        ])
        .filter((entry) => entry[1] !== undefined),
    );
    ancestors.delete(provider);
    return sanitizeObject(sanitized, {
      context: 'provider map',
      maxDepth: Number.POSITIVE_INFINITY,
    });
  }
  return provider;
}

function restoreTemplates(
  runtimeValue: unknown,
  originalValue: unknown,
  seen = new WeakMap<object, unknown>(),
): unknown {
  if (typeof originalValue === 'string' && originalValue.includes('{{')) {
    return originalValue;
  }
  if (!runtimeValue || typeof runtimeValue !== 'object') {
    return runtimeValue;
  }
  if (!originalValue || typeof originalValue !== 'object') {
    return runtimeValue;
  }
  const cached = seen.get(runtimeValue);
  if (cached !== undefined) {
    return cached;
  }
  if (Array.isArray(runtimeValue) && Array.isArray(originalValue)) {
    const restored: unknown[] = [];
    seen.set(runtimeValue, restored);
    runtimeValue.forEach((value, index) => {
      restored.push(restoreTemplates(value, originalValue[index], seen));
    });
    return restored;
  }
  if (!isRecord(runtimeValue) || !isRecord(originalValue) || isApiProvider(runtimeValue)) {
    return runtimeValue;
  }
  const restored: Record<string, unknown> = { ...runtimeValue };
  seen.set(runtimeValue, restored);
  for (const [key, original] of Object.entries(originalValue)) {
    if (Object.prototype.hasOwnProperty.call(runtimeValue, key)) {
      restored[key] = restoreTemplates(runtimeValue[key], original, seen);
    }
  }
  return restored;
}

function withSerializableProvider<T extends Record<string, unknown>>(record: T): T {
  if (!Object.prototype.hasOwnProperty.call(record, 'provider')) {
    return record;
  }
  const provider = toSerializableProviderRef(record.provider);
  return provider === record.provider ? record : ({ ...record, provider } as T);
}

function replaceFunctionTransforms<T extends Record<string, unknown>>(
  record: T,
  droppedRef: { value: boolean },
): T {
  let result: T | undefined;
  for (const key of TRANSFORM_KEYS) {
    const value = record[key];
    if (typeof value !== 'function') {
      continue;
    }
    result ??= { ...record };
    (result as Record<string, unknown>)[key] = value.name
      ? `${INLINE_FUNCTION_LABEL}: ${value.name}`
      : INLINE_FUNCTION_LABEL;
    droppedRef.value = true;
  }
  return result ?? record;
}

function toSerializableAssertion(
  assertion: unknown,
  droppedRef: { value: boolean },
  ancestors = new Set<object>(),
): unknown {
  if (!isRecord(assertion)) {
    return assertion;
  }
  if (ancestors.has(assertion)) {
    return undefined;
  }
  ancestors.add(assertion);
  let sanitizedAssertion = replaceFunctionTransforms(
    withSerializableProvider(assertion),
    droppedRef,
  );
  if (Array.isArray(assertion.assert)) {
    sanitizedAssertion = {
      ...sanitizedAssertion,
      assert: assertion.assert
        .map((nested) => toSerializableAssertion(nested, droppedRef, ancestors))
        .filter((nested) => nested !== undefined),
    };
  }
  ancestors.delete(assertion);
  return sanitizedAssertion;
}

export function toSerializableScenarioTestCase(
  testCase: unknown,
  droppedRef: { value: boolean } = { value: false },
): unknown {
  if (!isRecord(testCase)) {
    return testCase;
  }
  const originalValue = getScenarioOriginalValue(testCase);
  const restored = restoreTemplates(testCase, originalValue) as Record<string, unknown>;
  let sanitizedTest = withSerializableProvider(restored);
  if (isRecord(restored.options)) {
    sanitizedTest = {
      ...sanitizedTest,
      options: replaceFunctionTransforms(withSerializableProvider(restored.options), droppedRef),
    };
  }
  if (Array.isArray(restored.assert)) {
    sanitizedTest = {
      ...sanitizedTest,
      assert: restored.assert.map((assertion) => toSerializableAssertion(assertion, droppedRef)),
    };
  }
  return addPersistedScenarioSourceContext(sanitizedTest, getScenarioTestSourceContext(testCase));
}

export function toSerializableScenario(
  scenario: unknown,
  droppedRef: { value: boolean } = { value: false },
): unknown {
  if (!isRecord(scenario)) {
    return scenario;
  }
  const serialized = {
    ...scenario,
    ...(Array.isArray(scenario.config)
      ? {
          config: scenario.config.map((row) => toSerializableScenarioTestCase(row, droppedRef)),
        }
      : {}),
    ...(Array.isArray(scenario.tests)
      ? {
          tests: scenario.tests.map((test) => toSerializableScenarioTestCase(test, droppedRef)),
        }
      : {}),
  };
  return addPersistedScenarioSourceContext(serialized, getScenarioSourceContext(scenario));
}

type SerializableTestSuiteInput = object & {
  defaultTest?: unknown;
  providers?: unknown;
  scenarios?: unknown;
  tests?: unknown;
  writeLatestResults?: boolean;
};

export function createSerializableUnifiedConfig(
  testSuite: SerializableTestSuiteInput,
  prompts: unknown,
  onDroppedTransforms?: () => void,
): Record<string, unknown> {
  const droppedRef = { value: false };
  const config = {
    ...testSuite,
    providers: toSerializableProviderRef(testSuite.providers),
    defaultTest: toSerializableScenarioTestCase(testSuite.defaultTest, droppedRef),
    tests: Array.isArray(testSuite.tests)
      ? testSuite.tests.map((test) => toSerializableScenarioTestCase(test, droppedRef))
      : testSuite.tests,
    scenarios: Array.isArray(testSuite.scenarios)
      ? testSuite.scenarios.map((scenario) => toSerializableScenario(scenario, droppedRef))
      : testSuite.scenarios,
    prompts,
  };

  if (droppedRef.value && testSuite.writeLatestResults) {
    onDroppedTransforms?.();
  }
  return config;
}
