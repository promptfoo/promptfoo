import fs from 'fs';
import path from 'path';

import { getEnvBool } from '../envars';
import { ConfigResolutionError } from '../util/config/load';
import { sha256 } from '../util/createHash';
import { JsonlFileWriter } from '../util/exportToFile/writeToFile';
import { parseFileUrl } from '../util/functions/loadFunction';
import { getOutputFileFormat } from '../util/outputFormats';
import { renderEnvOnlyInObject } from '../util/render';
import { preserveTracingCredentialReferences } from '../util/sanitizer';
import { loadYaml } from '../util/yamlLoad';
import { EvalEvaluationStore } from './evaluationStore';

import type {
  EvaluatorResultWriter,
  EvaluatorResultWriterOptions,
  EvaluatorRuntime,
  VarValuesFileCache,
} from '../evaluator/runtime';
import type Eval from '../models/eval';
import type EvalResult from '../models/evalResult';

type LoadedVarValue = string | number | boolean | object | unknown[];

function getVarValuesFingerprintEntries(
  value: unknown,
  varName: string,
  basePath: string,
  cache: VarValuesFileCache,
  location: string,
  includeValues: boolean,
): unknown[][] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => {
      if (Array.isArray(item)) {
        return [];
      }
      return getVarValuesFingerprintEntries(
        item,
        varName,
        basePath,
        cache,
        `${location}[${index}]`,
        includeValues,
      );
    });
  }
  if (typeof value !== 'object' || value === null) {
    return [];
  }
  const reference = (value as Record<string, unknown>).$values;
  if (typeof reference !== 'string' || !reference.startsWith('file://')) {
    return [];
  }
  if (!includeValues) {
    return [[location, reference]];
  }
  const { filePath: referencedPath } = parseFileUrl(reference);
  const resolvedPath = path.isAbsolute(referencedPath)
    ? referencedPath
    : path.resolve(basePath || process.cwd(), referencedPath);
  return [
    [
      location,
      path.relative(basePath, resolvedPath),
      loadVarValuesFromFile(value, varName, basePath, cache),
    ],
  ];
}

export function getVarValuesFingerprint(
  tests: Array<{ vars?: unknown; options?: { disableVarExpansion?: boolean } }>,
  basePath: string,
  cache: VarValuesFileCache = new Map(),
  defaultDisableVarExpansion = false,
): string | undefined {
  const expansionDisabled = getEnvBool('PROMPTFOO_DISABLE_VAR_EXPANSION');
  const entries = tests.flatMap((testCase, testIndex) => {
    if ((testCase.options?.disableVarExpansion ?? defaultDisableVarExpansion) === true) {
      return [];
    }
    const vars = testCase.vars;
    if (typeof vars !== 'object' || vars === null || Array.isArray(vars)) {
      return [];
    }
    return Object.entries(vars).flatMap(([varName, value], varIndex) =>
      getVarValuesFingerprintEntries(
        value,
        varName,
        basePath,
        cache,
        `${testIndex}:${varIndex}:${varName}`,
        !expansionDisabled,
      ),
    );
  });
  if (entries.length === 0) {
    return undefined;
  }
  const fingerprint = sha256(JSON.stringify(entries));
  return expansionDisabled ? `disabled:${fingerprint}` : fingerprint;
}

function prepareVarValuesSnapshot(
  tests: Parameters<typeof getVarValuesFingerprint>[0],
  basePath: string,
  cache: VarValuesFileCache,
  defaultDisableVarExpansion: boolean,
  expectedFingerprint?: string | null,
  fingerprintError?: string,
): string | undefined {
  const fingerprint = getVarValuesFingerprint(tests, basePath, cache, defaultDisableVarExpansion);
  if (expectedFingerprint === null && fingerprint && !fingerprint.startsWith('disabled:')) {
    throw new ConfigResolutionError(
      'The saved evaluation has no matrix expansion fingerprint. Restore the original PROMPTFOO_DISABLE_VAR_EXPANSION setting or start a new evaluation. Existing results were preserved.',
    );
  }
  if (typeof expectedFingerprint === 'string' && fingerprint !== expectedFingerprint) {
    if (
      fingerprint !== undefined &&
      expectedFingerprint.startsWith('disabled:') !== fingerprint.startsWith('disabled:')
    ) {
      throw new ConfigResolutionError(
        'Matrix expansion mode changed. Restore the original PROMPTFOO_DISABLE_VAR_EXPANSION setting before replaying this evaluation. Existing results were preserved.',
      );
    }
    throw new ConfigResolutionError(
      fingerprintError ||
        'The $values files used by this evaluation have changed. Restore the original files before replaying it.',
    );
  }
  return fingerprint;
}

function isValidExpandedVarValue(value: unknown): value is LoadedVarValue {
  return (
    value !== null &&
    value !== undefined &&
    typeof value !== 'function' &&
    typeof value !== 'symbol'
  );
}

export function loadVarValuesFromFile(
  value: unknown,
  varName: string,
  basePath: string,
  cache?: VarValuesFileCache,
): LoadedVarValue[] {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).length !== 1 ||
    typeof (value as Record<string, unknown>).$values !== 'string' ||
    !(value as Record<string, string>).$values.startsWith('file://')
  ) {
    throw new ConfigResolutionError(
      `Invalid $values reference for variable "${varName}". Expected { $values: "file://path/to/values.yaml" } with no additional properties.`,
    );
  }

  const reference = (value as Record<string, string>).$values;
  const { filePath: referencedPath } = parseFileUrl(reference);
  const resolvedPath = path.isAbsolute(referencedPath)
    ? referencedPath
    : path.resolve(basePath || process.cwd(), referencedPath);

  return loadResolvedVarValues(resolvedPath, varName, cache);
}

function loadResolvedVarValues(
  resolvedPath: string,
  varName: string,
  cache?: VarValuesFileCache,
): LoadedVarValue[] {
  const cached = cache?.get(resolvedPath);
  if (cached) {
    return cached;
  }

  let parsed: unknown;
  try {
    parsed = loadYaml(fs.readFileSync(resolvedPath, 'utf-8'));
  } catch (error) {
    throw new ConfigResolutionError(
      `Failed to load $values for variable "${varName}" from ${resolvedPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!Array.isArray(parsed)) {
    throw new ConfigResolutionError(
      `$values file for variable "${varName}" must contain a top-level array: ${resolvedPath}`,
    );
  }

  const invalidIndex = parsed.findIndex((value) => !isValidExpandedVarValue(value));
  if (invalidIndex !== -1) {
    throw new ConfigResolutionError(
      `$values file for variable "${varName}" contains an invalid value at index ${invalidIndex}: ${resolvedPath}`,
    );
  }

  cache?.set(resolvedPath, parsed);
  return parsed;
}

function getJsonlOutputPaths(outputPath: string | string[] | undefined): string[] {
  if (Array.isArray(outputPath)) {
    return outputPath.filter((path) => getOutputFileFormat(path) === 'jsonl');
  }
  return outputPath && getOutputFileFormat(outputPath) === 'jsonl' ? [outputPath] : [];
}

export const nodeEvaluatorRuntime: EvaluatorRuntime<Eval, EvalResult> = {
  prepareVarValuesSnapshot,
  resolveRuntimeTestSuite(testSuite) {
    if (!testSuite.tracing?.provider) {
      return testSuite;
    }

    const processEnvironmentDisabled = getEnvBool(
      'PROMPTFOO_DISABLE_TEMPLATE_ENV_VARS',
      getEnvBool('PROMPTFOO_SELF_HOSTED', false),
    );
    const processEnvironment = processEnvironmentDisabled ? {} : process.env;
    let renderedEnv = testSuite.env;
    if (renderedEnv) {
      const maxPasses = Object.keys(renderedEnv).length;
      for (let pass = 0; pass < maxPasses; pass++) {
        const previousEnv: NonNullable<typeof testSuite.env> = renderedEnv;
        const nextEnv: NonNullable<typeof testSuite.env> = renderEnvOnlyInObject(
          previousEnv,
          { ...processEnvironment, ...previousEnv },
          true,
        );
        if (
          Object.entries(nextEnv).every(
            ([name, value]) => previousEnv[name as keyof typeof previousEnv] === value,
          )
        ) {
          renderedEnv = nextEnv;
          break;
        }
        renderedEnv = nextEnv;
      }
    }
    const runtimeTestSuite = {
      ...testSuite,
      ...(renderedEnv && { env: renderedEnv }),
      tracing: renderEnvOnlyInObject(
        testSuite.tracing,
        { ...processEnvironment, ...renderedEnv },
        true,
      ),
    };
    preserveTracingCredentialReferences(
      {
        env: testSuite.env,
        tracing: { enabled: testSuite.tracing.enabled, provider: testSuite.tracing.provider },
      },
      {
        env: runtimeTestSuite.env,
        tracing: {
          enabled: runtimeTestSuite.tracing.enabled,
          provider: runtimeTestSuite.tracing.provider,
        },
      },
    );
    return runtimeTestSuite;
  },

  createEvaluationStore(evaluation) {
    return new EvalEvaluationStore(evaluation);
  },

  createResultWriters(outputPath, options: EvaluatorResultWriterOptions): EvaluatorResultWriter[] {
    return getJsonlOutputPaths(outputPath).map((path) => new JsonlFileWriter(path, options));
  },
};
