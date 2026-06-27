import { isDeepStrictEqual } from 'node:util';

import yaml from 'js-yaml';
import {
  getEffectiveJsonSchemaFileRef,
  getJsonSchemaFileSnapshot,
  loadJsonSchemaFileReference,
  renderJsonSchemaText,
  resolveJsonSchemaFileReference,
} from '../util/file';
import { extractJsonObjects, getAjv, getCompiledJsonSchemaSnapshot } from '../util/json';
import type { ValidateFunction } from 'ajv';

import type { Assertion, AssertionParams, GradingResult } from '../types/index';

const staticFileValidatorCache = new WeakMap<
  object,
  WeakMap<Assertion, { source: string; validate: ValidateFunction }>
>();
const staticFileSnapshotCache = new WeakMap<
  Assertion,
  { source: string; snapshot: ReturnType<typeof loadJsonSchemaFileReference> }
>();
class JsonSchemaConfigurationError extends Error {}

function hasJsonSchema({
  renderedValue,
  valueFromScriptResolved,
}: Pick<AssertionParams, 'renderedValue' | 'valueFromScriptResolved'>): boolean {
  return (
    valueFromScriptResolved === true ||
    (renderedValue !== undefined && renderedValue !== null && renderedValue !== '')
  );
}

function formatJsonSchemaError(error: unknown): string {
  if (error instanceof JsonSchemaConfigurationError) {
    return error.message;
  }
  if (error instanceof yaml.YAMLException) {
    const location = error.mark
      ? ` (line ${error.mark.line + 1}, column ${error.mark.column + 1})`
      : '';
    return `invalid YAML syntax${location}`;
  }
  if (
    error instanceof Error &&
    (error.name === 'MissingRefError' || error.message.includes("can't resolve reference"))
  ) {
    return 'unresolved schema reference';
  }
  if (error instanceof Error && error.message.includes('schema with key or id')) {
    return 'duplicate schema identifier';
  }
  return 'schema compilation failed';
}

function contextualizeJsonSchemaFileError(type: Assertion['type'], error: string): string {
  return error === 'schema file must contain an object or boolean schema'
    ? `${type} schema file must contain an object or boolean schema`
    : error;
}

function getCachedStaticValidator(
  ajv: object,
  assertion: Assertion,
  source: string,
): ValidateFunction | undefined {
  const cached = staticFileValidatorCache.get(ajv)?.get(assertion);
  return cached?.source === source ? cached.validate : undefined;
}

function cacheStaticValidator(
  ajv: object,
  assertion: Assertion,
  source: string,
  validate: ValidateFunction,
): void {
  let assertionCache = staticFileValidatorCache.get(ajv);
  if (!assertionCache) {
    assertionCache = new WeakMap();
    staticFileValidatorCache.set(ajv, assertionCache);
  }
  assertionCache.set(assertion, { source, validate });
}

function ensureSynchronousValidator(validate: ValidateFunction): ValidateFunction {
  if ((validate as ValidateFunction & { $async?: boolean }).$async) {
    throw new JsonSchemaConfigurationError('async schemas are not supported');
  }
  return validate;
}

function executeJsonSchemaValidation(
  validate: ValidateFunction,
  value: unknown,
  assertion: Assertion,
): { valid: boolean } | { failure: GradingResult } {
  try {
    const valid = validate(value);
    if (typeof valid !== 'boolean') {
      throw new Error('JSON schema validator did not return a boolean');
    }
    return { valid };
  } catch {
    const schema = validate.schema;
    if (
      typeof schema === 'object' &&
      schema !== null &&
      '$id' in schema &&
      typeof schema.$id === 'string'
    ) {
      try {
        getAjv().removeSchema(schema.$id);
      } catch {
        // Preserve the safe validation failure below.
      }
    }
    staticFileSnapshotCache.delete(assertion);
    staticFileValidatorCache.get(getAjv())?.delete(assertion);
    return {
      failure: {
        pass: false,
        score: 0,
        reason: 'Invalid JSON schema: schema validation failed',
        assertion,
      },
    };
  }
}

function getMatchingSchemaIdValidator(
  ajv: ReturnType<typeof getAjv>,
  schema: object | boolean,
): ValidateFunction | undefined {
  if (
    typeof schema !== 'object' ||
    schema === null ||
    !('$id' in schema) ||
    typeof schema.$id !== 'string'
  ) {
    return undefined;
  }
  let existing: ValidateFunction | undefined;
  try {
    existing = ajv.getSchema(schema.$id);
  } catch {
    // A previously registered invalid schema may throw while Ajv resolves it.
    // Let compile() below classify the current schema instead.
    return undefined;
  }
  const compiledSnapshot = existing ? getCompiledJsonSchemaSnapshot(existing) : undefined;
  return existing && compiledSnapshot && isDeepStrictEqual(compiledSnapshot, schema)
    ? existing
    : undefined;
}

export function getJsonSchemaFileRuntimeState(
  assertion: Assertion,
  value: unknown,
): {
  effectiveFileRef?: string;
  snapshot: ReturnType<typeof getJsonSchemaFileSnapshot>;
} {
  return {
    snapshot: getJsonSchemaFileSnapshot(assertion),
    ...(typeof value === 'string' && value.startsWith('file://')
      ? { effectiveFileRef: getEffectiveJsonSchemaFileRef(assertion, value) }
      : {}),
  };
}

function getJsonSchemaValidator({
  renderedValue,
  assertion,
  assertionValueContext,
}: Pick<AssertionParams, 'renderedValue' | 'assertion' | 'assertionValueContext'>):
  | { validate: ValidateFunction }
  | { failure: GradingResult } {
  let shouldEvictRawSnapshot = false;
  try {
    const ajv = getAjv();
    const snapshot = getJsonSchemaFileSnapshot(assertion);
    let schema: unknown = renderedValue;
    let staticSource: string | undefined;

    if (snapshot) {
      if ('error' in snapshot) {
        throw new JsonSchemaConfigurationError(
          contextualizeJsonSchemaFileError(assertion.type, snapshot.error),
        );
      }
      if (snapshot.format === 'text') {
        schema = yaml.load(String(renderedValue));
        staticSource = `${snapshot.source}\0${String(renderedValue)}`;
        if (schema === undefined || schema === null) {
          throw new JsonSchemaConfigurationError(
            `${assertion.type} schema file must contain an object or boolean schema`,
          );
        }
      } else if (assertion.value === snapshot.schema) {
        schema = snapshot.schema;
        staticSource = snapshot.source;
      }
      if (staticSource) {
        const cached = getCachedStaticValidator(ajv, assertion, staticSource);
        if (cached) {
          return { validate: ensureSynchronousValidator(cached) };
        }
      }
    } else if (typeof renderedValue === 'string') {
      if (renderedValue.startsWith('file://')) {
        const source = resolveJsonSchemaFileReference(renderedValue);
        const cachedSnapshot = staticFileSnapshotCache.get(assertion);
        const loadedSnapshot =
          cachedSnapshot?.source === source
            ? cachedSnapshot.snapshot
            : loadJsonSchemaFileReference(renderedValue);
        if (cachedSnapshot?.source !== source && !('error' in loadedSnapshot)) {
          staticFileSnapshotCache.set(assertion, { source, snapshot: loadedSnapshot });
        }
        if ('error' in loadedSnapshot) {
          throw new JsonSchemaConfigurationError(
            contextualizeJsonSchemaFileError(assertion.type, loadedSnapshot.error),
          );
        }
        shouldEvictRawSnapshot = true;
        if (loadedSnapshot.format === 'text') {
          const renderedSchema = renderJsonSchemaText(
            String(loadedSnapshot.schema),
            assertionValueContext.vars,
          );
          schema = yaml.load(renderedSchema);
          staticSource = `${loadedSnapshot.source}\0${renderedSchema}`;
        } else {
          schema = loadedSnapshot.schema;
          staticSource = loadedSnapshot.source;
        }
        const cached = getCachedStaticValidator(ajv, assertion, staticSource);
        if (cached) {
          return { validate: ensureSynchronousValidator(cached) };
        }
      } else {
        schema = yaml.load(renderedValue);
      }
    }

    if (
      schema === null ||
      Array.isArray(schema) ||
      (typeof schema !== 'boolean' && typeof schema !== 'object')
    ) {
      throw new JsonSchemaConfigurationError(
        `${assertion.type} schema must resolve to an object or boolean`,
      );
    }

    const compilableSchema = schema as object | boolean;
    const cachedBySchemaId = getMatchingSchemaIdValidator(ajv, compilableSchema);
    if (cachedBySchemaId) {
      const validate = ensureSynchronousValidator(cachedBySchemaId);
      if (staticSource) {
        cacheStaticValidator(ajv, assertion, staticSource, validate);
      }
      return { validate };
    }

    let validate: ValidateFunction;
    try {
      validate = ajv.compile(compilableSchema);
    } catch (error) {
      if (
        typeof compilableSchema === 'object' &&
        compilableSchema !== null &&
        '$id' in compilableSchema &&
        typeof compilableSchema.$id === 'string' &&
        !(error instanceof Error && error.message.includes('schema with key or id'))
      ) {
        try {
          ajv.removeSchema(compilableSchema.$id);
        } catch {
          // Preserve the original compilation error.
        }
      }
      throw error;
    }
    try {
      validate = ensureSynchronousValidator(validate);
    } catch (error) {
      if (
        typeof compilableSchema === 'object' &&
        compilableSchema !== null &&
        '$id' in compilableSchema &&
        typeof compilableSchema.$id === 'string'
      ) {
        try {
          ajv.removeSchema(compilableSchema.$id);
        } catch {
          // Preserve the unsupported-validator error.
        }
      }
      throw error;
    }
    if (staticSource) {
      cacheStaticValidator(ajv, assertion, staticSource, validate);
    }
    return { validate };
  } catch (error) {
    if (shouldEvictRawSnapshot) {
      staticFileSnapshotCache.delete(assertion);
    }
    return {
      failure: {
        pass: false,
        score: 0,
        reason: `Invalid JSON schema: ${formatJsonSchemaError(error)}`,
        assertion,
      },
    };
  }
}

export function handleIsJson({
  outputString,
  renderedValue,
  inverse,
  assertion,
  assertionValueContext,
  valueFromScriptResolved,
}: AssertionParams): GradingResult {
  let parsedJson;
  let pass;
  try {
    parsedJson = JSON.parse(outputString);
    pass = !inverse;
  } catch {
    pass = inverse;
  }

  if (parsedJson !== undefined && hasJsonSchema({ renderedValue, valueFromScriptResolved })) {
    const validatorResult = getJsonSchemaValidator({
      renderedValue,
      assertion,
      assertionValueContext,
    });
    if ('failure' in validatorResult) {
      return validatorResult.failure;
    }

    const { validate } = validatorResult;
    const validationResult = executeJsonSchemaValidation(validate, parsedJson, assertion);
    if ('failure' in validationResult) {
      return validationResult.failure;
    }
    const { valid } = validationResult;
    pass = inverse ? !valid : valid;
    if (!pass) {
      return {
        pass,
        score: 0,
        reason: inverse
          ? 'Output is JSON that conforms to the provided schema'
          : `JSON does not conform to the provided schema. Errors: ${getAjv().errorsText(
              validate.errors,
            )}`,
        assertion,
      };
    }
  }

  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass ? 'Assertion passed' : 'Expected output to be valid JSON',
    assertion,
  };
}

export function handleContainsJson({
  assertion,
  assertionValueContext,
  renderedValue,
  outputString,
  inverse,
  valueFromScriptResolved,
}: AssertionParams): GradingResult {
  let errorMessage = 'Expected output to contain valid JSON';
  const jsonObjects = extractJsonObjects(outputString);
  let pass = inverse ? jsonObjects.length === 0 : jsonObjects.length > 0;
  let validate: ValidateFunction | undefined;

  if (jsonObjects.length > 0 && hasJsonSchema({ renderedValue, valueFromScriptResolved })) {
    const validatorResult = getJsonSchemaValidator({
      renderedValue,
      assertion,
      assertionValueContext,
    });
    if ('failure' in validatorResult) {
      return validatorResult.failure;
    }

    validate = validatorResult.validate;
  }

  for (const jsonObject of jsonObjects) {
    if (validate) {
      const validationResult = executeJsonSchemaValidation(validate, jsonObject, assertion);
      if ('failure' in validationResult) {
        return validationResult.failure;
      }
      const { valid } = validationResult;
      pass = inverse ? !valid : valid;
      if (valid) {
        if (inverse) {
          errorMessage = 'Output contains JSON conforming to the provided schema';
        }
        break;
      } else {
        errorMessage = `JSON does not conform to the provided schema. Errors: ${getAjv().errorsText(
          validate.errors,
        )}`;
      }
    }
  }
  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass ? 'Assertion passed' : errorMessage,
    assertion,
  };
}
