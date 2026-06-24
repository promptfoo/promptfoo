import * as fs from 'fs';
import * as path from 'path';

import { escape as escapeGlob, globSync, hasMagic } from 'glob';
import { z } from 'zod';
import logger from '../../logger';
import { isScenarioConfigValuesRef, TestCaseSchema } from '../../types/index';
import {
  getNunjucksEngineForFilePath,
  maybeLoadConfigFromExternalFile,
  maybeLoadFromExternalFile,
  renderEnvOnlyInStringForFilePath,
} from '../file';
import { normalizeFilePath, parseFileUrl } from '../functions/loadFunction';
import { ConfigResolutionError } from './errors';

import type {
  EnvOverrides,
  Scenario,
  ScenarioConfigValuesRef,
  TestSuite,
  TestSuiteConfig,
} from '../../types/index';

const FILE_REF_PREFIX = 'file://';
const GLOB_OPTIONS = { windowsPathsNoEscape: process.platform === 'win32' };

const TEST_CASE_FIELD_NAMES = new Set(Object.keys(TestCaseSchema.shape));
const MATRIX_ROW_SCHEMA = TestCaseSchema.partial().catchall(z.unknown());
const MAX_DIAGNOSTIC_KEYS = 8;
const MAX_DIAGNOSTIC_KEY_LENGTH = 64;

interface DiagnosticKeySummary {
  keys: string[];
  omitted: number;
}

type ScenarioInput = Exclude<NonNullable<TestSuiteConfig['scenarios']>[number], string>;

interface ScenarioConfigSourceContext {
  basePath: string;
  envOverrides?: EnvOverrides;
}

const scenarioConfigSourceContexts = new WeakMap<object, ScenarioConfigSourceContext>();
const scenarioSourceContexts = new WeakMap<object, ScenarioConfigSourceContext>();

export function getScenarioSourceContext(
  scenario: object,
): ScenarioConfigSourceContext | undefined {
  return scenarioSourceContexts.get(scenario);
}

export function transferScenarioSourceContext<T extends object>(source: object, target: T): T {
  const sourceContext = scenarioSourceContexts.get(source);
  if (sourceContext) {
    scenarioSourceContexts.set(target, sourceContext);
  }
  return target;
}

function createDiagnosticKeySummary(): DiagnosticKeySummary {
  return { keys: [], omitted: 0 };
}

function addDiagnosticKey(summary: DiagnosticKeySummary, key: string): void {
  if (summary.keys.includes(key)) {
    return;
  }
  if (summary.keys.length >= MAX_DIAGNOSTIC_KEYS) {
    summary.omitted++;
    return;
  }
  summary.keys.push(key);
}

function formatDiagnosticKey(key: string): string {
  const sanitized = key.replace(/[\u0000-\u001f\u007f]/g, '?');
  return sanitized.length > MAX_DIAGNOSTIC_KEY_LENGTH
    ? `${sanitized.slice(0, MAX_DIAGNOSTIC_KEY_LENGTH)}...`
    : sanitized;
}

function formatKeySummary(summary: DiagnosticKeySummary): string {
  const formatted = summary.keys.map(formatDiagnosticKey).join(', ');
  return summary.omitted > 0 ? `${formatted}, +${summary.omitted} more` : formatted;
}

function summarizeKeys(keys: Iterable<string>): DiagnosticKeySummary {
  const summary = createDiagnosticKeySummary();
  for (const key of keys) {
    addDiagnosticKey(summary, key);
  }
  return summary;
}

function fileRefToPath(fileRef: string): string {
  return normalizeFilePath(fileRef.slice(FILE_REF_PREFIX.length));
}

function escapeExistingDirectoryPrefix(pattern: string): string {
  const { root } = path.parse(pattern);
  const parts = pattern.slice(root.length).split(path.sep).filter(Boolean);
  let literalPrefix = root;
  let consumedParts = 0;

  for (const part of parts) {
    const candidate = path.join(literalPrefix, part);
    if (!fs.statSync(candidate, { throwIfNoEntry: false })?.isDirectory()) {
      break;
    }
    literalPrefix = candidate;
    consumedParts++;
  }

  if (consumedParts === 0) {
    return pattern;
  }
  return path.join(escapeGlob(literalPrefix, GLOB_OPTIONS), ...parts.slice(consumedParts));
}

function resolvePathFromBase(basePath: string, rawPath: string): string {
  const literalPath = path.isAbsolute(rawPath) ? rawPath : path.resolve(basePath, rawPath);
  if (fs.statSync(literalPath, { throwIfNoEntry: false })?.isFile()) {
    return literalPath;
  }
  if (hasMagic(rawPath, GLOB_OPTIONS)) {
    // Escape the longest directory prefix that exists literally, preserving
    // only the unresolved suffix as a pattern. This handles both relative and
    // absolute globs beneath directories whose names contain glob characters.
    return escapeExistingDirectoryPrefix(literalPath);
  }
  return literalPath;
}

export function resolveFileRefFromBase(
  basePath: string,
  fileRef: string,
  envOverrides?: EnvOverrides,
): string {
  if (!fileRef.startsWith(FILE_REF_PREFIX)) {
    return fileRef;
  }

  const renderedFileRef = fileRef.includes('{')
    ? getNunjucksEngineForFilePath(envOverrides).renderString(fileRef, {})
    : fileRef;
  const { filePath, functionName } = parseFileUrl(renderedFileRef);
  const resolvedPath = resolvePathFromBase(basePath, filePath);
  return `${FILE_REF_PREFIX}${resolvedPath}${functionName ? `:${functionName}` : ''}`;
}

/**
 * Resolve file refs in a scenario's config rows against the directory of the
 * file that declared them, so later expansion is location-independent.
 */
export function resolveScenarioConfigValuesRefs(
  basePath: string,
  scenario: ScenarioInput,
  envOverrides?: EnvOverrides,
): ScenarioInput {
  if (!Array.isArray(scenario.config)) {
    return scenario;
  }

  return {
    ...scenario,
    config: scenario.config.map((entry) => {
      if (!isScenarioConfigValuesRef(entry)) {
        return resolveScenarioConfigRowProviders(basePath, entry, envOverrides);
      }
      const resolved = {
        ...entry,
        $values: resolveFileRefFromBase(basePath, entry.$values, envOverrides),
      };
      scenarioConfigSourceContexts.set(
        resolved,
        scenarioConfigSourceContexts.get(entry) ?? { basePath, envOverrides },
      );
      return resolved;
    }),
  };
}

function resolveScenarioTestsRefs(
  basePath: string,
  scenario: ScenarioInput,
  envOverrides?: EnvOverrides,
): ScenarioInput {
  const tests = (scenario as { tests?: unknown }).tests;
  const resolveTestRef = (test: unknown): unknown => {
    if (typeof test === 'string') {
      return resolveFileRefFromBase(basePath, test, envOverrides);
    }
    if (!test || typeof test !== 'object' || Array.isArray(test)) {
      return test;
    }
    const record = test as Record<string, unknown>;
    const generatorPath = typeof record.path === 'string' ? record.path : undefined;
    const isGenerator = generatorPath !== undefined;
    const prototype = Object.getPrototypeOf(test);
    if (!isGenerator && prototype !== Object.prototype && prototype !== null) {
      return test;
    }

    const resolved: Record<string, unknown> = { ...record };
    if (generatorPath !== undefined) {
      resolved.path = resolveFileRefFromBase(basePath, generatorPath, envOverrides);
      if (record.config !== undefined) {
        resolved.config = resolveNestedFileRefs(basePath, record.config, envOverrides);
      }
    }
    if (typeof record.vars === 'string' || Array.isArray(record.vars)) {
      resolved.vars = Array.isArray(record.vars)
        ? record.vars.map((varsRef) => resolveScenarioVarsRef(basePath, varsRef, envOverrides))
        : resolveScenarioVarsRef(basePath, record.vars, envOverrides);
    }
    return resolveScenarioConfigRowProviders(basePath, resolved, envOverrides);
  };

  if (tests === undefined || tests === null) {
    return scenario;
  }

  return {
    ...scenario,
    tests: Array.isArray(tests) ? tests.map(resolveTestRef) : resolveTestRef(tests),
  } as unknown as ScenarioInput;
}

function resolveScenarioVarsRef(
  basePath: string,
  varsRef: unknown,
  envOverrides?: EnvOverrides,
): unknown {
  if (typeof varsRef !== 'string') {
    return varsRef;
  }
  const hasFilePrefix = varsRef.startsWith(FILE_REF_PREFIX);
  const resolved = resolveFileRefFromBase(
    basePath,
    hasFilePrefix ? varsRef : `${FILE_REF_PREFIX}${varsRef}`,
    envOverrides,
  );
  return resolved.slice(FILE_REF_PREFIX.length);
}

function resolveNestedFileRefs(
  basePath: string,
  value: unknown,
  envOverrides?: EnvOverrides,
  seen = new WeakMap<object, unknown>(),
): unknown {
  if (typeof value === 'string') {
    return resolveFileRefFromBase(basePath, value, envOverrides);
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  const cached = seen.get(value);
  if (cached !== undefined) {
    return cached;
  }
  if (Array.isArray(value)) {
    const resolved: unknown[] = [];
    seen.set(value, resolved);
    for (const item of value) {
      resolved.push(resolveNestedFileRefs(basePath, item, envOverrides, seen));
    }
    return resolved;
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return value;
  }

  const record = value as Record<string, unknown>;
  const hasId = Object.prototype.hasOwnProperty.call(record, 'id');
  const hasCallApi = Object.prototype.hasOwnProperty.call(record, 'callApi');
  if (
    hasId &&
    hasCallApi &&
    typeof record.id === 'function' &&
    typeof record.callApi === 'function'
  ) {
    return value;
  }

  const resolved: Record<string, unknown> = {};
  seen.set(value, resolved);
  for (const [key, nested] of Object.entries(value)) {
    const resolvedValue = resolveNestedFileRefs(basePath, nested, envOverrides, seen);
    defineRecordProperty(resolved, key, resolvedValue);
  }
  return resolved;
}

function defineRecordProperty(record: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(record, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  });
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isLiveProvider(value: Record<string, unknown>): boolean {
  return (
    Object.prototype.hasOwnProperty.call(value, 'id') &&
    Object.prototype.hasOwnProperty.call(value, 'callApi') &&
    typeof value.id === 'function' &&
    typeof value.callApi === 'function'
  );
}

function renderSourceEnvTemplates<T>(
  value: T,
  envOverrides?: EnvOverrides,
  seen = new WeakMap<object, unknown>(),
): T {
  if (typeof value === 'string') {
    return renderEnvOnlyInStringForFilePath(value, envOverrides) as T;
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  const cached = seen.get(value);
  if (cached !== undefined) {
    return cached as T;
  }
  if (Array.isArray(value)) {
    const rendered: unknown[] = [];
    seen.set(value, rendered);
    let changed = false;
    for (const item of value) {
      const renderedItem = renderSourceEnvTemplates(item, envOverrides, seen);
      changed ||= renderedItem !== item;
      rendered.push(renderedItem);
    }
    return (changed ? rendered : value) as T;
  }
  if (!isPlainRecord(value)) {
    return value;
  }

  const record = value as Record<string, unknown>;
  if (isLiveProvider(record)) {
    return value;
  }

  const rendered: Record<string, unknown> = {};
  seen.set(value, rendered);
  let changed = false;
  for (const [key, nested] of Object.entries(record)) {
    const renderedValue = renderSourceEnvTemplates(nested, envOverrides, seen);
    changed ||= renderedValue !== nested;
    defineRecordProperty(rendered, key, renderedValue);
  }
  return (changed ? rendered : value) as T;
}

function resolveScenarioProviderRef(
  basePath: string,
  provider: unknown,
  envOverrides?: EnvOverrides,
): unknown {
  if (typeof provider === 'string') {
    return resolveFileRefFromBase(
      basePath,
      renderSourceEnvTemplates(provider, envOverrides),
      envOverrides,
    );
  }
  if (!isPlainRecord(provider)) {
    return provider;
  }

  const record = provider;
  const hasId = Object.prototype.hasOwnProperty.call(record, 'id');
  const hasCallApi = Object.prototype.hasOwnProperty.call(record, 'callApi');
  const providerId = hasId ? record.id : undefined;
  if (hasCallApi && typeof providerId === 'function' && typeof record.callApi === 'function') {
    return provider;
  }
  if (typeof providerId === 'string') {
    const renderedRecord = renderSourceEnvTemplates(record, envOverrides);
    return resolveNestedFileRefs(basePath, renderedRecord, envOverrides);
  }

  let resolved: Record<string, unknown> | undefined;
  for (const [key, value] of Object.entries(record)) {
    const renderedKey = renderSourceEnvTemplates(key, envOverrides);
    const renderedValue = renderSourceEnvTemplates(value, envOverrides);
    const resolvedKey = resolveFileRefFromBase(basePath, renderedKey, envOverrides);
    const resolvedValue = resolveNestedFileRefs(basePath, renderedValue, envOverrides);
    if (resolvedKey !== key || resolvedValue !== value) {
      resolved ??= { ...record };
      delete resolved[key];
      defineRecordProperty(resolved, resolvedKey, resolvedValue);
    }
  }
  return resolved ?? provider;
}

function resolveScenarioAssertionProviderRefs(
  basePath: string,
  value: unknown,
  envOverrides?: EnvOverrides,
  seen = new WeakMap<object, unknown>(),
): unknown {
  if (!Array.isArray(value)) {
    return value;
  }
  const cached = seen.get(value);
  if (cached !== undefined) {
    return cached;
  }
  const resolved: unknown[] = [];
  seen.set(value, resolved);
  let changed = false;
  for (const assertion of value) {
    if (!isPlainRecord(assertion)) {
      resolved.push(assertion);
      continue;
    }
    const cachedAssertion = seen.get(assertion);
    if (cachedAssertion !== undefined) {
      changed ||= cachedAssertion !== assertion;
      resolved.push(cachedAssertion);
      continue;
    }
    const provisional = { ...assertion };
    seen.set(assertion, provisional);
    const hasProvider = Object.prototype.hasOwnProperty.call(assertion, 'provider');
    const originalProvider = hasProvider ? assertion.provider : undefined;
    const provider = hasProvider
      ? resolveScenarioProviderRef(basePath, originalProvider, envOverrides)
      : undefined;
    const hasNestedAssertions = Object.prototype.hasOwnProperty.call(assertion, 'assert');
    const originalNestedAssertions = hasNestedAssertions ? assertion.assert : undefined;
    const nestedAssertions = hasNestedAssertions
      ? resolveScenarioAssertionProviderRefs(basePath, originalNestedAssertions, envOverrides, seen)
      : undefined;
    let resolvedAssertion = assertion;
    if (provider !== originalProvider || nestedAssertions !== originalNestedAssertions) {
      resolvedAssertion = provisional;
      if (provider !== originalProvider) {
        resolvedAssertion.provider = provider;
      }
      if (nestedAssertions !== originalNestedAssertions) {
        resolvedAssertion.assert = nestedAssertions;
      }
    } else {
      seen.set(assertion, assertion);
    }
    changed ||= resolvedAssertion !== assertion;
    resolved.push(resolvedAssertion);
  }
  return changed ? resolved : value;
}

function resolveScenarioConfigRowProviders(
  basePath: string,
  row: unknown,
  envOverrides?: EnvOverrides,
): Scenario['config'][number] {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    return row as Scenario['config'][number];
  }
  const record = row as Record<string, unknown>;
  const hasProvider = Object.prototype.hasOwnProperty.call(record, 'provider');
  const originalProvider = hasProvider ? record.provider : undefined;
  const provider = hasProvider
    ? resolveScenarioProviderRef(basePath, originalProvider, envOverrides)
    : undefined;

  const hasOptions = Object.prototype.hasOwnProperty.call(record, 'options');
  const options = hasOptions ? record.options : undefined;
  let resolvedOptions = options;
  if (isPlainRecord(options)) {
    const hasOptionsProvider = Object.prototype.hasOwnProperty.call(options, 'provider');
    const originalOptionsProvider = hasOptionsProvider ? options.provider : undefined;
    const optionsProvider = hasOptionsProvider
      ? resolveScenarioProviderRef(basePath, originalOptionsProvider, envOverrides)
      : undefined;
    if (optionsProvider !== originalOptionsProvider) {
      resolvedOptions = { ...options, provider: optionsProvider };
    }
  }

  const hasAssertions = Object.prototype.hasOwnProperty.call(record, 'assert');
  const originalAssertions = hasAssertions ? record.assert : undefined;
  const assertions = hasAssertions
    ? resolveScenarioAssertionProviderRefs(basePath, originalAssertions, envOverrides)
    : undefined;

  if (
    provider === originalProvider &&
    resolvedOptions === options &&
    assertions === originalAssertions
  ) {
    return row as Scenario['config'][number];
  }
  const resolved = { ...record };
  if (provider !== originalProvider) {
    resolved.provider = provider;
  }
  if (resolvedOptions !== options) {
    resolved.options = resolvedOptions;
  }
  if (assertions !== originalAssertions) {
    resolved.assert = assertions;
  }
  return resolved as Scenario['config'][number];
}

export function resolveScenarioTestCaseProviderRefs<T>(
  basePath: string,
  testCase: T,
  envOverrides?: EnvOverrides,
): T {
  return resolveScenarioConfigRowProviders(basePath, testCase, envOverrides) as T;
}

function materializeScenarioConfigRow(
  basePath: string,
  row: unknown,
  envOverrides?: EnvOverrides,
): Scenario['config'][number] {
  const resolvedFileRefs = resolveNestedFileRefs(basePath, row, envOverrides);
  const loadedFileRefs = maybeLoadConfigFromExternalFile(resolvedFileRefs, 'scenario-test');
  return resolveScenarioConfigRowProviders(basePath, loadedFileRefs, envOverrides);
}

export function resolveScenarioFileRefs(
  basePath: string,
  scenario: ScenarioInput,
  envOverrides?: EnvOverrides,
): ScenarioInput {
  const sourceContext = scenarioSourceContexts.get(scenario) ?? { basePath, envOverrides };
  const resolved = resolveScenarioTestsRefs(
    sourceContext.basePath,
    resolveScenarioConfigValuesRefs(sourceContext.basePath, scenario, sourceContext.envOverrides),
    sourceContext.envOverrides,
  );
  scenarioSourceContexts.set(resolved, sourceContext);
  return resolved;
}

function getFilePaths(
  basePath: string,
  fileRef: string,
  envOverrides?: EnvOverrides,
): { paths: string[]; fromGlob: boolean } {
  const renderedFileRef = getNunjucksEngineForFilePath(envOverrides).renderString(fileRef, {});
  const rawPath = fileRefToPath(renderedFileRef);
  const resolvedPath = resolvePathFromBase(basePath, rawPath);
  if (fs.statSync(resolvedPath, { throwIfNoEntry: false })?.isFile()) {
    return { paths: [resolvedPath], fromGlob: false };
  }

  // Detect glob magic on the raw ref, not the resolved path, so directories whose
  // names contain glob metacharacters do not turn plain refs into patterns.
  if (!hasMagic(rawPath, GLOB_OPTIONS)) {
    return { paths: [resolvedPath], fromGlob: false };
  }

  const matchedFiles = globSync(resolvedPath, GLOB_OPTIONS);
  if (matchedFiles.length === 0) {
    throw new ConfigResolutionError(`No files found matching pattern: ${resolvedPath}`);
  }
  return { paths: matchedFiles, fromGlob: true };
}

function getScenarioFilePaths(
  basePath: string,
  fileRef: string,
  envOverrides?: EnvOverrides,
): string[] {
  if (!fileRef.startsWith(FILE_REF_PREFIX)) {
    throw new ConfigResolutionError(
      `Scenario "${fileRef}" is not valid: scenarios must be objects or file:// references`,
    );
  }
  return getFilePaths(basePath, fileRef, envOverrides).paths;
}

/**
 * Materialize the `scenarios` config value into Scenario objects: file:// refs
 * (including globs) are loaded, and `$values` refs inside each scenario are
 * resolved against the directory of the file that declared them.
 */
export async function loadScenarioConfigs(
  scenarios: TestSuiteConfig['scenarios'] | TestSuite['scenarios'] | undefined,
  basePath = process.cwd(),
  envOverrides?: EnvOverrides,
): Promise<ScenarioInput[] | undefined> {
  if (!scenarios) {
    return undefined;
  }

  const scenarioInputs = Array.isArray(scenarios) ? scenarios : [scenarios];
  const loadedScenarios: ScenarioInput[] = [];
  for (const scenario of scenarioInputs) {
    if (typeof scenario !== 'string') {
      loadedScenarios.push(resolveScenarioFileRefs(basePath, scenario, envOverrides));
      continue;
    }

    for (const scenarioFilePath of getScenarioFilePaths(basePath, scenario, envOverrides)) {
      const scenarioBasePath = path.dirname(scenarioFilePath);
      // Ref is already absolute, so the loader does not re-resolve it against
      // cliState.basePath.
      const loaded = await maybeLoadFromExternalFile(
        `${FILE_REF_PREFIX}${scenarioFilePath}`,
        undefined,
        envOverrides,
      );
      const scenarioEntries = Array.isArray(loaded) ? loaded.flat() : [loaded];
      if (loaded === null || loaded === undefined || scenarioEntries.length === 0) {
        throw new ConfigResolutionError(
          `Scenario file contributed no scenarios: ${scenarioFilePath}`,
        );
      }
      for (const entry of scenarioEntries) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
          throw new ConfigResolutionError(
            `Scenario file ${scenarioFilePath} must contain scenario objects; got ${describeValue(entry)}`,
          );
        }
        loadedScenarios.push(
          resolveScenarioFileRefs(scenarioBasePath, entry as ScenarioInput, envOverrides),
        );
      }
    }
  }

  return loadedScenarios;
}

function describeValue(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return `array(length=${value.length})`;
  }
  if (typeof value === 'object') {
    try {
      const keys = Object.keys(value);
      return keys.length === 0
        ? 'empty object'
        : `object with keys [${formatKeySummary(summarizeKeys(keys))}]`;
    } catch {
      return 'object';
    }
  }
  return typeof value;
}

function assertValidValuesRef(entry: object, sourceDescription: string): ScenarioConfigValuesRef {
  if ('$expand' in entry) {
    throw new ConfigResolutionError(
      `Scenario config rows do not support $expand; use $values (${sourceDescription})`,
    );
  }
  const keys = Object.keys(entry);
  if (keys.length > 1) {
    throw new ConfigResolutionError(
      `A scenario config $values entry must have $values as its only key, e.g. { $values: "file://matrix.yaml" }; got keys [${formatKeySummary(summarizeKeys(keys))}] (${sourceDescription})`,
    );
  }
  const ref = (entry as { $values: unknown }).$values;
  if (typeof ref !== 'string' || !ref.startsWith(FILE_REF_PREFIX)) {
    throw new ConfigResolutionError(
      `Scenario config $values must be a file:// reference; got ${describeValue(ref)} (${sourceDescription})`,
    );
  }
  return entry as ScenarioConfigValuesRef;
}

function validateMatrixRows(rows: unknown[], sourceRef: string): void {
  const unrecognizedKeys = createDiagnosticKeySummary();
  for (const [rowIndex, row] of rows.entries()) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new ConfigResolutionError(
        `Scenario config $values row ${rowIndex + 1} must be an object (partial test case); got ${describeValue(row)} in ${sourceRef}`,
      );
    }
    if ('$values' in row || '$expand' in row) {
      throw new ConfigResolutionError(
        `Nested $values references are not supported; found one in row ${rowIndex + 1} of ${sourceRef}`,
      );
    }
    const keys = Object.keys(row);
    if (keys.length > 0 && !keys.some((key) => TEST_CASE_FIELD_NAMES.has(key))) {
      // A row with nothing the evaluator understands silently produces a test with
      // no vars/asserts — the classic flat-CSV mistake. Fail instead.
      throw new ConfigResolutionError(
        `Scenario config row from ${sourceRef} has no recognized test case fields (e.g. vars, assert); got keys [${formatKeySummary(summarizeKeys(keys))}]. Did you mean to nest them under "vars"?`,
      );
    }
    for (const key of keys) {
      if (!TEST_CASE_FIELD_NAMES.has(key)) {
        addDiagnosticKey(unrecognizedKeys, key);
      }
    }

    const validationResult = MATRIX_ROW_SCHEMA.safeParse(row);
    if (!validationResult.success) {
      const invalidFields = createDiagnosticKeySummary();
      for (const issue of validationResult.error.issues) {
        // Only name the top-level schema field. Nested keys are user data and
        // may contain secrets; they also make diagnostics attacker-sized.
        addDiagnosticKey(invalidFields, issue.path.length > 0 ? String(issue.path[0]) : '<row>');
      }
      throw new ConfigResolutionError(
        `Scenario config row ${rowIndex + 1} from ${sourceRef} has invalid test case field values at [${formatKeySummary(invalidFields)}]`,
      );
    }
  }
  if (unrecognizedKeys.keys.length > 0) {
    logger.warn(
      `Scenario config rows from ${sourceRef} contain unrecognized test case fields [${formatKeySummary(unrecognizedKeys)}]; these are kept but have no effect. Known fields include vars, assert, options, metadata.`,
    );
  }
}

async function loadScenarioMatrixFile(
  concreteRef: string,
  valuesFilePath: string,
  fromGlob: boolean,
  envOverrides?: EnvOverrides,
): Promise<unknown> {
  try {
    return await maybeLoadFromExternalFile(concreteRef, undefined, envOverrides);
  } catch (error) {
    if (fromGlob && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      logger.debug(`File disappeared during scenario matrix glob expansion: ${valuesFilePath}`);
      return undefined;
    }
    throw error;
  }
}

/**
 * Expand `$values` matrix-file refs in a scenario's config rows into the rows
 * those files contain. Inline rows pass through unchanged. Every loaded row is
 * validated so malformed matrix files fail here instead of corrupting the eval.
 *
 * Accepts unvalidated input: callers feed it config shapes the schema only
 * warns about (the CLI loader is lenient), so defenses here are load-bearing.
 */
export async function expandScenarioConfigValues(
  config: unknown,
  basePath = process.cwd(),
  envOverrides?: EnvOverrides,
): Promise<Scenario['config']> {
  if (typeof config === 'string') {
    throw new ConfigResolutionError(
      'Scenario config must be an array; to load rows from a file use config: [{ $values: "file://matrix.yaml" }]',
    );
  }
  if (!Array.isArray(config)) {
    throw new ConfigResolutionError(
      `Scenario config must be an array; got ${describeValue(config)}`,
    );
  }

  const expandedConfig: Scenario['config'] = [];

  for (const [entryIndex, entry] of config.entries()) {
    const isRefLike =
      entry !== null &&
      typeof entry === 'object' &&
      !Array.isArray(entry) &&
      ('$values' in entry || '$expand' in entry);
    if (!isRefLike) {
      expandedConfig.push(resolveScenarioConfigRowProviders(basePath, entry, envOverrides));
      continue;
    }

    const ref = assertValidValuesRef(entry, `scenario config entry ${entryIndex + 1}`);
    const sourceContext = scenarioConfigSourceContexts.get(ref) ?? { basePath, envOverrides };
    const valuesRef = resolveFileRefFromBase(
      sourceContext.basePath,
      ref.$values,
      sourceContext.envOverrides,
    );
    const expansionStart = expandedConfig.length;
    let sawLoadedValue = false;
    const { paths: valuesFilePaths, fromGlob } = getFilePaths(
      sourceContext.basePath,
      valuesRef,
      sourceContext.envOverrides,
    );
    for (const valuesFilePath of valuesFilePaths) {
      const concreteRef = `${FILE_REF_PREFIX}${valuesFilePath}`;
      const loadedValues = await loadScenarioMatrixFile(
        concreteRef,
        valuesFilePath,
        fromGlob,
        sourceContext.envOverrides,
      );
      if (loadedValues === null || loadedValues === undefined) {
        continue;
      }
      sawLoadedValue = true;

      const rows: unknown[] = Array.isArray(loadedValues) ? loadedValues.flat() : [loadedValues];
      if (rows.length === 0) {
        continue;
      }
      validateMatrixRows(rows, concreteRef);
      for (const row of rows) {
        expandedConfig.push(
          materializeScenarioConfigRow(
            path.dirname(valuesFilePath),
            row,
            sourceContext.envOverrides,
          ),
        );
      }
    }
    if (expandedConfig.length === expansionStart) {
      throw new ConfigResolutionError(
        sawLoadedValue
          ? `Scenario config $values file contributed no rows: ${valuesRef}`
          : `Scenario config $values file is empty: ${valuesRef}`,
      );
    }
  }

  return expandedConfig;
}
