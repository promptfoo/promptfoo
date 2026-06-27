import yaml from 'js-yaml';
import { getJsonSchemaFileSnapshot } from '../util/file';
import { extractJsonObjects, getAjv } from '../util/json';
import { processFileReference } from './utils';
import type { ValidateFunction } from 'ajv';

import type { Assertion, AssertionParams, GradingResult } from '../types/index';

const staticFileValidatorCache = new WeakMap<
  object,
  WeakMap<Assertion, { source: string; validate: ValidateFunction }>
>();
const schemaIdValidatorCache = new WeakMap<
  object,
  Map<string, { serializedSchema: string; validate: ValidateFunction }>
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

function getSchemaIdCacheKey(
  schema: object | boolean,
): { id: string; serializedSchema: string } | undefined {
  if (
    typeof schema !== 'object' ||
    schema === null ||
    !('$id' in schema) ||
    typeof schema.$id !== 'string'
  ) {
    return undefined;
  }
  try {
    const serializedSchema = JSON.stringify(schema);
    return serializedSchema === undefined ? undefined : { id: schema.$id, serializedSchema };
  } catch {
    return undefined;
  }
}

function getCachedSchemaIdValidator(
  ajv: object,
  schemaKey: { id: string; serializedSchema: string },
): ValidateFunction | undefined {
  const cached = schemaIdValidatorCache.get(ajv)?.get(schemaKey.id);
  return cached?.serializedSchema === schemaKey.serializedSchema ? cached.validate : undefined;
}

function cacheSchemaIdValidator(
  ajv: object,
  schemaKey: { id: string; serializedSchema: string },
  validate: ValidateFunction,
): void {
  let cache = schemaIdValidatorCache.get(ajv);
  if (!cache) {
    cache = new Map();
    schemaIdValidatorCache.set(ajv, cache);
  }
  cache.set(schemaKey.id, { serializedSchema: schemaKey.serializedSchema, validate });
}

function getJsonSchemaValidator({
  renderedValue,
  assertion,
}: Pick<AssertionParams, 'renderedValue' | 'assertion'>):
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
        staticSource = renderedValue;
        const cached = getCachedStaticValidator(ajv, assertion, staticSource);
        if (cached) {
          return { validate: cached };
        }
        try {
          schema = processFileReference(renderedValue);
        } catch (error) {
          if (error instanceof yaml.YAMLException) {
            throw error;
          }
          const code = (error as NodeJS.ErrnoException).code;
          throw new JsonSchemaConfigurationError(
            code === 'ENOENT'
              ? 'schema file not found'
              : error instanceof Error && error.message.startsWith('Unsupported file type:')
                ? 'unsupported schema file type'
                : 'schema file could not be loaded',
          );
        }
        if (typeof schema === 'string' && renderedValue.endsWith('.txt')) {
          schema = yaml.load(schema);
        }
        if (schema === undefined || schema === null) {
          throw new JsonSchemaConfigurationError(
            `${assertion.type} schema file must contain an object or boolean schema`,
          );
        }
      } else {
        schema = yaml.load(renderedValue);
      }
    }

    if (schema === null || (typeof schema !== 'boolean' && typeof schema !== 'object')) {
      throw new JsonSchemaConfigurationError(
        `${assertion.type} schema must resolve to an object or boolean`,
      );
    }

    const compilableSchema = schema as object | boolean;
    const schemaKey = getSchemaIdCacheKey(compilableSchema);
    const cachedBySchemaId = schemaKey ? getCachedSchemaIdValidator(ajv, schemaKey) : undefined;
    if (cachedBySchemaId) {
      if (staticSource) {
        cacheStaticValidator(ajv, assertion, staticSource, cachedBySchemaId);
      }
      return { validate: cachedBySchemaId };
    }

    const validate = ajv.compile(compilableSchema);
    if (schemaKey) {
      cacheSchemaIdValidator(ajv, schemaKey, validate);
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
