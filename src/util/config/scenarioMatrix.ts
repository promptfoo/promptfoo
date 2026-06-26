import * as fs from 'fs';
import * as path from 'path';

import { globSync, hasMagic } from 'glob';
import { z } from 'zod';
import logger from '../../logger';
import { isScenarioConfigValuesRef, TestCaseSchema } from '../../types/index';
import {
  maybeLoadConfigFromExternalFile,
  maybeLoadFromExternalFile,
  renderEnvOnlyInStringForFilePath,
} from '../file';
import { isJavascriptFile } from '../fileExtensions';
import { isProviderTypeMap } from '../gradingProvider';
import { escapeExistingDirectoryPrefix, GLOB_OPTIONS } from '../pathUtils';
import { ConfigResolutionError } from './errors';
import {
  getScenarioConfigSourceContext,
  getScenarioDependencyContext,
  getScenarioOriginalValue,
  getScenarioSourceContext,
  getScenarioTestSourceContext,
  restoreScenarioSourceContext,
  restoreScenarioTestSourceContext,
  setScenarioConfigSourceContext,
  setScenarioOriginalValue,
  setScenarioSourceContext,
  setScenarioTestSourceContext,
} from './scenarioContext';

import type {
  EnvOverrides,
  Scenario,
  ScenarioConfigValuesRef,
  TestSuite,
  TestSuiteConfig,
} from '../../types/index';

const FILE_REF_PREFIX = 'file://';
const WIN32_DRIVE_PREFIX = /^\/[A-Za-z]:[\\/]/;

const TEST_CASE_FIELD_NAMES = new Set(Object.keys(TestCaseSchema.shape));
const MATRIX_ROW_SCHEMA = TestCaseSchema.partial().catchall(z.unknown());
const MAX_DIAGNOSTIC_KEYS = 8;
const MAX_DIAGNOSTIC_KEY_LENGTH = 64;
const MAX_SCENARIO_VALUE_DEPTH = 100;
const MAX_SOURCE_REF_LENGTH = 512;

interface DiagnosticKeySummary {
  keys: string[];
  omitted: number;
}

function normalizeFilePath(filePath: string): string {
  return process.platform === 'win32' && WIN32_DRIVE_PREFIX.test(filePath)
    ? filePath.slice(1)
    : filePath;
}

function parseFileUrl(fileUrl: string): { filePath: string; functionName?: string } {
  const urlWithoutProtocol = fileUrl.slice(FILE_REF_PREFIX.length);
  const lastColonIndex = urlWithoutProtocol.lastIndexOf(':');
  if (lastColonIndex > 1) {
    const candidateFilePath = urlWithoutProtocol.slice(0, lastColonIndex);
    if (isJavascriptFile(candidateFilePath) || candidateFilePath.endsWith('.py')) {
      return {
        filePath: normalizeFilePath(candidateFilePath),
        functionName: urlWithoutProtocol.slice(lastColonIndex + 1),
      };
    }
  }
  return { filePath: normalizeFilePath(urlWithoutProtocol) };
}

type ScenarioInput = Exclude<NonNullable<TestSuiteConfig['scenarios']>[number], string>;

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

function formatSourceRef(sourceRef: string): string {
  const sanitized = sourceRef.replace(/[\u0000-\u001f\u007f]/g, '?');
  return sanitized.length > MAX_SOURCE_REF_LENGTH
    ? `${sanitized.slice(0, MAX_SOURCE_REF_LENGTH)}...`
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
  if (typeof fileRef !== 'string' || !fileRef.startsWith(FILE_REF_PREFIX)) {
    return fileRef;
  }

  const renderedFileRef = renderEnvOnlyInStringForFilePath(fileRef, envOverrides);
  const { filePath, functionName } = parseFileUrl(renderedFileRef);
  const resolvedPath = resolvePathFromBase(basePath, filePath);
  return `${FILE_REF_PREFIX}${resolvedPath}${functionName ? `:${functionName}` : ''}`;
}

function isBareLocalProviderPath(providerPath: string): boolean {
  const hasNonFileScheme =
    /^[a-z][a-z0-9+.-]*:/i.test(providerPath) && !/^[a-z]:[\\/]/i.test(providerPath);
  return (
    !providerPath.startsWith(FILE_REF_PREFIX) && !hasNonFileScheme && isJavascriptFile(providerPath)
  );
}

function resolveProviderPathFromBase(basePath: string, providerPath: string): string {
  return path.isAbsolute(providerPath) ? providerPath : path.resolve(basePath, providerPath);
}

function splitScriptPathAndFunctionName(
  scriptPath: string,
  extensions: string[],
): { scriptPath: string; functionName?: string } {
  const lastColonIndex = scriptPath.lastIndexOf(':');
  if (lastColonIndex <= 1) {
    return { scriptPath };
  }
  const pathWithoutFunction = scriptPath.slice(0, lastColonIndex);
  if (extensions.some((extension) => pathWithoutFunction.endsWith(extension))) {
    return {
      scriptPath: pathWithoutFunction,
      functionName: scriptPath.slice(lastColonIndex + 1),
    };
  }
  return { scriptPath };
}

function isLocalScriptPath(scriptPath: string, extensions: string[]): boolean {
  return (
    path.isAbsolute(scriptPath) ||
    /^\.{1,2}[\\/]/.test(scriptPath) ||
    scriptPath.includes('/') ||
    scriptPath.includes('\\') ||
    extensions.some((extension) => scriptPath.endsWith(extension))
  );
}

function resolveScriptProviderIdFromBase(
  basePath: string,
  providerId: string,
  prefix: string,
  extensions: string[],
): string {
  const scriptRef = providerId.slice(prefix.length);
  const { scriptPath, functionName } = splitScriptPathAndFunctionName(scriptRef, extensions);
  if (!isLocalScriptPath(scriptPath, extensions)) {
    return providerId;
  }
  const resolvedScriptPath = resolveProviderPathFromBase(basePath, scriptPath);
  return `${prefix}${resolvedScriptPath}${functionName ? `:${functionName}` : ''}`;
}

interface ExecPart {
  end: number;
  raw: string;
  start: number;
  value: string;
}

function parseExecParts(command: string): ExecPart[] {
  const parts: ExecPart[] = [];
  const scriptPartsRegex = /[^\s"']+|"([^"]*)"|'([^']*)'/g;
  let match: RegExpExecArray | null;
  while ((match = scriptPartsRegex.exec(command)) !== null) {
    parts.push({
      end: match.index + match[0].length,
      raw: match[0],
      start: match.index,
      value: match[1] ?? match[2] ?? match[0],
    });
  }
  return parts;
}

function quoteResolvedExecPart(value: string, originalRaw: string): string {
  const originalQuote =
    originalRaw.length >= 2 &&
    originalRaw[0] === originalRaw[originalRaw.length - 1] &&
    (originalRaw[0] === '"' || originalRaw[0] === "'")
      ? originalRaw[0]
      : undefined;
  if (originalQuote && !value.includes(originalQuote)) {
    return `${originalQuote}${value}${originalQuote}`;
  }
  if (!/\s/.test(value)) {
    return value;
  }
  return JSON.stringify(value);
}

function isUrlLikeExecPart(part: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(part);
}

function isFileLookingExecPart(part: string): boolean {
  return /\.(?:[cm]?[jt]s|py|rb|go|sh|bash|zsh|fish|cmd|bat|ps1)$/i.test(part);
}

function isLocalExecPart(part: string): boolean {
  return (
    !part.startsWith('-') &&
    !isUrlLikeExecPart(part) &&
    (path.isAbsolute(part) || /^\.{1,2}[\\/]/.test(part) || isFileLookingExecPart(part))
  );
}

function resolveExecProviderIdFromBase(basePath: string, providerId: string): string {
  const prefix = 'exec:';
  const command = providerId.slice(prefix.length).trimStart();
  const leadingWhitespace = providerId.slice(prefix.length, providerId.length - command.length);
  const parts = parseExecParts(command);
  if (parts.length === 0) {
    return providerId;
  }
  const replacements = parts
    .map((part) => ({
      ...part,
      resolved: isLocalExecPart(part.value)
        ? resolveProviderPathFromBase(basePath, part.value)
        : part.value,
    }))
    .filter((part) => part.resolved !== part.value);
  if (replacements.length === 0) {
    return providerId;
  }
  let resolvedCommand = command;
  for (const part of replacements.reverse()) {
    resolvedCommand = `${resolvedCommand.slice(0, part.start)}${quoteResolvedExecPart(part.resolved, part.raw)}${resolvedCommand.slice(part.end)}`;
  }
  return `${prefix}${leadingWhitespace}${resolvedCommand}`;
}

function resolvePrefixedProviderIdFromBase(basePath: string, providerId: string): string {
  if (providerId.startsWith('exec:')) {
    return resolveExecProviderIdFromBase(basePath, providerId);
  }
  if (providerId.startsWith('python:')) {
    return resolveScriptProviderIdFromBase(basePath, providerId, 'python:', ['.py']);
  }
  if (providerId.startsWith('golang:')) {
    return resolveScriptProviderIdFromBase(basePath, providerId, 'golang:', ['.go']);
  }
  if (providerId.startsWith('ruby:')) {
    return resolveScriptProviderIdFromBase(basePath, providerId, 'ruby:', ['.rb']);
  }
  return providerId;
}

function resolveProviderIdFromBase(
  basePath: string,
  providerId: string,
  envOverrides?: EnvOverrides,
): string {
  if (providerId.startsWith(FILE_REF_PREFIX)) {
    return resolveFileRefFromBase(basePath, providerId, envOverrides);
  }
  if (isBareLocalProviderPath(providerId)) {
    return resolveProviderPathFromBase(basePath, providerId);
  }
  return resolvePrefixedProviderIdFromBase(basePath, providerId);
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
    config: scenario.config.map((rawEntry) => {
      const entry = isPlainRecord(rawEntry) ? restoreScenarioTestSourceContext(rawEntry) : rawEntry;
      if (!isScenarioConfigValuesRef(entry)) {
        const sourceContext =
          entry && typeof entry === 'object'
            ? (getScenarioTestSourceContext(entry) ?? { basePath, envOverrides })
            : { basePath, envOverrides };
        const resolved = resolveScenarioConfigRowProviders(
          sourceContext.basePath,
          entry,
          sourceContext.envOverrides,
        );
        if (resolved && typeof resolved === 'object') {
          setScenarioOriginalValue(resolved, getScenarioOriginalValue(entry) ?? entry);
          setScenarioTestSourceContext(resolved, sourceContext);
        }
        return resolved;
      }
      const resolved = {
        ...entry,
        $values: resolveFileRefFromBase(basePath, entry.$values, envOverrides),
      };
      setScenarioConfigSourceContext(
        resolved,
        getScenarioConfigSourceContext(entry) ?? { basePath, envOverrides },
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
    const restoredTest = restoreScenarioTestSourceContext(test as Record<string, unknown>);
    const record = restoredTest as Record<string, unknown>;
    const generatorPath = typeof record.path === 'string' ? record.path : undefined;
    const isGenerator = generatorPath !== undefined;
    const prototype = Object.getPrototypeOf(test);
    if (!isGenerator && prototype !== Object.prototype && prototype !== null) {
      return restoredTest;
    }

    if (isGenerator) {
      return materializeScenarioTestSource(basePath, restoredTest, envOverrides);
    }

    const resolved: Record<string, unknown> = { ...record };
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

function assertSafeScenarioValue(value: unknown, sourceDescription: string): void {
  const active = new WeakSet<object>();
  const seen = new WeakSet<object>();
  const stack: Array<{ depth: number; exit?: boolean; value: unknown }> = [{ depth: 0, value }];

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (!current.value || typeof current.value !== 'object') {
      continue;
    }
    const objectValue = current.value as object;
    if (current.exit) {
      active.delete(objectValue);
      continue;
    }
    if (active.has(objectValue)) {
      throw new ConfigResolutionError(`Scenario value contains a cycle (${sourceDescription})`);
    }
    if (seen.has(objectValue)) {
      continue;
    }
    if (current.depth > MAX_SCENARIO_VALUE_DEPTH) {
      throw new ConfigResolutionError(
        `Scenario value exceeds the maximum nesting depth of ${MAX_SCENARIO_VALUE_DEPTH} (${sourceDescription})`,
      );
    }
    if (isPlainRecord(objectValue) && isLiveProvider(objectValue)) {
      continue;
    }
    if (
      isPlainRecord(objectValue) &&
      (isProviderTypeMap(objectValue) ||
        (objectValue.type === 'assert-set' && Array.isArray(objectValue.assert)))
    ) {
      continue;
    }
    const children = Array.isArray(objectValue)
      ? objectValue
      : isPlainRecord(objectValue)
        ? Object.values(objectValue)
        : [];
    active.add(objectValue);
    seen.add(objectValue);
    stack.push({ depth: current.depth, exit: true, value: objectValue });
    for (const child of children) {
      stack.push({ depth: current.depth + 1, value: child });
    }
  }
}

function isLiveProvider(value: Record<string, unknown>): boolean {
  return (
    Object.prototype.hasOwnProperty.call(value, 'id') &&
    Object.prototype.hasOwnProperty.call(value, 'callApi') &&
    typeof value.id === 'function' &&
    typeof value.callApi === 'function'
  );
}

function containsFileRefString(value: unknown, seen = new WeakSet<object>()): boolean {
  if (typeof value === 'string') {
    return value.startsWith(FILE_REF_PREFIX);
  }
  if (!value || typeof value !== 'object') {
    return false;
  }
  if (seen.has(value)) {
    return false;
  }
  seen.add(value);
  if (Array.isArray(value)) {
    return value.some((item) => containsFileRefString(item, seen));
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return false;
  }
  return Object.values(value).some((nested) => containsFileRefString(nested, seen));
}

export function containsScenarioFileRefs(value: unknown): boolean {
  return containsFileRefString(value);
}

export function renderScenarioSourceEnvTemplates<T>(value: T, envOverrides?: EnvOverrides): T {
  return renderSourceEnvTemplates(value, envOverrides);
}

function renderSourceEnvTemplates<T>(
  value: T,
  envOverrides?: EnvOverrides,
  seen = new WeakMap<object, unknown>(),
): T {
  if (typeof value === 'string') {
    return (
      value.includes('{{') ? renderEnvOnlyInStringForFilePath(value, envOverrides) : value
    ) as T;
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
  seen = new WeakMap<object, unknown>(),
): unknown {
  if (typeof provider === 'string') {
    const renderedProvider = renderSourceEnvTemplates(provider, envOverrides);
    return resolveProviderIdFromBase(basePath, renderedProvider, envOverrides);
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
    const resolvedRecord = maybeLoadConfigFromExternalFile(
      renderedRecord,
      'provider',
      envOverrides,
      new WeakMap(),
      basePath,
    );
    if (isPlainRecord(resolvedRecord) && typeof resolvedRecord.id === 'string') {
      const resolvedId = resolveProviderIdFromBase(basePath, resolvedRecord.id, envOverrides);
      if (resolvedId !== resolvedRecord.id) {
        return {
          ...resolvedRecord,
          id: resolvedId,
        };
      }
    }
    return resolvedRecord;
  }

  if (!isProviderTypeMap(record)) {
    const resolvedMap: Record<string, unknown> = {};
    seen.set(record, resolvedMap);
    let mapChanged = false;
    for (const [key, value] of Object.entries(record)) {
      const renderedKey = renderSourceEnvTemplates(key, envOverrides);
      const resolvedKey = resolveProviderIdFromBase(basePath, renderedKey, envOverrides);
      let resolvedValue = value;
      if (isPlainRecord(value) && !isLiveProvider(value)) {
        const renderedValue = renderSourceEnvTemplates(value, envOverrides);
        resolvedValue = maybeLoadConfigFromExternalFile(
          renderedValue,
          'provider',
          envOverrides,
          new WeakMap(),
          basePath,
        );
        if (isPlainRecord(resolvedValue) && typeof resolvedValue.id === 'string') {
          resolvedValue = {
            ...resolvedValue,
            id: resolveProviderIdFromBase(basePath, resolvedValue.id, envOverrides),
          };
        }
      }
      mapChanged ||= resolvedKey !== key || resolvedValue !== value;
      defineRecordProperty(resolvedMap, resolvedKey, resolvedValue);
    }
    if (!mapChanged) {
      seen.set(record, provider);
      return provider;
    }
    return resolvedMap;
  }

  const cached = seen.get(record);
  if (cached !== undefined) {
    return cached;
  }

  const resolved: Record<string, unknown> = {};
  seen.set(record, resolved);
  let changed = false;
  for (const [key, value] of Object.entries(record)) {
    const renderedKey = renderSourceEnvTemplates(key, envOverrides);
    const resolvedKey = resolveProviderIdFromBase(basePath, renderedKey, envOverrides);
    const resolvedValue = resolveScenarioProviderRef(basePath, value, envOverrides, seen);
    if (resolvedKey !== key || resolvedValue !== value) {
      changed = true;
    }
    defineRecordProperty(resolved, resolvedKey, resolvedValue);
  }
  if (!changed) {
    seen.set(record, provider);
  }
  return changed ? resolved : provider;
}

function resolveScenarioScoringFunctionRef(
  basePath: string,
  scoringFunction: unknown,
  envOverrides?: EnvOverrides,
): unknown {
  return typeof scoringFunction === 'string'
    ? resolveFileRefFromBase(basePath, scoringFunction, envOverrides)
    : scoringFunction;
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
  const hasScoringFunction = Object.prototype.hasOwnProperty.call(record, 'assertScoringFunction');
  const originalScoringFunction = hasScoringFunction ? record.assertScoringFunction : undefined;
  const scoringFunction = hasScoringFunction
    ? resolveScenarioScoringFunctionRef(basePath, originalScoringFunction, envOverrides)
    : undefined;
  const hasProvidersFilter = Object.prototype.hasOwnProperty.call(record, 'providers');
  const originalProvidersFilter = hasProvidersFilter ? record.providers : undefined;
  const providersFilter = hasProvidersFilter
    ? renderSourceEnvTemplates(originalProvidersFilter, envOverrides)
    : undefined;
  const hasPromptsFilter = Object.prototype.hasOwnProperty.call(record, 'prompts');
  const originalPromptsFilter = hasPromptsFilter ? record.prompts : undefined;
  const promptsFilter = hasPromptsFilter
    ? renderSourceEnvTemplates(originalPromptsFilter, envOverrides)
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
    scoringFunction === originalScoringFunction &&
    providersFilter === originalProvidersFilter &&
    promptsFilter === originalPromptsFilter &&
    resolvedOptions === options &&
    assertions === originalAssertions
  ) {
    return row as Scenario['config'][number];
  }
  const resolved = { ...record };
  if (provider !== originalProvider) {
    resolved.provider = provider;
  }
  if (scoringFunction !== originalScoringFunction) {
    resolved.assertScoringFunction = scoringFunction;
  }
  if (providersFilter !== originalProvidersFilter) {
    resolved.providers = providersFilter;
  }
  if (promptsFilter !== originalPromptsFilter) {
    resolved.prompts = promptsFilter;
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

export function materializeScenarioTestCase<T>(
  basePath: string,
  testCase: T,
  envOverrides?: EnvOverrides,
): T {
  const rendered = renderSourceEnvTemplates(testCase, envOverrides);
  const materialized = containsFileRefString(rendered)
    ? resolveScenarioConfigRowProviders(
        basePath,
        maybeLoadConfigFromExternalFile(
          rendered,
          'scenario-test',
          envOverrides,
          new WeakMap(),
          basePath,
        ),
        envOverrides,
      )
    : resolveScenarioConfigRowProviders(basePath, rendered, envOverrides);
  const resolved = resolveScenarioTestVarsFileRefs(basePath, materialized, envOverrides) as T;
  if (resolved && typeof resolved === 'object') {
    setScenarioTestSourceContext(resolved, { basePath, envOverrides });
    setScenarioOriginalValue(
      resolved,
      testCase && typeof testCase === 'object'
        ? (getScenarioOriginalValue(testCase) ?? testCase)
        : testCase,
    );
  }
  return resolved;
}

export function materializeScenarioTestSource<T>(
  basePath: string,
  testSource: T,
  envOverrides?: EnvOverrides,
): T {
  if (!testSource || typeof testSource !== 'object' || Array.isArray(testSource)) {
    return testSource;
  }

  const rendered = renderSourceEnvTemplates(testSource, envOverrides) as Record<string, unknown>;
  const resolved: Record<string, unknown> = { ...rendered };
  if (typeof rendered.path === 'string') {
    resolved.path = resolveFileRefFromBase(basePath, rendered.path, envOverrides);
  }
  if (rendered.config !== undefined) {
    resolved.config = maybeLoadConfigFromExternalFile(
      rendered.config,
      'provider',
      envOverrides,
      new WeakMap(),
      basePath,
    );
  }
  return resolveScenarioConfigRowProviders(basePath, resolved, envOverrides) as T;
}

function resolveScenarioTestVarsFileRefs(
  basePath: string,
  testCase: unknown,
  envOverrides?: EnvOverrides,
): unknown {
  if (!isPlainRecord(testCase)) {
    return testCase;
  }
  const vars = testCase.vars;
  const resolveVarRef = (varsRef: unknown) =>
    typeof varsRef === 'string' && varsRef.startsWith(FILE_REF_PREFIX)
      ? resolveScenarioVarsRef(basePath, varsRef, envOverrides)
      : varsRef;
  const resolvedVars = Array.isArray(vars) ? vars.map(resolveVarRef) : resolveVarRef(vars);
  if (resolvedVars === vars) {
    return testCase;
  }
  return {
    ...testCase,
    vars: resolvedVars,
  };
}

function materializeScenarioConfigRow(
  basePath: string,
  row: unknown,
  envOverrides?: EnvOverrides,
  sourceDescription = 'inline scenario config row',
): Scenario['config'][number] {
  assertSafeScenarioValue(row, sourceDescription);
  const rendered = renderSourceEnvTemplates(row, envOverrides);
  const materialized = containsFileRefString(rendered)
    ? resolveScenarioConfigRowProviders(
        basePath,
        maybeLoadConfigFromExternalFile(
          rendered,
          'scenario-test',
          envOverrides,
          new WeakMap(),
          basePath,
        ),
        envOverrides,
      )
    : resolveScenarioConfigRowProviders(basePath, rendered, envOverrides);
  if (materialized && typeof materialized === 'object') {
    setScenarioTestSourceContext(materialized, { basePath, envOverrides });
    setScenarioOriginalValue(
      materialized,
      row && typeof row === 'object' ? (getScenarioOriginalValue(row) ?? row) : row,
    );
  }
  return materialized;
}

export function resolveScenarioFileRefs(
  basePath: string,
  scenario: ScenarioInput,
  envOverrides?: EnvOverrides,
): ScenarioInput {
  const sourceContext = getScenarioSourceContext(scenario) ?? { basePath, envOverrides };
  const resolved = resolveScenarioTestsRefs(
    sourceContext.basePath,
    resolveScenarioConfigValuesRefs(sourceContext.basePath, scenario, sourceContext.envOverrides),
    sourceContext.envOverrides,
  );
  setScenarioSourceContext(resolved, sourceContext);
  return resolved;
}

function getFilePaths(
  basePath: string,
  fileRef: string,
  envOverrides?: EnvOverrides,
): { paths: string[]; fromGlob: boolean } {
  const renderedFileRef = renderEnvOnlyInStringForFilePath(fileRef, envOverrides);
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
      const restoredScenario = restoreScenarioSourceContext(
        scenario as unknown as Record<string, unknown>,
      ) as ScenarioInput;
      const sourceContext = getScenarioSourceContext(restoredScenario) ?? {
        basePath,
        envOverrides,
      };
      loadedScenarios.push(
        resolveScenarioFileRefs(
          sourceContext.basePath,
          restoredScenario,
          sourceContext.envOverrides,
        ),
      );
      continue;
    }

    const scenarioRefPath = fileRefToPath(renderEnvOnlyInStringForFilePath(scenario, envOverrides));
    const dependencyContext = getScenarioDependencyContext(scenarioRefPath, basePath);
    for (const scenarioFilePath of getScenarioFilePaths(basePath, scenario, envOverrides)) {
      const scenarioBasePath = path.dirname(scenarioFilePath);
      // Ref is already absolute, so the loader does not re-resolve it against
      // cliState.basePath.
      let loaded: unknown;
      try {
        loaded = await maybeLoadFromExternalFile(
          `${FILE_REF_PREFIX}${scenarioFilePath}`,
          undefined,
          envOverrides,
        );
      } catch (error) {
        throw new ConfigResolutionError(
          `Failed to read scenario file: ${formatSourceRef(scenarioFilePath)}`,
          { cause: error },
        );
      }
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
        const resolvedScenario = resolveScenarioFileRefs(
          scenarioBasePath,
          entry as ScenarioInput,
          envOverrides,
        );
        setScenarioSourceContext(resolvedScenario, {
          basePath: scenarioBasePath,
          envOverrides,
          dependencies: Array.from(
            new Set([scenarioFilePath, ...(dependencyContext.dependencies ?? [])]),
          ),
          watchRoots: dependencyContext.watchRoots,
        });
        loadedScenarios.push(resolvedScenario);
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
  if (Object.prototype.hasOwnProperty.call(entry, '$expand')) {
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

function validateMatrixRowShape(
  row: unknown,
  rowIndex: number,
  sourceRef: string,
  unrecognizedKeys: DiagnosticKeySummary,
): void {
  if (!isPlainRecord(row)) {
    throw new ConfigResolutionError(
      `Scenario config $values row ${rowIndex + 1} must be an object (partial test case); got ${describeValue(row)} in ${sourceRef}`,
    );
  }
  if (
    Object.prototype.hasOwnProperty.call(row, '$values') ||
    Object.prototype.hasOwnProperty.call(row, '$expand')
  ) {
    throw new ConfigResolutionError(
      `Nested $values references are not supported; found one in row ${rowIndex + 1} of ${sourceRef}`,
    );
  }
  const keys = Object.keys(row);
  if (keys.length > 0 && !keys.some((key) => TEST_CASE_FIELD_NAMES.has(key))) {
    // A row with nothing the evaluator understands silently produces a test with
    // no vars/asserts — the classic flat-CSV mistake. Fail instead.
    throw new ConfigResolutionError(
      `Scenario config row ${rowIndex + 1} from ${sourceRef} has no recognized test case fields (e.g. vars, assert); got keys [${formatKeySummary(summarizeKeys(keys))}]. Did you mean to nest them under "vars"?`,
    );
  }
  for (const key of keys) {
    if (!TEST_CASE_FIELD_NAMES.has(key)) {
      addDiagnosticKey(unrecognizedKeys, key);
    }
  }
}

function validateMatrixRowValues(row: unknown, rowIndex: number, sourceRef: string): void {
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

function validateMatrixRowShapes(rows: unknown[], sourceRef: string): void {
  const unrecognizedKeys = createDiagnosticKeySummary();
  for (const [rowIndex, row] of rows.entries()) {
    validateMatrixRowShape(row, rowIndex, sourceRef, unrecognizedKeys);
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
    throw new ConfigResolutionError(
      `Failed to read scenario matrix file: ${formatSourceRef(valuesFilePath)}`,
      { cause: error },
    );
  }
}

/**
 * Expand `$values` matrix-file refs in a scenario's config rows into the rows
 * those files contain. Inline rows retain their order while source-env templates
 * and supported file/provider refs are materialized. Every loaded row is validated
 * so malformed matrix files fail here instead of corrupting the eval.
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

  for (const [entryIndex, rawEntry] of config.entries()) {
    const entry = isPlainRecord(rawEntry) ? restoreScenarioTestSourceContext(rawEntry) : rawEntry;
    const isRefLike =
      entry !== null &&
      typeof entry === 'object' &&
      !Array.isArray(entry) &&
      (Object.prototype.hasOwnProperty.call(entry, '$values') ||
        Object.prototype.hasOwnProperty.call(entry, '$expand'));
    if (!isRefLike) {
      if (!isPlainRecord(entry)) {
        throw new ConfigResolutionError(
          `Scenario config entry ${entryIndex + 1} must be an object (partial test case); got ${describeValue(entry)}`,
        );
      }
      const entrySourceContext = getScenarioTestSourceContext(entry) ?? {
        basePath,
        envOverrides,
      };
      expandedConfig.push(
        materializeScenarioConfigRow(
          entrySourceContext.basePath,
          entry,
          entrySourceContext.envOverrides,
          `scenario config entry ${entryIndex + 1}`,
        ),
      );
      continue;
    }

    const ref = assertValidValuesRef(entry, `scenario config entry ${entryIndex + 1}`);
    const sourceContext = getScenarioConfigSourceContext(ref) ?? { basePath, envOverrides };
    const valuesRef = resolveFileRefFromBase(
      sourceContext.basePath,
      ref.$values,
      sourceContext.envOverrides,
    );
    const expansionStart = expandedConfig.length;
    let sawLoadedValue = false;
    const valuesDependencyContext = getScenarioDependencyContext(
      fileRefToPath(valuesRef),
      sourceContext.basePath,
    );
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
      validateMatrixRowShapes(rows, concreteRef);
      for (const [rowIndex, rawRow] of rows.entries()) {
        let row: Scenario['config'][number];
        try {
          row = materializeScenarioConfigRow(
            path.dirname(valuesFilePath),
            rawRow,
            sourceContext.envOverrides,
            `row ${rowIndex + 1} of ${concreteRef}`,
          );
        } catch (error) {
          if (error instanceof ConfigResolutionError) {
            throw error;
          }
          throw new ConfigResolutionError(
            `Failed to materialize scenario config row ${rowIndex + 1} from ${concreteRef}`,
            { cause: error },
          );
        }
        validateMatrixRowValues(row, rowIndex, concreteRef);
        if (row && typeof row === 'object') {
          setScenarioTestSourceContext(row, {
            basePath: path.dirname(valuesFilePath),
            envOverrides: sourceContext.envOverrides,
            dependencies: Array.from(
              new Set([valuesFilePath, ...(valuesDependencyContext.dependencies ?? [])]),
            ),
            watchRoots: valuesDependencyContext.watchRoots,
          });
        }
        expandedConfig.push(row);
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
