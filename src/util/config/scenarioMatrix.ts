import * as fs from 'fs';
import * as path from 'path';

import { globSync, hasMagic } from 'glob';
import cliState from '../../cliState';
import logger from '../../logger';
import { isScenarioConfigValuesRef, TestCaseSchema } from '../../types/index';
import { getNunjucksEngineForFilePath, maybeLoadFromExternalFile } from '../file';
import { normalizeFilePath } from '../functions/loadFunction';
import { ConfigResolutionError } from './errors';

import type {
  Scenario,
  ScenarioConfigValuesRef,
  TestSuite,
  TestSuiteConfig,
} from '../../types/index';

const FILE_REF_PREFIX = 'file://';

const TEST_CASE_FIELD_NAMES = new Set(Object.keys(TestCaseSchema.shape));

function fileRefToPath(fileRef: string): string {
  return normalizeFilePath(fileRef.slice(FILE_REF_PREFIX.length));
}

export function resolveFileRefFromBase(basePath: string, fileRef: string): string {
  if (!fileRef.startsWith(FILE_REF_PREFIX)) {
    return fileRef;
  }

  const renderedFileRef = getNunjucksEngineForFilePath().renderString(fileRef, {});
  const filePath = fileRefToPath(renderedFileRef);
  const resolvedPath = path.isAbsolute(filePath) ? filePath : path.resolve(basePath, filePath);
  return `${FILE_REF_PREFIX}${resolvedPath}`;
}

/**
 * Resolve `$values` matrix refs in a scenario's config rows against the directory
 * of the file that declared them, so later expansion is location-independent.
 */
export function resolveScenarioConfigValuesRefs(basePath: string, scenario: Scenario): Scenario {
  if (!Array.isArray(scenario.config)) {
    return scenario;
  }

  return {
    ...scenario,
    config: scenario.config.map((entry) =>
      isScenarioConfigValuesRef(entry)
        ? { ...entry, $values: resolveFileRefFromBase(basePath, entry.$values) }
        : entry,
    ),
  };
}

function resolveScenarioTestsRefs(basePath: string, scenario: Scenario): Scenario {
  const tests = (scenario as { tests?: unknown }).tests;
  if (typeof tests === 'string') {
    return {
      ...scenario,
      tests: resolveFileRefFromBase(basePath, tests),
    } as unknown as Scenario;
  }
  if (!Array.isArray(tests)) {
    return scenario;
  }

  const resolvedTests = tests.map((test) =>
    typeof test === 'string' ? resolveFileRefFromBase(basePath, test) : test,
  );
  return {
    ...scenario,
    tests: resolvedTests,
  } as unknown as Scenario;
}

function resolveScenarioFileRefs(basePath: string, scenario: Scenario): Scenario {
  return resolveScenarioTestsRefs(basePath, resolveScenarioConfigValuesRefs(basePath, scenario));
}

function getScenarioFilePaths(basePath: string, fileRef: string): string[] {
  if (!fileRef.startsWith(FILE_REF_PREFIX)) {
    throw new ConfigResolutionError(
      `Scenario "${fileRef}" is not valid: scenarios must be objects or file:// references`,
    );
  }

  const renderedFileRef = getNunjucksEngineForFilePath().renderString(fileRef, {});
  const rawPath = fileRefToPath(renderedFileRef);
  const resolvedPath = path.isAbsolute(rawPath) ? rawPath : path.resolve(basePath, rawPath);
  // Detect glob magic on the raw ref, not the resolved path, so directories whose
  // names contain glob metacharacters do not turn plain refs into patterns.
  // windowsPathsNoEscape must match the globSync call below, else Windows
  // backslash paths read as escape sequences and dodge detection.
  if (!hasMagic(rawPath, { windowsPathsNoEscape: true })) {
    return [resolvedPath];
  }

  const matchedFiles = globSync(resolvedPath, {
    windowsPathsNoEscape: true,
  });
  if (matchedFiles.length === 0) {
    // Pre-resolved refs can carry glob metacharacters from a parent directory name;
    // when the pattern matches nothing but names a real file, load it literally.
    if (fs.statSync(resolvedPath, { throwIfNoEntry: false })?.isFile()) {
      return [resolvedPath];
    }
    throw new ConfigResolutionError(`No files found matching pattern: ${resolvedPath}`);
  }
  return matchedFiles;
}

/**
 * Materialize the `scenarios` config value into Scenario objects: file:// refs
 * (including globs) are loaded, and `$values` refs inside each scenario are
 * resolved against the directory of the file that declared them.
 */
export async function loadScenarioConfigs(
  scenarios: TestSuiteConfig['scenarios'] | TestSuite['scenarios'] | undefined,
  basePath = cliState.basePath || '',
): Promise<Scenario[] | undefined> {
  if (!scenarios) {
    return undefined;
  }

  const scenarioInputs = Array.isArray(scenarios) ? scenarios : [scenarios];
  const loadedScenarios: Scenario[] = [];
  for (const scenario of scenarioInputs) {
    if (typeof scenario !== 'string') {
      loadedScenarios.push(resolveScenarioFileRefs(basePath, scenario));
      continue;
    }

    for (const scenarioFilePath of getScenarioFilePaths(basePath, scenario)) {
      const scenarioBasePath = path.dirname(scenarioFilePath);
      // Ref is already absolute, so the loader does not re-resolve it against
      // cliState.basePath.
      const loaded = await maybeLoadFromExternalFile(`${FILE_REF_PREFIX}${scenarioFilePath}`);
      const scenarioEntries = Array.isArray(loaded) ? loaded.flat() : [loaded];
      for (const entry of scenarioEntries) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
          throw new ConfigResolutionError(
            `Scenario file ${scenarioFilePath} must contain scenario objects; got ${formatRowPreview(entry)}`,
          );
        }
        loadedScenarios.push(resolveScenarioFileRefs(scenarioBasePath, entry as Scenario));
      }
    }
  }

  return loadedScenarios;
}

function formatRowPreview(row: unknown): string {
  const json = JSON.stringify(row);
  const preview = json === undefined ? String(row) : json;
  return preview.length > 120 ? `${preview.slice(0, 120)}…` : preview;
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
      `A scenario config $values entry must have $values as its only key, e.g. { $values: "file://matrix.yaml" }; got keys [${keys.join(', ')}] (${sourceDescription})`,
    );
  }
  const ref = (entry as { $values: unknown }).$values;
  if (typeof ref !== 'string' || !ref.startsWith(FILE_REF_PREFIX)) {
    throw new ConfigResolutionError(
      `Scenario config $values must be a file:// reference; got ${formatRowPreview(ref)} (${sourceDescription})`,
    );
  }
  return entry as ScenarioConfigValuesRef;
}

function validateMatrixRows(rows: unknown[], sourceRef: string): void {
  const unrecognizedKeys = new Set<string>();
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new ConfigResolutionError(
        `Scenario config $values entries must be objects (partial test cases); got ${formatRowPreview(row)} in ${sourceRef}`,
      );
    }
    if ('$values' in row || '$expand' in row) {
      throw new ConfigResolutionError(
        `Nested $values references are not supported; found ${formatRowPreview(row)} in ${sourceRef}`,
      );
    }
    const keys = Object.keys(row);
    if (keys.length > 0 && !keys.some((key) => TEST_CASE_FIELD_NAMES.has(key))) {
      // A row with nothing the evaluator understands silently produces a test with
      // no vars/asserts — the classic flat-CSV mistake. Fail instead.
      throw new ConfigResolutionError(
        `Scenario config row from ${sourceRef} has no recognized test case fields (e.g. vars, assert); got keys [${keys.join(', ')}]. Did you mean to nest them under "vars"?`,
      );
    }
    for (const key of keys) {
      if (!TEST_CASE_FIELD_NAMES.has(key)) {
        unrecognizedKeys.add(key);
      }
    }
  }
  if (unrecognizedKeys.size > 0) {
    logger.warn(
      `Scenario config rows from ${sourceRef} contain unrecognized test case fields [${[...unrecognizedKeys].join(', ')}]; these are kept but have no effect. Known fields include vars, assert, options, metadata.`,
    );
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
  basePath = cliState.basePath || '',
): Promise<Scenario['config']> {
  if (typeof config === 'string') {
    throw new ConfigResolutionError(
      `Scenario config must be an array; to load rows from a file use config: [{ $values: "${config}" }]`,
    );
  }
  if (!Array.isArray(config)) {
    return config as Scenario['config'];
  }

  const expandedConfig: Scenario['config'] = [];

  for (const entry of config) {
    const isRefLike =
      entry !== null &&
      typeof entry === 'object' &&
      !Array.isArray(entry) &&
      ('$values' in entry || '$expand' in entry);
    if (!isRefLike) {
      expandedConfig.push(entry);
      continue;
    }

    const ref = assertValidValuesRef(entry, `scenario config entry ${formatRowPreview(entry)}`);
    const valuesRef = resolveFileRefFromBase(basePath, ref.$values);
    const loadedValues = await maybeLoadFromExternalFile(valuesRef);
    if (loadedValues === null || loadedValues === undefined) {
      throw new ConfigResolutionError(`Scenario config $values file is empty: ${valuesRef}`);
    }

    const rows: unknown[] = Array.isArray(loadedValues) ? loadedValues.flat() : [loadedValues];
    if (rows.length === 0) {
      // Zero rows means the scenario silently runs zero tests; treat it like an
      // empty file rather than letting a truncated matrix pass green.
      throw new ConfigResolutionError(
        `Scenario config $values file contributed no rows: ${valuesRef}`,
      );
    }
    validateMatrixRows(rows, valuesRef);
    expandedConfig.push(...(rows as Scenario['config']));
  }

  return expandedConfig;
}
