import { isDeepStrictEqual } from 'node:util';

import * as yaml from 'js-yaml';
import {
  getEffectiveJsonSchemaFileRef,
  getJsonSchemaFileSnapshot,
  loadJsonSchemaFileReference,
  resolveJsonSchemaFileReference,
} from '../util/file';
import {
  extractJsonObjects,
  getAjv,
  getCompiledJsonSchemaSnapshot,
  getDataOnlyJsonSchemaSnapshot,
} from '../util/json';
import type { ValidateFunction } from 'ajv';

import type { Assertion, AssertionParams, GradingResult } from '../types/index';

const validatorCache = new WeakMap<
  object,
  WeakMap<
    Assertion,
    {
      source?: string;
      validate: ValidateFunction;
      snapshot: object | boolean;
    }
  >
>();
const staticFileSnapshotCache = new WeakMap<
  Assertion,
  { source: string; snapshot: ReturnType<typeof loadJsonSchemaFileReference> }
>();
const assertionOwnedValidators = new WeakMap<
  ValidateFunction,
  { assertion: Assertion; schema: object | boolean; schemaId?: string }
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
  try {
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
  } catch {
    // Hostile thrown values must not escape assertion error classification.
  }
  return 'schema compilation failed';
}

function getOwnSchemaId(schema: unknown): string | undefined {
  if (typeof schema !== 'object' || schema === null) {
    return undefined;
  }
  try {
    const descriptor = Object.getOwnPropertyDescriptor(schema, '$id');
    return descriptor && 'value' in descriptor && typeof descriptor.value === 'string'
      ? descriptor.value
      : undefined;
  } catch {
    return undefined;
  }
}

function schemasMatch(left: unknown, right: unknown): boolean {
  try {
    return isDeepStrictEqual(left, right);
  } catch {
    return false;
  }
}

function getSchemaSnapshot(schema: object | boolean): { snapshot: object | boolean } | undefined {
  if (typeof schema === 'boolean') {
    return { snapshot: schema };
  }
  const snapshot = getDataOnlyJsonSchemaSnapshot(schema);
  return snapshot ? { snapshot } : undefined;
}

function removeOwnedValidator(
  ajv: ReturnType<typeof getAjv>,
  validate: ValidateFunction,
  assertion: Assertion,
): void {
  const owned = assertionOwnedValidators.get(validate);
  if (!owned || owned.assertion !== assertion) {
    return;
  }
  assertionOwnedValidators.delete(validate);
  try {
    if (owned.schemaId) {
      ajv.removeSchema(owned.schemaId);
    } else if (
      typeof owned.schema === 'object' &&
      owned.schema !== null &&
      Object.getOwnPropertyDescriptor(owned.schema, '$id') === undefined
    ) {
      ajv.removeSchema(owned.schema);
    }
  } catch {
    // Cleanup must never replace the original schema failure.
  }
}

function contextualizeJsonSchemaFileError(type: Assertion['type'], error: string): string {
  return error === 'schema file must contain an object or boolean schema'
    ? `${type} schema file must contain an object or boolean schema`
    : error;
}

function getCachedValidator(
  ajv: ReturnType<typeof getAjv>,
  assertion: Assertion,
  source: string | undefined,
  schema: object | boolean,
): ValidateFunction | undefined {
  const cached = validatorCache.get(ajv)?.get(assertion);
  if (cached && cached.source === source && schemasMatch(cached.snapshot, schema)) {
    return cached.validate;
  }
  if (cached) {
    validatorCache.get(ajv)?.delete(assertion);
    removeOwnedValidator(ajv, cached.validate, assertion);
  }
  return undefined;
}

function cacheValidator(
  ajv: object,
  assertion: Assertion,
  source: string | undefined,
  validate: ValidateFunction,
  schema: object | boolean,
): void {
  const schemaSnapshot = getSchemaSnapshot(schema);
  if (!schemaSnapshot) {
    return;
  }
  let assertionCache = validatorCache.get(ajv);
  if (!assertionCache) {
    assertionCache = new WeakMap();
    validatorCache.set(ajv, assertionCache);
  }
  assertionCache.set(assertion, {
    ...(source && { source }),
    validate,
    snapshot: schemaSnapshot.snapshot,
  });
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
    const ajv = getAjv();
    removeOwnedValidator(ajv, validate, assertion);
    staticFileSnapshotCache.delete(assertion);
    validatorCache.get(ajv)?.delete(assertion);
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
  assertion: Assertion,
): ValidateFunction | undefined {
  const schemaId = getOwnSchemaId(schema);
  if (!schemaId) {
    return undefined;
  }
  let existing: ValidateFunction | undefined;
  try {
    existing = ajv.getSchema(schemaId);
  } catch {
    // A previously registered invalid schema may throw while Ajv resolves it.
    // Let compile() below classify the current schema instead.
    return undefined;
  }
  const compiledSnapshot = existing ? getCompiledJsonSchemaSnapshot(existing) : undefined;
  if (existing && compiledSnapshot && schemasMatch(compiledSnapshot, schema)) {
    return existing;
  }
  if (existing && compiledSnapshot) {
    let sameSchemaObject = false;
    try {
      sameSchemaObject = existing.schema === schema;
    } catch {
      // compile() below will safely classify any remaining identity conflict.
    }
    if (sameSchemaObject) {
      if (assertionOwnedValidators.get(existing)?.assertion !== assertion) {
        throw new JsonSchemaConfigurationError('duplicate schema identifier');
      }
      removeOwnedValidator(ajv, existing, assertion);
    }
  }
  return undefined;
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
  valueFromScript,
  valueFromScriptResolved,
}: Pick<
  AssertionParams,
  'renderedValue' | 'assertion' | 'valueFromScript' | 'valueFromScriptResolved'
>): { validate: ValidateFunction } | { failure: GradingResult } {
  const isLegacyDirectInvocation = valueFromScriptResolved === undefined;
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
        try {
          schema = yaml.load(String(renderedValue));
        } catch (error) {
          if (error instanceof yaml.YAMLException) {
            throw new JsonSchemaConfigurationError('schema compilation failed');
          }
          throw error;
        }
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
    } else if (typeof renderedValue === 'string') {
      if (renderedValue.startsWith('file://')) {
        if (isLegacyDirectInvocation) {
          if (valueFromScript === undefined) {
            throw new Error(
              `${assertion.type} references a file that does not export a JSON schema`,
            );
          }
          schema = valueFromScript;
        } else {
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
            const schemaText = String(loadedSnapshot.schema);
            try {
              schema = yaml.load(schemaText);
            } catch (error) {
              if (error instanceof yaml.YAMLException) {
                throw new JsonSchemaConfigurationError('schema compilation failed');
              }
              throw error;
            }
            staticSource = `${loadedSnapshot.source}\0${schemaText}`;
          } else {
            schema = loadedSnapshot.schema;
            staticSource = loadedSnapshot.source;
          }
        }
      } else {
        schema = yaml.load(renderedValue);
      }
    } else if (
      isLegacyDirectInvocation &&
      renderedValue !== undefined &&
      typeof renderedValue !== 'object' &&
      typeof renderedValue !== 'boolean'
    ) {
      throw new Error(`${assertion.type} assertion must have a string or object value`);
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
    const cached = getCachedValidator(ajv, assertion, staticSource, compilableSchema);
    if (cached) {
      return { validate: ensureSynchronousValidator(cached) };
    }

    const cachedBySchemaId = getMatchingSchemaIdValidator(ajv, compilableSchema, assertion);
    if (cachedBySchemaId) {
      const validate = ensureSynchronousValidator(cachedBySchemaId);
      cacheValidator(ajv, assertion, staticSource, validate, compilableSchema);
      return { validate };
    }

    let validate: ValidateFunction;
    const schemaId = getOwnSchemaId(compilableSchema);
    const schemaToCompile =
      !schemaId && typeof compilableSchema === 'object'
        ? (getDataOnlyJsonSchemaSnapshot(compilableSchema) ?? compilableSchema)
        : compilableSchema;
    try {
      validate = ajv.compile(schemaToCompile);
    } catch (error) {
      if (
        schemaId &&
        !(() => {
          try {
            return error instanceof Error && error.message.includes('schema with key or id');
          } catch {
            return false;
          }
        })()
      ) {
        try {
          ajv.removeSchema(schemaId);
        } catch {
          // Preserve the original compilation error.
        }
      }
      throw error;
    }

    assertionOwnedValidators.set(validate, {
      assertion,
      schema: schemaToCompile,
      ...(schemaId && { schemaId }),
    });

    try {
      validate = ensureSynchronousValidator(validate);
    } catch (error) {
      removeOwnedValidator(ajv, validate, assertion);
      throw error;
    }

    cacheValidator(ajv, assertion, staticSource, validate, compilableSchema);
    return { validate };
  } catch (error) {
    if (shouldEvictRawSnapshot) {
      staticFileSnapshotCache.delete(assertion);
    }
    if (isLegacyDirectInvocation) {
      throw error;
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
  valueFromScript,
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
      valueFromScript,
      valueFromScriptResolved,
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
  renderedValue,
  outputString,
  inverse,
  valueFromScript,
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
      valueFromScript,
      valueFromScriptResolved,
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
