import * as fs from 'fs';
import path from 'path';

import { hasMagic } from 'glob';
import { GLOB_OPTIONS, resolveLiteralPathOrGlob } from '../pathUtils';
import { isSecretField, looksLikeSecret, REDACTED, sanitizeObject } from '../sanitizer';

type EnvOverrides = Record<string, string | undefined>;

export interface ScenarioSourceContext {
  basePath: string;
  envOverrides?: EnvOverrides;
  dependencies?: string[];
  watchRoots?: string[];
}

interface PersistedScenarioSourceContext {
  version: 1;
  basePath: string;
  envOverrides?: EnvOverrides;
}

export const PERSISTED_SCENARIO_SOURCE_KEY = '__promptfooScenarioSource';

const SCENARIO_CONFIG_SOURCE_CONTEXT = Symbol.for('promptfoo.scenarioConfigSourceContext');
const SCENARIO_SOURCE_CONTEXT = Symbol.for('promptfoo.scenarioSourceContext');
const SCENARIO_TEST_SOURCE_CONTEXT = Symbol.for('promptfoo.scenarioTestSourceContext');
const SCENARIO_ORIGINAL_VALUE = Symbol.for('promptfoo.scenarioOriginalValue');

type ScenarioContextTarget = {
  [SCENARIO_CONFIG_SOURCE_CONTEXT]?: ScenarioSourceContext;
  [SCENARIO_SOURCE_CONTEXT]?: ScenarioSourceContext;
  [SCENARIO_TEST_SOURCE_CONTEXT]?: ScenarioSourceContext;
  [SCENARIO_ORIGINAL_VALUE]?: unknown;
};

function setHiddenValue(target: object, key: symbol, value: unknown): void {
  Object.defineProperty(target, key, {
    value,
    configurable: true,
    writable: true,
  });
}

export function getScenarioConfigSourceContext(
  valuesRef: object,
): ScenarioSourceContext | undefined {
  return (valuesRef as ScenarioContextTarget)[SCENARIO_CONFIG_SOURCE_CONTEXT];
}

export function setScenarioConfigSourceContext(
  valuesRef: object,
  sourceContext: ScenarioSourceContext,
): void {
  setHiddenValue(valuesRef, SCENARIO_CONFIG_SOURCE_CONTEXT, sourceContext);
}

export function getScenarioSourceContext(scenario: object): ScenarioSourceContext | undefined {
  return (scenario as ScenarioContextTarget)[SCENARIO_SOURCE_CONTEXT];
}

export function setScenarioSourceContext(
  scenario: object,
  sourceContext: ScenarioSourceContext,
): void {
  setHiddenValue(scenario, SCENARIO_SOURCE_CONTEXT, sourceContext);
}

export function transferScenarioSourceContext<T extends object>(source: object, target: T): T {
  const sourceContext = getScenarioSourceContext(source);
  if (sourceContext) {
    setScenarioSourceContext(target, sourceContext);
  }
  return target;
}

export function getScenarioTestSourceContext(test: object): ScenarioSourceContext | undefined {
  return (test as ScenarioContextTarget)[SCENARIO_TEST_SOURCE_CONTEXT];
}

export function setScenarioTestSourceContext(
  test: object,
  sourceContext: ScenarioSourceContext,
): void {
  setHiddenValue(test, SCENARIO_TEST_SOURCE_CONTEXT, sourceContext);
}

export function transferScenarioTestSourceContext<T extends object>(source: object, target: T): T {
  const sourceContext = getScenarioTestSourceContext(source);
  if (sourceContext) {
    setScenarioTestSourceContext(target, sourceContext);
  }
  const originalValue = getScenarioOriginalValue(source);
  if (originalValue !== undefined) {
    setScenarioOriginalValue(target, originalValue);
  }
  return target;
}

export function setScenarioOriginalValue(value: object, originalValue: unknown): void {
  setHiddenValue(value, SCENARIO_ORIGINAL_VALUE, originalValue);
}

export function getScenarioOriginalValue(value: object): unknown {
  return (value as ScenarioContextTarget)[SCENARIO_ORIGINAL_VALUE];
}

function isSensitiveEnvOverride(key: string, value: string): boolean {
  const sanitized = sanitizeObject({ [key]: value }, { context: 'scenario source env' }) as Record<
    string,
    unknown
  >;
  return (
    isSecretField(key) ||
    /(?:secret|token|password|api[_-]?key|credential|authorization|signature|sig)/i.test(key) ||
    looksLikeSecret(value) ||
    sanitized[key] === REDACTED
  );
}

export function redactSensitiveEnvValues(
  value: string,
  envOverrides: EnvOverrides | undefined,
): string {
  if (!envOverrides) {
    return value;
  }
  return Object.entries(envOverrides)
    .filter(
      (entry): entry is [string, string] =>
        typeof entry[1] === 'string' &&
        entry[1].length > 0 &&
        isSensitiveEnvOverride(entry[0], entry[1]),
    )
    .sort((left, right) => right[1].length - left[1].length)
    .reduce((sanitized, [, envValue]) => sanitized.split(envValue).join(REDACTED), value);
}

function serializeEnvOverrides(envOverrides: EnvOverrides | undefined): {
  envOverrides?: EnvOverrides;
} {
  if (!envOverrides) {
    return {};
  }

  const persisted: EnvOverrides = {};
  for (const [key, value] of Object.entries(envOverrides)) {
    if (value === undefined) {
      continue;
    }
    if (isSensitiveEnvOverride(key, value)) {
      continue;
    }
    persisted[key] = value;
  }

  return {
    ...(Object.keys(persisted).length > 0 ? { envOverrides: persisted } : {}),
  };
}

function serializeSourceContext(
  sourceContext: ScenarioSourceContext,
): PersistedScenarioSourceContext {
  return {
    version: 1,
    basePath: sourceContext.basePath,
    ...serializeEnvOverrides(sourceContext.envOverrides),
  };
}

function deserializeSourceContext(
  sourceContext: PersistedScenarioSourceContext,
): ScenarioSourceContext {
  return {
    basePath: sourceContext.basePath,
    envOverrides: sourceContext.envOverrides,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function readPersistedContext(value: Record<string, unknown>): ScenarioSourceContext | undefined {
  const persisted = value[PERSISTED_SCENARIO_SOURCE_KEY];
  if (
    !isRecord(persisted) ||
    persisted.version !== 1 ||
    typeof persisted.basePath !== 'string' ||
    (persisted.envOverrides !== undefined && !isRecord(persisted.envOverrides)) ||
    (isRecord(persisted.envOverrides) &&
      Object.entries(persisted.envOverrides).some(
        ([key, envValue]) => key.length > 256 || typeof envValue !== 'string',
      ))
  ) {
    return undefined;
  }
  return deserializeSourceContext(persisted as unknown as PersistedScenarioSourceContext);
}

export function addPersistedScenarioSourceContext<T extends Record<string, unknown>>(
  value: T,
  sourceContext: ScenarioSourceContext | undefined,
): T {
  if (!sourceContext) {
    return value;
  }
  return {
    ...value,
    [PERSISTED_SCENARIO_SOURCE_KEY]: serializeSourceContext(sourceContext),
  };
}

export function restoreScenarioSourceContext<T extends Record<string, unknown>>(value: T): T {
  const sourceContext = readPersistedContext(value);
  if (!sourceContext) {
    return value;
  }
  const { [PERSISTED_SCENARIO_SOURCE_KEY]: _persisted, ...rest } = value;
  setScenarioSourceContext(rest, sourceContext);
  return rest as T;
}

export function restoreScenarioTestSourceContext<T extends Record<string, unknown>>(value: T): T {
  const sourceContext = readPersistedContext(value);
  if (!sourceContext) {
    return value;
  }
  const { [PERSISTED_SCENARIO_SOURCE_KEY]: _persisted, ...rest } = value;
  setScenarioTestSourceContext(rest, sourceContext);
  return rest as T;
}

export function withScenarioSourceFallback(
  sourceContext: ScenarioSourceContext | undefined,
  fallbackBasePath: string,
  fallbackEnv: EnvOverrides | undefined,
): ScenarioSourceContext {
  const sourceEnv = sourceContext?.envOverrides;
  const envOverrides =
    sourceEnv === undefined
      ? fallbackEnv
      : fallbackEnv === undefined
        ? sourceEnv
        : { ...fallbackEnv, ...sourceEnv };
  return {
    ...sourceContext,
    basePath: sourceContext?.basePath ?? fallbackBasePath,
    ...(envOverrides === undefined ? {} : { envOverrides }),
  };
}

function getGlobWatchRoot(pattern: string): string {
  let current = path.dirname(path.resolve(pattern));
  while (!fs.statSync(current, { throwIfNoEntry: false })?.isDirectory()) {
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return current;
}

export function getScenarioDependencyContext(
  rawPath: string,
  basePath: string,
): Pick<ScenarioSourceContext, 'dependencies' | 'watchRoots'> {
  const resolvedPath = path.isAbsolute(rawPath) ? rawPath : path.resolve(basePath, rawPath);
  if (
    fs.statSync(resolvedPath, { throwIfNoEntry: false })?.isFile() ||
    !hasMagic(rawPath, GLOB_OPTIONS)
  ) {
    return { dependencies: [resolvedPath] };
  }
  return {
    dependencies: resolveLiteralPathOrGlob(resolvedPath),
    watchRoots: [getGlobWatchRoot(resolvedPath)],
  };
}

export function mergeScenarioSourceContexts(
  ...contexts: Array<ScenarioSourceContext | undefined>
): ScenarioSourceContext | undefined {
  const base = contexts.find(Boolean);
  if (!base) {
    return undefined;
  }
  return {
    basePath: base.basePath,
    envOverrides: base.envOverrides,
    dependencies: Array.from(new Set(contexts.flatMap((context) => context?.dependencies ?? []))),
    watchRoots: Array.from(new Set(contexts.flatMap((context) => context?.watchRoots ?? []))),
  };
}

export function collectScenarioDependencies(scenarios: unknown): {
  dependencies: string[];
  watchRoots: string[];
} {
  const dependencies = new Set<string>();
  const watchRoots = new Set<string>();
  const add = (context: ScenarioSourceContext | undefined) => {
    context?.dependencies?.forEach((dependency) => dependencies.add(dependency));
    context?.watchRoots?.forEach((watchRoot) => watchRoots.add(watchRoot));
  };

  if (Array.isArray(scenarios)) {
    for (const scenario of scenarios) {
      if (!isRecord(scenario)) {
        continue;
      }
      add(getScenarioSourceContext(scenario));
      for (const row of [
        ...(Array.isArray(scenario.config) ? scenario.config : []),
        ...(Array.isArray(scenario.tests) ? scenario.tests : []),
      ]) {
        if (isRecord(row)) {
          add(getScenarioTestSourceContext(row));
        }
      }
    }
  }
  return { dependencies: [...dependencies], watchRoots: [...watchRoots] };
}
