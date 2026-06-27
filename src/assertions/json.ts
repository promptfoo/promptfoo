import { isDeepStrictEqual } from 'node:util';

import yaml from 'js-yaml';
import nunjucks from 'nunjucks';
import { extractJsonObjects, getAjv } from '../util/json';
import {
  getJsonSchemaFileSnapshot,
  loadJsonSchemaFileReference,
  resolveJsonSchemaFileReference,
} from './utils';
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
  return existing && isDeepStrictEqual(existing.schema, schema) ? existing : undefined;
}

function getJsonSchemaValidator({
  renderedValue,
  assertion,
  assertionValueContext,
}: Pick<AssertionParams, 'renderedValue' | 'assertion' | 'assertionValueContext'>):
  | { validate: ValidateFunction }
  | { failure: GradingResult } {
  try {
    const ajv = getAjv();
    const snapshot = getJsonSchemaFileSnapshot(assertion);
    let schema: unknown = renderedValue;
    let staticSource: string | undefined;

    if (snapshot) {
      if ('error' in snapshot) {
        throw new JsonSchemaConfigurationError(snapshot.error);
      }
      if (snapshot.format === 'text') {
        schema = yaml.load(String(renderedValue));
        staticSource = `${snapshot.source}\0${String(renderedValue)}`;
        if (schema === undefined || schema === null) {
          throw new JsonSchemaConfigurationError(
            `${assertion.type} schema file must contain an object or boolean schema`,
          );
        }
      } else {
        schema = snapshot.schema;
        staticSource = snapshot.source;
      }
      const cached = getCachedStaticValidator(ajv, assertion, staticSource);
      if (cached) {
        return { validate: cached };
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
            loadedSnapshot.error === 'schema file must contain an object or boolean schema'
              ? `${assertion.type} schema file must contain an object or boolean schema`
              : loadedSnapshot.error,
          );
        }
        if (loadedSnapshot.format === 'text') {
          const renderedSchema = nunjucks.renderString(
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
          return { validate: cached };
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
      if (staticSource) {
        cacheStaticValidator(ajv, assertion, staticSource, cachedBySchemaId);
      }
      return { validate: cachedBySchemaId };
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
    if (staticSource) {
      cacheStaticValidator(ajv, assertion, staticSource, validate);
    }
    return { validate };
  } catch (error) {
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
    const valid = validate(parsedJson);
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
      const valid = validate(jsonObject);
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
