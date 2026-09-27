// Shared OpenAPI parsing helpers for the provider and redteam setup CLIs.

export class OpenApiInputError extends Error {}

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete']);
export const PROMPT_FIELDS = new Set([
  'message',
  'prompt',
  'q',
  'query',
  'question',
  'input',
  'text',
]);

// Parameters with these names (or these suffixes) are treated as credentials
// even when they are modeled as plain header/query/cookie parameters rather
// than as OpenAPI securitySchemes. Copying their literal `example` values into
// the generated config could leak real tokens, so the helper forces
// `{{env.<UPPER_NAME>}}` placeholders for them instead.
const CREDENTIAL_PARAM_NAMES = new Set([
  'authorization',
  'bearer',
  'token',
  'access_token',
  'auth_token',
  'api_key',
  'apikey',
  'x_api_key',
  'x_auth_token',
  'x_access_token',
  'secret',
  'password',
  'csrf_token',
  'xsrf_token',
  'session',
  'sessionid',
  'session_id',
  'sid',
]);
const CREDENTIAL_SUFFIX_REGEX =
  /(^|_)(api_key|apikey|auth_token|access_token|bearer|password|secret|token|authorization)$/;

export function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || value === undefined) {
      throw new OpenApiInputError(`Invalid argument near ${key ?? '<end>'}`);
    }
    args[key.slice(2)] = value;
  }
  return args;
}

export function asRecord(value, context) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new OpenApiInputError(`${context} must be an object`);
  }
  return value;
}

export function resolveRef(document, schema, seen = new Set()) {
  if (!schema?.$ref) {
    return schema;
  }
  if (!schema.$ref.startsWith('#/')) {
    throw new OpenApiInputError(`Only local OpenAPI refs are supported: ${schema.$ref}`);
  }
  if (seen.has(schema.$ref)) {
    throw new OpenApiInputError(`Circular OpenAPI ref detected: ${schema.$ref}`);
  }
  const activeRefs = new Set(seen);
  activeRefs.add(schema.$ref);
  const parts = schema.$ref
    .replace(/^#\//, '')
    .split('/')
    .map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'));
  let current = document;
  for (const part of parts) {
    const currentRecord = asRecord(current, schema.$ref);
    if (!(part in currentRecord)) {
      throw new OpenApiInputError(`OpenAPI ref not found: ${schema.$ref}`);
    }
    current = currentRecord[part];
  }
  return resolveRef(document, current, activeRefs);
}

export function getJsonMediaEntry(document, content) {
  const contentRecord = asRecord(content || {}, 'content');
  const exactJson = contentRecord['application/json'];
  const entry = exactJson
    ? ['application/json', exactJson]
    : Object.entries(contentRecord).find(([mediaType]) => isJsonMediaType(mediaType));
  return entry
    ? { mediaType: entry[0], media: asRecord(resolveRef(document, entry[1]), entry[0]) }
    : undefined;
}

export function getRequestMediaEntry(document, content) {
  const contentRecord = asRecord(content || {}, 'content');
  const jsonEntry = getJsonMediaEntry(document, contentRecord);
  if (jsonEntry) {
    return jsonEntry;
  }
  const formEntry = Object.entries(contentRecord).find(([mediaType]) =>
    isFormUrlEncodedMediaType(mediaType),
  );
  if (formEntry) {
    return {
      mediaType: formEntry[0],
      media: asRecord(resolveRef(document, formEntry[1]), formEntry[0]),
    };
  }
  const multipartEntry = Object.entries(contentRecord).find(([mediaType]) =>
    isMultipartMediaType(mediaType),
  );
  if (multipartEntry) {
    return {
      mediaType: multipartEntry[0],
      media: asRecord(resolveRef(document, multipartEntry[1]), multipartEntry[0]),
    };
  }
  const textEntry = Object.entries(contentRecord).find(([mediaType]) => isTextMediaType(mediaType));
  return textEntry
    ? { mediaType: textEntry[0], media: asRecord(resolveRef(document, textEntry[1]), textEntry[0]) }
    : undefined;
}

function isJsonMediaType(mediaType) {
  const normalized = mediaType.split(';', 1)[0].trim().toLowerCase();
  return (
    normalized === 'application/json' ||
    normalized.endsWith('/json') ||
    normalized.endsWith('+json')
  );
}

export function isFormUrlEncodedMediaType(mediaType) {
  return mediaType.split(';', 1)[0].trim().toLowerCase() === 'application/x-www-form-urlencoded';
}

export function isMultipartMediaType(mediaType) {
  return mediaType.split(';', 1)[0].trim().toLowerCase() === 'multipart/form-data';
}

export function isTextMediaType(mediaType) {
  return mediaType.split(';', 1)[0].trim().toLowerCase().startsWith('text/');
}

export function schemaFromMedia(document, media) {
  return media?.schema ? resolveRef(document, media.schema) : undefined;
}

export function findOperation(document, operationId) {
  const paths = asRecord(document.paths, 'paths');
  for (const [pathTemplate, pathItem] of Object.entries(paths)) {
    const pathItemRecord = asRecord(pathItem, pathTemplate);
    for (const [method, operation] of Object.entries(pathItemRecord)) {
      if (
        HTTP_METHODS.has(method) &&
        asRecord(operation, `${method} ${pathTemplate}`).operationId === operationId
      ) {
        return {
          pathTemplate,
          pathItem: pathItemRecord,
          method: method.toUpperCase(),
          operation: asRecord(operation, operationId),
        };
      }
    }
  }
  throw new OpenApiInputError(`Operation not found: ${operationId}`);
}

export function effectiveParameters(document, pathItem, operation) {
  const parameters = [
    ...(Array.isArray(pathItem.parameters) ? pathItem.parameters : []),
    ...(Array.isArray(operation.parameters) ? operation.parameters : []),
  ].map((parameter) => asRecord(resolveRef(document, parameter), 'parameter'));
  const byLocationAndName = new Map();
  for (const parameter of parameters) {
    byLocationAndName.set(`${parameter.in}:${parameter.name}`, parameter);
  }
  return [...byLocationAndName.values()];
}

export function schemaProperties(document, schema) {
  const resolved = asRecord(resolveRef(document, schema || { type: 'object' }), 'schema');
  const variantProperties = schemaVariant(resolved)
    ? schemaProperties(document, schemaVariant(resolved))
    : {};
  const allOfProperties = Array.isArray(resolved.allOf)
    ? Object.assign({}, ...resolved.allOf.map((part) => schemaProperties(document, part)))
    : {};
  return {
    ...variantProperties,
    ...allOfProperties,
    ...asRecord(resolved.properties || {}, 'schema.properties'),
  };
}

function schemaRequired(document, schema) {
  const resolved = asRecord(resolveRef(document, schema || { type: 'object' }), 'schema');
  const variantRequired = schemaVariant(resolved)
    ? schemaRequired(document, schemaVariant(resolved))
    : [];
  const allOfRequired = Array.isArray(resolved.allOf)
    ? resolved.allOf.flatMap((part) => schemaRequired(document, part))
    : [];
  const required = Array.isArray(resolved.required) ? resolved.required : [];
  return [...new Set([...variantRequired, ...allOfRequired, ...required])];
}

export function schemaVariant(schema) {
  if (Array.isArray(schema.oneOf) && schema.oneOf.length > 0) {
    return schema.oneOf[0];
  }
  if (Array.isArray(schema.anyOf) && schema.anyOf.length > 0) {
    return schema.anyOf[0];
  }
  return undefined;
}

export function schemaType(schema) {
  if (Array.isArray(schema.type)) {
    return schema.type.find((type) => type !== 'null');
  }
  if (schema.type) {
    return schema.type;
  }
  if (schema.properties) {
    return 'object';
  }
  if (schema.items) {
    return 'array';
  }
  return undefined;
}

export function isScalarSchema(document, schema) {
  if (!schema || typeof schema !== 'object') {
    return false;
  }
  const resolved = asRecord(resolveRef(document, schema), 'schema');
  const variant = schemaVariant(resolved);
  if (variant) {
    return isScalarSchema(document, variant);
  }
  const type = schemaType(resolved);
  return ['boolean', 'integer', 'number', 'string'].includes(type);
}

export function schemaArrayItems(document, schema) {
  if (!schema || typeof schema !== 'object') {
    return undefined;
  }
  const resolved = asRecord(resolveRef(document, schema), 'schema');
  const variant = schemaVariant(resolved);
  if (variant) {
    return schemaArrayItems(document, variant);
  }
  if (Array.isArray(resolved.allOf)) {
    for (const part of resolved.allOf) {
      const items = schemaArrayItems(document, part);
      if (items) {
        return items;
      }
    }
  }
  return schemaType(resolved) === 'array' ? resolveRef(document, resolved.items || {}) : undefined;
}

export function stringSample(schema, name) {
  const format = typeof schema.format === 'string' ? schema.format.toLowerCase() : '';
  if (format === 'email' || name.endsWith('_email') || name === 'email') {
    return 'user@example.com';
  }
  if (format === 'uuid') {
    return '00000000-0000-4000-8000-000000000000';
  }
  if (format === 'uri' || format === 'url' || format === 'uri-reference') {
    return 'https://example.test/resource';
  }
  if (format === 'date-time') {
    return '2026-04-17T00:00:00Z';
  }
  if (format === 'date') {
    return '2026-04-17';
  }
  if (format === 'time') {
    return '12:00:00';
  }
  return sampleValue(name);
}

export function orderedProperties(document, schema) {
  const resolved = asRecord(schema || { type: 'object' }, 'schema');
  const properties = schemaProperties(document, resolved);
  const required = schemaRequired(document, resolved);
  return [...required, ...Object.keys(properties).filter((name) => !required.includes(name))];
}

function schemaHasFlag(document, schema, flag) {
  if (!schema || typeof schema !== 'object') {
    return false;
  }
  const resolved = asRecord(resolveRef(document, schema), 'schema');
  if (resolved[flag] === true) {
    return true;
  }
  const variant = schemaVariant(resolved);
  if (variant && schemaHasFlag(document, variant, flag)) {
    return true;
  }
  return Array.isArray(resolved.allOf)
    ? resolved.allOf.some((part) => schemaHasFlag(document, part, flag))
    : false;
}

export function isReadOnlySchema(document, schema) {
  return schemaHasFlag(document, schema, 'readOnly');
}

function isWriteOnlySchema(document, schema) {
  return schemaHasFlag(document, schema, 'writeOnly');
}

export function isMultipartFileSchema(document, schema) {
  if (!schema || typeof schema !== 'object') {
    return false;
  }
  const resolved = asRecord(resolveRef(document, schema), 'schema');
  const variant = schemaVariant(resolved);
  if (variant && isMultipartFileSchema(document, variant)) {
    return true;
  }
  if (
    Array.isArray(resolved.allOf) &&
    resolved.allOf.some((part) => isMultipartFileSchema(document, part))
  ) {
    return true;
  }
  const type = schemaType(resolved);
  const format = typeof resolved.format === 'string' ? resolved.format.toLowerCase() : '';
  if (type === 'array') {
    return isMultipartFileSchema(document, resolved.items);
  }
  return type === 'string' && ['binary', 'base64'].includes(format);
}

export function responseOutputField(document, properties) {
  const responseProperties = Object.fromEntries(
    Object.entries(properties).filter(([_name, schema]) => !isWriteOnlySchema(document, schema)),
  );
  for (const candidate of [
    'output',
    'answer',
    'response',
    'result',
    'text',
    'content',
    'message',
  ]) {
    if (candidate in responseProperties) {
      return candidate;
    }
  }
  return Object.keys(responseProperties)[0];
}

export function successResponse(document, operation) {
  const responses = asRecord(operation.responses || {}, 'responses');
  const status = responses['200']
    ? '200'
    : Object.keys(responses)
        .filter((candidate) => /^2\d\d$/.test(candidate))
        .sort()[0];
  return {
    status,
    response: status
      ? asRecord(resolveRef(document, responses[status]), `responses.${status}`)
      : {},
  };
}

export function sampleValue(name) {
  if (PROMPT_FIELDS.has(name)) {
    return 'Say exactly PONG.';
  }
  if (name.endsWith('_id')) {
    return `sample-${name.replaceAll('_', '-')}`;
  }
  return `sample-${name}`;
}

export function isPlainRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function firstExample(document, examples) {
  if (Array.isArray(examples) && examples.length > 0) {
    return examples[0];
  }
  if (!isPlainRecord(examples)) {
    return undefined;
  }
  const first = Object.values(examples)[0];
  if (!isPlainRecord(first)) {
    return undefined;
  }
  const resolved = resolveRef(document, first);
  return isPlainRecord(resolved) && 'value' in resolved ? resolved.value : undefined;
}

export function objectSample(document, object, context) {
  if (!isPlainRecord(object)) {
    return undefined;
  }
  const resolved = asRecord(resolveRef(document, object), context);
  if ('example' in resolved && resolved.example !== null) {
    return resolved.example;
  }
  return firstExample(document, resolved.examples);
}

export function varName(name) {
  return name
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replaceAll(/[^A-Za-z0-9_]/g, '_')
    .replace(/^(\d)/, '_$1')
    .toLowerCase();
}

export function isCredentialParamName(name) {
  const normalized = varName(name);
  return CREDENTIAL_PARAM_NAMES.has(normalized) || CREDENTIAL_SUFFIX_REGEX.test(normalized);
}

function authFromScheme(scheme) {
  if (scheme.type === 'apiKey' && typeof scheme.name === 'string') {
    if (scheme.in === 'header') {
      return { location: 'header', name: scheme.name, prefix: 'none' };
    }
    if (scheme.in === 'query') {
      return { location: 'query', name: scheme.name, prefix: 'none' };
    }
    if (scheme.in === 'cookie') {
      return { location: 'cookie', name: scheme.name, prefix: 'none' };
    }
  }
  if (scheme.type === 'http' && typeof scheme.scheme === 'string') {
    const httpScheme = scheme.scheme.toLowerCase();
    if (httpScheme === 'bearer') {
      return { location: 'header', name: 'Authorization', prefix: 'Bearer' };
    }
    if (httpScheme === 'basic') {
      return { location: 'header', name: 'Authorization', prefix: 'Basic' };
    }
  }
  if (scheme.type === 'oauth2' || scheme.type === 'openIdConnect') {
    return { location: 'header', name: 'Authorization', prefix: 'Bearer' };
  }
  return undefined;
}

function inferAuths(document, operation) {
  const components = asRecord(document.components || {}, 'components');
  const securitySchemes = asRecord(components.securitySchemes || {}, 'components.securitySchemes');
  const hasOperationSecurity = Array.isArray(operation.security);
  const hasDocumentSecurity = Array.isArray(document.security);
  const securityRequirements = hasOperationSecurity
    ? operation.security
    : hasDocumentSecurity
      ? document.security
      : undefined;

  if (!securityRequirements) {
    return undefined;
  }
  if (securityRequirements.length === 0) {
    return [];
  }

  let partiallySupportedAuths;
  for (const requirement of securityRequirements) {
    const requirementRecord = asRecord(requirement, 'security requirement');
    const requirementNames = Object.keys(requirementRecord);
    if (requirementNames.length === 0) {
      return [];
    }
    const auths = [];
    for (const name of requirementNames) {
      if (!(name in securitySchemes)) {
        continue;
      }
      const scheme = asRecord(
        resolveRef(document, securitySchemes[name]),
        `securitySchemes.${name}`,
      );
      const auth = authFromScheme(scheme);
      if (!auth) {
        continue;
      }
      auths.push(auth);
    }
    if (auths.length === requirementNames.length) {
      return auths;
    }
    if (auths.length > 0 && !partiallySupportedAuths) {
      partiallySupportedAuths = auths;
    }
  }

  return partiallySupportedAuths ?? [];
}

export function authValue(tokenEnv, prefix) {
  return prefix === 'none' ? `{{env.${tokenEnv}}}` : `${prefix} {{env.${tokenEnv}}}`;
}

export function appendCookieHeader(headers, name, value) {
  const cookie = `${name}=${value}`;
  headers.Cookie = headers.Cookie ? `${headers.Cookie}; ${cookie}` : cookie;
}

export function authConfigs(args, document, operation) {
  if (args['auth-header']) {
    const prefix = args['auth-prefix'] ?? 'Bearer';
    return {
      auths: [{ location: 'header', name: args['auth-header'], prefix }],
    };
  }
  const inferred = inferAuths(document, operation);
  const auths =
    inferred === undefined
      ? [{ location: 'header', name: 'Authorization', prefix: 'Bearer' }]
      : inferred;
  return {
    auths: auths.map((auth) => ({
      ...auth,
      // --auth-prefix only overrides schemes that already carry a prefix (Bearer/Basic/etc.);
      // API-key-style auths with prefix 'none' stay untouched so the emitted header value is raw.
      prefix: args['auth-prefix'] && auth.prefix !== 'none' ? args['auth-prefix'] : auth.prefix,
    })),
  };
}
