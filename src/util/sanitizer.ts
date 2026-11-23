/**
 * Generic utility functions for sanitizing objects to prevent logging of secrets and credentials
 * Uses a custom recursive approach for reliable deep object sanitization.
 */
import Ajv from 'ajv';
import deepEqual from 'fast-deep-equal';
import safeStringify from 'fast-safe-stringify';
import { GRADING_PROVIDER_TYPE_KEYS, isProviderTypeMap } from './gradingProvider';
import { escapeRegExp } from './text';
import { loadYaml } from './yamlLoad';

import type { EvalRuntimeOptions, UnifiedConfig } from '../types';

const MAX_DEPTH = 4;
const DUMMY_BASE = 'http://placeholder';
const URL_REFERENCE = /^(?:[a-z][a-z0-9+.-]*:\/\/|\/[^?#]*[?#])/i;

export const REDACTED = '[REDACTED]';

const OPAQUE_CREDENTIAL_PATH_SEGMENT =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{32,}|(?:token|key|secret|credential|auth)[-_][a-z0-9._-]{8,}|eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+)$/i;

/**
 * Whether a `scheme://user@host` username or password is present. Implemented
 * with plain string scans rather than a regex to avoid polynomial backtracking
 * on adversarial input (e.g. `://:::::…`).
 */
function hasUrlUserinfo(url: string): boolean {
  const schemeIndex = url.indexOf('://');
  if (schemeIndex === -1) {
    return false;
  }
  const authorityStart = schemeIndex + 3;
  let authorityEnd = url.length;
  for (let i = authorityStart; i < url.length; i++) {
    const char = url[i];
    if (char === '/' || char === '?' || char === '#') {
      authorityEnd = i;
      break;
    }
  }
  const authority = url.slice(authorityStart, authorityEnd);
  const atIndex = authority.indexOf('@');
  return atIndex > 0;
}

function isSecretParameterName(name: string): boolean {
  const normalized = normalizeFieldName(name);
  if (normalized === 'key') {
    return true;
  }
  if (
    /^(?:eos|bos|pad|unk|mask|sep|cls|stop|start|end|next|prev|page|nextpage|continuation|resume|cursor|max|min)tokens?$/.test(
      normalized,
    ) ||
    /(?:version|type|enabled)$/.test(normalized)
  ) {
    return false;
  }
  if (isSecretField(name) || name.split(/[-_\s=]+/).some(isSecretField)) {
    return true;
  }

  // Check credential compounds, including lowercase suffixes, camelCase and numeric versions.
  const words = name
    .replace(/(value|hash|encrypted)$/i, '_$1')
    .replace(/v?\d+/gi, '_')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .split(/[-_\s=]+/);
  let prefix = '';
  return words.some((word) => {
    prefix += word.toLowerCase();
    return SECRET_PARAMETER_NAMES.some(
      (secret) => prefix === secret || (secret.length > 3 && prefix.endsWith(secret)),
    );
  });
}

function isSecretParameter(name: string, value: string | undefined): boolean {
  // Boolean controls such as includeCredentials are settings, not credential values.
  if (
    /^(?:true|false)$/i.test(value ?? '') &&
    /(?:^|[.\[])(?:include|require|use|with|enable|disable)(?:[a-z]|[_-])[^.\[\]]*\]?$/i.test(name)
  ) {
    return false;
  }
  return name.split(/[.\[\]]+/).some(isSecretParameterName);
}

/**
 * Whether any `key=value` segment carries a credential — by a secret-looking
 * value or a secret-named key. Splits on every URL pair delimiter (`? & ; #`),
 * so it catches credentials the WHATWG URL parser does not isolate: values under
 * a benign name in a malformed URL, and `;`-separated query pairs (URLSearchParams
 * only splits on `&`). Linear: a single split plus per-segment checks.
 */
function hasSecretFormSegment(text: string): boolean {
  for (const segment of text.split(/[?&;#]/)) {
    const equalsIndex = segment.indexOf('=');
    if (equalsIndex <= 0) {
      continue;
    }
    const rawValue = segment.slice(equalsIndex + 1);
    if (!rawValue) {
      continue;
    }
    const decodedValue = decodeFormComponent(rawValue);
    if (
      looksLikeSecret(rawValue) ||
      (decodedValue !== undefined && looksLikeSecret(decodedValue))
    ) {
      return true;
    }
    const rawKey = segment.slice(0, equalsIndex);
    const key = decodeFormComponent(rawKey) ?? rawKey;
    if (isSecretParameter(key, decodedValue)) {
      return true;
    }
  }
  return false;
}

/**
 * Whether an unparseable URL string plausibly carries a credential. Used to keep
 * sanitizeUrl fail-closed for credential-bearing junk while preserving ordinary
 * non-URL strings (bare domains, relative paths, prose), which also flow through
 * sanitizeObject for any field literally named `url` and would otherwise be
 * destroyed in persisted eval results.
 *
 * Detection is structural — URL userinfo, a whole value that
 * looks like a secret, or a `key=value` form segment that carries one. We do NOT
 * fail closed on a bare credential keyword appearing anywhere in the string:
 * substring-matching `token`/`secret`/`sig`/etc. redacts benign values such as
 * `my-tokenizer-model`, `secrets/config.yaml`, or `design-system` (contains `sig`),
 * which is data loss with no corresponding leak. Genuine credential shapes all
 * carry one of the structural markers above (the secret-named-key case is covered
 * by `hasSecretFormSegment`, which normalizes keys like `api_key` before matching).
 */
function unparseableUrlMightLeakSecret(url: string): boolean {
  return hasUrlUserinfo(url) || looksLikeSecret(url.trim()) || hasSecretFormSegment(url);
}

/**
 * Set of field names that should be redacted (case-insensitive, with hyphens/underscores normalized)
 * Note: Keys are stored in their normalized form (lowercase, no hyphens/underscores)
 */
export const SECRET_FIELD_NAMES = new Set([
  // Password variants
  'password',
  'passwd',
  'pwd',

  // Secret variants
  'secret',
  'secrets',
  'secretkey',
  'credentials',

  // API keys and tokens
  'apikey',
  'apisecret',
  'token',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'bearertoken',
  'authtoken',
  'clientsecret',
  'webhooksecret',
  'anthropicapikey',
  'awsbearertokenbedrock',
  'azurestorageconnectionstring',

  // AWS SigV4 credentials. Both spellings are needed: normalizeFieldName strips
  // underscores, so the env var AWS_SECRET_ACCESS_KEY collapses to
  // 'awssecretaccesskey' while the documented provider config field
  // `secretAccessKey` collapses to 'secretaccesskey'. These are first-class,
  // documented Bedrock config fields (see site/docs/providers/aws-bedrock.md),
  // so an inline credential otherwise reaches logs and shared configs in clear text.
  'secretaccesskey',
  'awssecretaccesskey',
  'sessiontoken',
  'awssessiontoken',
  'accesskeyid',
  'awsaccesskeyid',
  'authorization',
  'auth',
  'bearer',
  'apikeyenvar', // environment variable name for API key

  // Header-specific patterns (normalized: hyphens removed)
  'xapikey', // x-api-key
  'xauthtoken', // x-auth-token
  'xaccesstoken', // x-access-token
  'xauth', // x-auth
  'xsecret', // x-secret
  'xcsrftoken', // x-csrf-token
  // Portkey gateway credential headers. The provider derives these from `portkey*` config
  // keys, so the vendor prefix keeps them out of the generic 'apikey' match.
  'portkeyapikey', // portkeyApiKey config field
  'portkeyvirtualkey', // portkeyVirtualKey config field
  'xportkeyapikey', // x-portkey-api-key
  'xportkeyvirtualkey', // x-portkey-virtual-key
  'xportkeyawsaccesskeyid', // x-portkey-aws-access-key-id
  'xportkeyawssecretaccesskey', // x-portkey-aws-secret-access-key
  'xportkeyawssessiontoken', // x-portkey-aws-session-token
  'xsessiondata', // x-session-data
  'csrftoken', // csrf-token
  'sessionid', // session-id
  'session', // session
  'cookie',
  'setcookie', // set-cookie

  // Certificate and encryption
  'certificatepassword',
  'keystorepassword',
  'pfxpassword',
  'privatekey',
  'certkey',
  'encryptionkey',
  'signingkey',
  'signature',
  'sig',
  'passphrase',
  'certificatecontent',
  'keystorecontent',
  'pfx',
  'pfxcontent',
  'keycontent',
  'certcontent',
]);

// Ambiguous names need a complete segment match: oauth/useSession/sameSiteCookie are settings.
const SECRET_PARAMETER_NAMES = [...SECRET_FIELD_NAMES, 'subscriptionkey'].filter(
  (name) => !['auth', 'session', 'cookie', 'setcookie'].includes(name),
);

/**
 * Normalize field names for comparison (lowercase, drop hyphens, underscores,
 * whitespace, and stray `=`). Whitespace covers `Api Key` and `api+key` (which
 * URL-decodes to `api key`); the `=` strip covers `api%3Dkey` (decodes to
 * `api=key`). All collapse to `apikey` and match SECRET_FIELD_NAMES.
 */
export function normalizeFieldName(fieldName: string): string {
  return fieldName.toLowerCase().replace(/[-_\s=]/g, '');
}

/**
 * Check if a field name should be redacted
 */
export function isSecretField(fieldName: string): boolean {
  return SECRET_FIELD_NAMES.has(normalizeFieldName(fieldName));
}

/**
 * Matched as a whole `_`-delimited word only. `KEY` is short enough to sit inside ordinary
 * words — `PORTKEY_API_BASE_URL` is a documented endpoint, `MONKEY` is a word — so the
 * credential compounds that end in it are listed explicitly below instead.
 */
const ENV_SECRET_WHOLE_WORDS = new Set(['KEY']);

/**
 * Matched as a whole word *or* a suffix, so fused vendor spellings are caught:
 * `PGPASSWORD`, `GCP_PRIVATEKEY`, `DBPWD`, `DATABASEDSN`. Each is either long enough that a
 * suffix match is unambiguous, or (like `PWD`/`DSN`) has no ordinary-word collisions.
 *
 * Singular on purpose: `MAX_TOKENS` ends with `TOKENS`, which does not end with `TOKEN`.
 */
const ENV_SECRET_SUFFIX_WORDS = [
  'PASSWORD',
  'PASSWD',
  'PASSPHRASE',
  'CREDENTIALS',
  'CREDENTIAL',
  'SECRET',
  'TOKEN',
  'PWD',
  'DSN',
  // Every credential name in SECRET_FIELD_NAMES that ends in `key`, so a prefixed spelling
  // (`APP_ENCRYPTIONKEY`, `VENDOR_CERTKEY`) is still caught even though the exact-name match
  // cannot see past the prefix. Derived rather than hand-listed so the two stay in sync; all
  // are at least six characters, so none of them matches `PORTKEY` or `MONKEY`.
  ...[...SECRET_FIELD_NAMES].filter((name) => name.endsWith('key') && name.length > 3),
  // Not in SECRET_FIELD_NAMES on its own — that set carries `accesskeyid` — but the bare
  // compound shows up in env vars.
  'accesskey',
].map((word) => word.toUpperCase());

/**
 * Secret only as the final `_`-delimited word. `MLFLOW_BASIC_AUTH` and `NPM_CONFIG__AUTH`
 * hold a credential; `WATSONX_AI_AUTH_TYPE` names a method and `OAUTH_SCOPE` is not an
 * `AUTH` word at all.
 */
const ENV_SECRET_TERMINAL_WORDS = new Set(['AUTH']);

/**
 * An environment-variable-shaped name. Leading underscores are legal and used in practice
 * (`_GITHUB_TOKEN`), so they must not be a way around the check. Case is normalized before
 * this is applied.
 */
const ENV_VAR_NAME_RE = /^[A-Z_][A-Z0-9_]*$/;

/**
 * Check whether an environment-variable name looks credential-bearing.
 *
 * `SECRET_FIELD_NAMES` matches exact names, which can never cover the project-specific
 * names real environments use — `GITHUB_TOKEN`, `STRIPE_SECRET_KEY`, `PGPASSWORD` all
 * slip through it. An `env` map is passed straight to a subprocess, so it is the one
 * place a config is *expected* to hold credentials; treat a credential-worded key there
 * as secret.
 *
 * Case is normalized first: nothing requires an env var to be uppercase, and a lowercase
 * `github_token` reaches the subprocess exactly like `GITHUB_TOKEN` does.
 */
export function isSecretEnvVarName(name: string): boolean {
  if (isSecretField(name)) {
    return true;
  }
  const normalized = name.toUpperCase();
  if (!ENV_VAR_NAME_RE.test(normalized)) {
    return false;
  }
  const words = normalized.split('_');
  if (ENV_SECRET_TERMINAL_WORDS.has(words[words.length - 1])) {
    return true;
  }
  return words.some(
    (word) =>
      ENV_SECRET_WHOLE_WORDS.has(word) ||
      ENV_SECRET_SUFFIX_WORDS.some((secret) => word.endsWith(secret)),
  );
}

/**
 * Sanitizes runtime options to ensure only JSON-serializable data is persisted or exported.
 * Removes non-serializable fields like AbortSignal, functions, and symbols.
 */
export function sanitizeRuntimeOptions(
  options?: EvalRuntimeOptions,
): EvalRuntimeOptions | undefined {
  if (!options) {
    return undefined;
  }

  // Create a copy to avoid mutating the original options object.
  const sanitized = { ...options };

  delete sanitized.abortSignal;

  const sanitizedEntries = sanitized as Record<string, unknown>;
  for (const [key, value] of Object.entries(sanitizedEntries)) {
    if (typeof value === 'function' || typeof value === 'symbol') {
      delete sanitizedEntries[key];
    }
  }

  return sanitized;
}

/**
 * Check if a value looks like a secret based on common patterns.
 * Detects API keys, tokens, and other credential patterns.
 */
export function looksLikeSecret(value: string): boolean {
  if (typeof value !== 'string') {
    return false;
  }

  // OpenAI API keys (sk-...)
  if (/^sk-[a-zA-Z0-9-_]{20,}/.test(value)) {
    return true;
  }

  // OpenAI project keys (sk-proj-...)
  if (/^sk-proj-[a-zA-Z0-9-_]{20,}/.test(value)) {
    return true;
  }

  // Anthropic keys (sk-ant-...)
  if (/^sk-ant-[a-zA-Z0-9-_]{20,}/.test(value)) {
    return true;
  }

  // Generic API key patterns (key-...)
  if (/^key-[a-zA-Z0-9]{20,}/.test(value)) {
    return true;
  }

  // Bearer tokens
  if (/^Bearer\s+.{20,}/i.test(value)) {
    return true;
  }

  // Basic auth
  if (/^Basic\s+.{20,}/i.test(value)) {
    return true;
  }

  // AWS-style access keys (AKIA...)
  if (/^AKIA[A-Z0-9]{16}/.test(value)) {
    return true;
  }

  // Google API keys (AIza...)
  if (/^AIza[a-zA-Z0-9_-]{35}/.test(value)) {
    return true;
  }

  // Long base64-like strings (likely tokens/keys) - 64+ chars of alphanumeric
  // Using 64 chars to reduce false positives on concatenated IDs, base64 content, or long model names
  // Scan for disallowed characters without growing the regex stack for large values.
  if (value.length >= 64 && !/[^a-zA-Z0-9+/=_-]/.test(value)) {
    return true;
  }

  return false;
}

// Headers with standard non-credential meanings; other custom headers may authenticate a gateway.
const NON_CREDENTIAL_HEADERS = new Set([
  'accept',
  'content-type',
  'openai-beta',
  'openai-organization',
  'openai-project',
  'user-agent',
  'x-openai-originator',
]);

export function isNonCredentialHeader(name: string): boolean {
  return NON_CREDENTIAL_HEADERS.has(name.toLowerCase());
}

const SAFE_TRACING_CREDENTIAL_TEMPLATE =
  /^(?:(?:bearer|basic|token|api[-_]?key)\s+)?\{\{\s*env(?:\.[A-Za-z_][A-Za-z0-9_]*|\[['"][A-Za-z_][A-Za-z0-9_]*['"]\])+\s*(?:\|\s*(?:trim|urlencode)\s*)*\}\}$/i;

interface TracingCredentialReference {
  template: string;
  renderedValue: string;
}

interface TracingCredentialReferences {
  auth: Map<string, TracingCredentialReference>;
  headers: Map<string, TracingCredentialReference>;
  env: Map<string, TracingCredentialReference>;
}

const tracingCredentialReferences = new WeakMap<object, TracingCredentialReferences>();
const SAFE_TRACING_PROVIDER_HEADERS = new Set([
  'accept',
  'content-type',
  'x-org-id',
  'x-organization-id',
  'x-scope-orgid',
  'x-tenant-id',
]);

function isSafeTracingCredentialTemplate(value: unknown): value is string {
  return typeof value === 'string' && SAFE_TRACING_CREDENTIAL_TEMPLATE.test(value.trim());
}

export function isCredentialHeader(name: string, value: string): boolean {
  const normalizedName = name.replace(/[-_\s]/g, '').toLowerCase();
  // These key roles identify requests, routing, or public material rather than authenticate.
  // Exempt only name inference; credential-shaped values still take precedence below.
  const publicKeyRole =
    /^x?(?:(?:idempotency|cache|routing|partition|public)key|secwebsocketkey)$/.test(
      normalizedName,
    );
  return (
    isSecretField(normalizedName) ||
    (!publicKeyRole && normalizedName.endsWith('key')) ||
    /session(?:access|id)?$/.test(normalizedName) ||
    /(?:api|access|subscription)key|auth|token|password|passwd|secret|credential|cookie|jwt/.test(
      normalizedName,
    ) ||
    normalizedName === 'xhoneycombteam' ||
    /^(?:bearer|basic|token|api[-_]?key)\s+\S+/i.test(value.trim()) ||
    looksLikeSecret(value.trim())
  );
}

function isNonSensitiveTracingHeader(name: string, value: string): boolean {
  return SAFE_TRACING_PROVIDER_HEADERS.has(name.toLowerCase()) && !isCredentialHeader(name, value);
}

function getTracingTemplateEnvironmentVariable(template: string): string | undefined {
  if (!isSafeTracingCredentialTemplate(template)) {
    return undefined;
  }
  const match = template.match(
    /\benv(?:\.([A-Za-z_][A-Za-z0-9_]*)|\[['"]([A-Za-z_][A-Za-z0-9_]*)['"]\])/,
  );
  return match?.[1] ?? match?.[2];
}

/**
 * Retains safe credential references alongside their rendered provider without exposing
 * internal bookkeeping through config serialization or provider-visible properties.
 */
export function preserveTracingCredentialReferences(
  sourceConfig: Partial<UnifiedConfig>,
  renderedConfig: Partial<UnifiedConfig>,
): void {
  const sourceProvider = sourceConfig.tracing?.provider;
  const renderedProvider = renderedConfig.tracing?.provider;
  if (!sourceProvider || !renderedProvider) {
    return;
  }

  const references: TracingCredentialReferences = {
    auth: new Map(),
    headers: new Map(),
    env: new Map(),
  };

  for (const [key, template] of Object.entries(sourceProvider.auth ?? {})) {
    if (key !== 'token' && key !== 'password') {
      continue;
    }
    const renderedValue = Object.entries(renderedProvider.auth ?? {}).find(
      ([renderedKey]) => renderedKey === key,
    )?.[1];
    if (isSafeTracingCredentialTemplate(template) && typeof renderedValue === 'string') {
      references.auth.set(key, { template, renderedValue });
    }
  }

  for (const [name, template] of Object.entries(sourceProvider.headers ?? {})) {
    const renderedValue = renderedProvider.headers?.[name];
    if (isSafeTracingCredentialTemplate(template) && typeof renderedValue === 'string') {
      references.headers.set(name, { template, renderedValue });
    }
  }

  const credentialTemplates = [
    ...references.auth.values(),
    ...Array.from(references.headers.entries())
      .filter(([name, reference]) => !isNonSensitiveTracingHeader(name, reference.renderedValue))
      .map(([, reference]) => reference),
  ];
  const sourceEnv = sourceConfig.env as Record<string, unknown> | undefined;
  const renderedEnv = renderedConfig.env as Record<string, unknown> | undefined;
  const visitedEnvironmentVariables = new Set<string>();
  for (const { template } of credentialTemplates) {
    let name = getTracingTemplateEnvironmentVariable(template);
    while (name && !visitedEnvironmentVariables.has(name)) {
      visitedEnvironmentVariables.add(name);
      const sourceValue = sourceEnv?.[name];
      const renderedValue = renderedEnv?.[name];
      if (!isSafeTracingCredentialTemplate(sourceValue) || typeof renderedValue !== 'string') {
        break;
      }
      references.env.set(name, { template: sourceValue, renderedValue });
      name = getTracingTemplateEnvironmentVariable(sourceValue);
    }
  }

  if (references.auth.size > 0 || references.headers.size > 0) {
    tracingCredentialReferences.set(renderedProvider, references);
  }
}

function getReferencedTracingCredentialEnvironmentVariables(
  auth: Record<string, unknown> | undefined,
  headers: Record<string, string> | undefined,
  env: Record<string, unknown> | undefined,
  references: TracingCredentialReferences | undefined,
): Set<string> {
  const variables = new Set<string>();
  for (const [name, value] of Object.entries(auth ?? {})) {
    if ((name === 'token' || name === 'password') && typeof value === 'string') {
      const variable = getTracingTemplateEnvironmentVariable(value);
      if (variable) {
        variables.add(variable);
      }
    }
  }
  for (const [name, value] of Object.entries(headers ?? {})) {
    if (!isNonSensitiveTracingHeader(name, value)) {
      const variable = getTracingTemplateEnvironmentVariable(value);
      if (variable) {
        variables.add(variable);
      }
    }
  }

  for (const name of variables) {
    const value = env?.[name];
    const reference = references?.env.get(name);
    const template = isSafeTracingCredentialTemplate(value)
      ? value
      : reference && reference.renderedValue === value
        ? reference.template
        : undefined;
    const variable = template ? getTracingTemplateEnvironmentVariable(template) : undefined;
    if (variable) {
      variables.add(variable);
    }
  }

  return variables;
}

/**
 * Keeps runtime trace-provider credentials out of persisted and exported eval configs.
 * Safe environment references remain intact so resumed evaluations can resolve them again.
 */
export function sanitizeTracingConfigForPersistence(
  config: Partial<UnifiedConfig>,
): Partial<UnifiedConfig> {
  const provider = config.tracing?.provider;
  if (!provider) {
    return config;
  }

  let sanitizedEndpoint = provider.endpoint;
  try {
    const endpoint = new URL(provider.endpoint);
    if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
      endpoint.username = '';
      endpoint.password = '';
      endpoint.search = '';
      endpoint.hash = '';
      sanitizedEndpoint = endpoint.toString();
    }
    const safeEndpoint = sanitizeUrlForLogging(endpoint.toString());
    if (safeEndpoint !== endpoint.toString()) {
      sanitizedEndpoint = safeEndpoint;
    }
  } catch {
    sanitizedEndpoint = sanitizeUrl(provider.endpoint);
  }

  const references = tracingCredentialReferences.get(provider);
  const sanitizedAuth = provider.auth
    ? Object.fromEntries(
        Object.entries(provider.auth).flatMap(([key, value]) => {
          if ((key !== 'token' && key !== 'password') || isSafeTracingCredentialTemplate(value)) {
            return [[key, value]];
          }
          const reference = references?.auth.get(key);
          return reference && reference.renderedValue === value ? [[key, reference.template]] : [];
        }),
      )
    : undefined;
  const sanitizedHeaders = provider.headers
    ? Object.fromEntries(
        Object.entries(provider.headers).flatMap(([name, value]) => {
          if (typeof value !== 'string') {
            return [];
          }
          const reference = references?.headers.get(name);
          if (reference?.renderedValue === value) {
            return [[name, reference.template]];
          }
          if (isSafeTracingCredentialTemplate(value) || isNonSensitiveTracingHeader(name, value)) {
            return [[name, value]];
          }
          return [];
        }),
      )
    : undefined;
  const referencedCredentialEnvironmentVariables =
    getReferencedTracingCredentialEnvironmentVariables(
      sanitizedAuth,
      sanitizedHeaders,
      config.env as Record<string, unknown> | undefined,
      references,
    );
  const sanitizedEnv = config.env
    ? Object.fromEntries(
        Object.entries(config.env).flatMap(([name, value]) => {
          if (!referencedCredentialEnvironmentVariables.has(name)) {
            return [[name, value]];
          }
          if (isSafeTracingCredentialTemplate(value)) {
            return [[name, value]];
          }
          const reference = references?.env.get(name);
          return reference?.renderedValue === value ? [[name, reference.template]] : [];
        }),
      )
    : undefined;

  const sanitizedProvider = {
    ...provider,
    endpoint: sanitizedEndpoint,
    ...(provider.auth && { auth: sanitizedAuth }),
    ...(provider.headers && { headers: sanitizedHeaders }),
  } as typeof provider;

  return {
    ...config,
    ...(config.env && { env: sanitizedEnv }),
    tracing: {
      ...config.tracing!,
      provider: sanitizedProvider,
    },
  };
}

const PROPERTY_MAPS = new Set(['properties', 'patternProperties']);
// AJV does not change the resource scope on these JSON Pointer steps.
const POINTER_CONTAINERS = new Set([...PROPERTY_MAPS, 'enum', 'definitions', 'dependencies']);
const JSON_SCHEMA_MAP_KEYWORDS = new Set([
  '$defs',
  'definitions',
  ...PROPERTY_MAPS,
  'dependentSchemas',
  'dependencies',
  'dependentRequired',
]);
// Environment member names apply to the same instance and to elements
// of an env array, matching the traversal of literal data.
const ENV_SCHEMA_APPLICATORS = new Set([
  'allOf',
  'anyOf',
  'oneOf',
  'if',
  'then',
  'else',
  'not',
  'items',
  'prefixItems',
  'additionalItems',
  'unevaluatedItems',
  'contains',
]);
const SCHEMA_LITERALS = new Set(['const', 'default', 'enum', 'examples']);
const JSON_SCHEMA_CHILD_KEYWORDS = new Set([
  ...ENV_SCHEMA_APPLICATORS,
  'additionalProperties',
  'unevaluatedProperties',
  'propertyNames',
  'contentSchema',
]);
// These keywords describe structure or validation rules, rather than example data.
const JSON_SCHEMA_STRUCTURAL_KEYWORDS = new Set([
  '$schema',
  '$id',
  '$ref',
  '$anchor',
  '$dynamicRef',
  '$dynamicAnchor',
  '$recursiveRef',
  '$recursiveAnchor',
  '$vocabulary',
  'type',
  'format',
  'required',
  'multipleOf',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'minLength',
  'maxLength',
  'minItems',
  'maxItems',
  'uniqueItems',
  'minContains',
  'maxContains',
  'minProperties',
  'maxProperties',
  'contentEncoding',
  'contentMediaType',
  'readOnly',
  'writeOnly',
  'deprecated',
  'nullable',
]);

function isSchemaObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

const SCHEMA_REFS = new Set(['$ref', '$dynamicRef', '$recursiveRef']);
const SCHEMA_URIS = new Set(['$id', '$schema', ...SCHEMA_REFS]);

// Conservative static alternatives only. Never execute an authored regex.
// If any field is a credential, its shared constraints must be protected.
function patternMembers(pattern: string): string[] {
  return pattern
    .replace(/(?<!\\)(?:\(\?:|[()])/g, '')
    .split(/(?<!\\)\|/)
    .map(schemaPatternLiteral);
}

const SCHEMA_TOKEN_METRIC = /^token[-_\s]*(?:count|limit|budget|usage)$/i;

function credentialSchemaName(literal: string, keyword?: string, env = false): boolean {
  if (keyword === 'patternProperties') {
    return patternMembers(literal).some((name) => credentialSchemaName(name, undefined, env));
  }
  if (env && isSecretEnvVarName(literal)) {
    return true;
  }
  // A signed URL can name a public field. Its query is scrubbed from the
  // name itself; query parameters do not describe the field's value.
  const field = literal.split(/[?#]/, 1)[0].trim();
  const normalized = normalizeFieldName(field);
  if (carriesSchemaCredential(field)) {
    // "Token Secret" can both carry a value and describe a credential.
    // Check the joined label so an auth scheme alone doesn't mark its field.
    return (
      isSecretField(field) || (!/[:=]/.test(field) && isSecretParameter(normalized, undefined))
    );
  }
  if (normalized === 'key' || SCHEMA_TOKEN_METRIC.test(normalized)) {
    return false;
  }
  return (
    normalized === 'headers' ||
    isSecretParameter(field, undefined) ||
    (/^x[-_]/i.test(field) && isCredentialHeader(field, ''))
  );
}

function splitSchemaUri(uri: string): [string, string] {
  const hash = uri.indexOf('#');
  return hash === -1 ? [uri, ''] : [uri.slice(0, hash), uri.slice(hash)];
}

// AJV treats a trailing # or #/ as the resource itself. Keep the original
// spelling for output and normalize only in-document lookup.
function splitResourceUri(uri: string): [string, string] {
  return splitSchemaUri(uri.replace(/#\/?$/, ''));
}

// Resolve only in-memory IDs, with the same URI rules as validation (including URNs).
let schemaResolver: Ajv['opts']['uriResolver'] | undefined;
function schemaResourceId(path: string, base: string): string {
  if (!path) {
    return base;
  }
  schemaResolver ??= new Ajv({ meta: false }).opts.uriResolver;
  try {
    return schemaResolver.resolve(base, path);
  } catch {
    // An invalid URI cannot safely distinguish embedded and external resources.
    return REDACTED;
  }
}

function escapePointerToken(name: string): string {
  return name.replace(/~/g, '~0').replace(/\//g, '~1');
}

function pointerToken(name: string): string {
  return encodeURIComponent(escapePointerToken(name));
}

// Return both the source spelling and decoded key so unchanged tokens stay intact.
function localSchemaPointer(ref: string) {
  if (/^#%2f/i.test(ref)) {
    try {
      ref = decodeURIComponent(ref);
    } catch {
      return [{ raw: REDACTED, name: REDACTED }];
    }
  }
  if (ref === '#') {
    return [];
  }
  if (!ref.startsWith('#/')) {
    return undefined;
  }
  // Accept a literal URL at the end of a pointer as a single map key.
  ref = ref.replace(/\/([a-z][a-z0-9+.-]*:\/\/.*)$/i, (_, url) => '/' + pointerToken(url));
  return ref
    .slice(2)
    .split('/')
    .map((raw) => {
      let name = raw;
      try {
        name = decodeURIComponent(raw);
      } catch {
        // Invalid URI escapes can still contain credentials.
      }
      return { raw, name: name.replace(/~1/g, '/').replace(/~0/g, '~') };
    });
}

// Distinct resource IDs can become identical after scrubbing a query. Reserve
// existing IDs first, and suffix the document URI (never its pointer or anchor).
function sanitizedResourceQueries(ids: Iterable<string>) {
  const reserved = new Set(Array.from(ids, (id) => splitSchemaUri(id)[0]));
  const queries = new Map<string, string>();
  let next = 0;
  for (const id of Array.from(reserved)) {
    const safe = schemaResourceId(sanitizeUrl(id), DUMMY_BASE);
    if (safe === id) {
      continue;
    }
    let suffix = '';
    while (reserved.has(safe + suffix)) {
      suffix = `${safe.includes('?') ? '&' : '?'}id=${++next}`;
    }
    reserved.add(safe + suffix);
    // Relative paths and URLSearchParams can use different spellings for
    // spaces and repeated keys. Every spelling of this resource shares one query.
    const query = safe.includes('?') ? safe.slice(safe.indexOf('?')) : '';
    queries.set(id, query + suffix);
  }
  return queries;
}

// Headers, authorization schemes and key=value assignments can themselves
// be names or literals. Use the same gateway policy as provider credentials.
function carriesSchemaCredential(text: string): boolean {
  if (SCHEMA_TOKEN_METRIC.test(text)) {
    return false;
  }
  // Short Basic credentials encode a user:password pair. A label such as
  // "Basic plan" also starts with the scheme but carries no credentials.
  if (/^basic\s/i.test(text) && !looksLikeSecret(text)) {
    try {
      return atob(text.slice(6)).includes(':');
    } catch {
      return false;
    }
  }
  if (
    isCredentialHeader('', text) ||
    (looksLikeUrlEncodedFormData(text) && hasSecretFormSegment(text))
  ) {
    return true;
  }
  const separator = text.search(/[:=]/);
  if (separator < 1) {
    return false;
  }
  const name = text.slice(0, separator).trim();
  const value = text.slice(separator + 1).trim();
  return !!value && /^[a-z0-9._-]+$/i.test(name) && isCredentialHeader(name, value);
}

// Parsing JSON discards earlier duplicate keys. Keep authored whitespace only
// if the inspected representation accounts for the entire original spelling.
function projectedJsonText(text: string, parsed: unknown, safe: string): string {
  if (text === safe || JSON.stringify(parsed) !== safe) {
    return safe;
  }
  return text.replace(/\s/g, '') === safe.replace(/\s/g, '') ? text : safe;
}

// Names are identifiers, even when they look like encoded data. Preserve
// their spelling unless sanitization removes an actual credential.
function safeSchemaName(name: string): string {
  const trimmed = name.trim();
  if (trimmed !== name) {
    const safe = safeSchemaName(trimmed);
    return safe === trimmed ? name : safe;
  }
  if (name.startsWith('//')) {
    return sanitizeUrlForLogging('https:' + name).replace(/^https:/, '');
  }
  if (name.startsWith('/') || URL_REFERENCE.test(name)) {
    return sanitizeUrlForLogging(name);
  }
  if (carriesSchemaCredential(name)) {
    return REDACTED;
  }
  const parsed = jsonData(name);
  if (parsed) {
    // An encoded name is one identifier. If inspecting it as data masks
    // anything, rename it as a whole and let the name map settle collisions.
    const safe = JSON.stringify(projectStandaloneData(parsed));
    return projectedJsonText(name, parsed, safe) === name ? name : REDACTED;
  }
  // A relative URL or query can carry credentials without a scheme or slash.
  // Authored regular expressions are checked through their decoded literal names.
  return /[?#]/.test(name) && !name.startsWith('^') ? sanitizeTemplatedUrl(name) : name;
}

function renamedPattern(pattern: string, names: Map<string, string>): string | undefined {
  const members = patternMembers(pattern);
  if (!members.some((name) => names.has(name))) {
    return undefined;
  }
  const alternatives = members.map((name) => escapeRegExp(names.get(name) ?? safeSchemaName(name)));
  return alternatives.length === 1 ? `^${alternatives[0]}$` : `^(?:${alternatives.join('|')})$`;
}

function schemaPatternLiteral(pattern: string): string {
  return pattern
    .replace(/^\^|\$$/g, '')
    .replace(
      /\\(?:x([\da-fA-F]{2})|u([\da-fA-F]{4})|u\{([\da-fA-F]+)\}|([.*+?^${}()|[\]\\/-]))/g,
      (raw, hex, unicode, codePoint, punctuation) => {
        if (punctuation) {
          return punctuation;
        }
        const code = Number.parseInt(hex ?? unicode ?? codePoint, 16);
        return code <= 0x10ffff ? String.fromCodePoint(code) : raw;
      },
    );
}

function jsonData(value: unknown): unknown {
  if (typeof value === 'string' && /^\s*[[{]/.test(value)) {
    try {
      return JSON.parse(value);
    } catch {
      // Ordinary text and patterns can also start with a bracket.
    }
  }
  return undefined;
}

// Reserve literal member names too. Two individually sanitized examples can
// otherwise assign different keys to the same properties, or lose a collision.
function collectDataNames(root: unknown, names: Set<string>): void {
  const pending = [root];
  const visited = new WeakSet<object>();
  while (pending.length) {
    const value = pending.pop();
    const node = jsonData(value) ?? value;
    if (!node || typeof node !== 'object' || visited.has(node)) {
      continue;
    }
    visited.add(node);
    if (Array.isArray(node)) {
      for (const child of node) {
        pending.push(child);
      }
      continue;
    }
    for (const [key, child] of Object.entries(node)) {
      names.add(key);
      pending.push(child);
    }
  }
}

function decodeSchemaName(name: string): string {
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

// Keep generated identifiers short enough to remain public on credential routes.
const REDACTED_ID = 'id';

// Every spelling of a resource (absolute, relative or percent-encoded)
// shares the same path names. Queries and fragments have their own syntax.
function projectPath(path: string, project: (name: string, sensitive: boolean) => string): string {
  const query = path.indexOf('?');
  const prefix = query < 0 ? path : path.slice(0, query);
  let previous = '';
  const safe = prefix.replace(/[^/:]+/g, (token) => {
    const name = decodeSchemaName(token);
    const replacement = project(name, isCredentialPathSegment(token, previous));
    previous = token;
    return replacement === name ? token : encodeURIComponent(replacement);
  });
  return safe + path.slice(prefix.length);
}

function schemaIdentifiers(uris: Iterable<string>) {
  const identifiers = new Set<string>();
  const sensitive = new Set<string>();
  for (const uri of uris) {
    const [path, fragment] = splitSchemaUri(uri);
    projectPath(path, (name, credential) => {
      identifiers.add(name);
      if (credential) {
        sensitive.add(name);
      }
      return name;
    });
    if (fragment && !localSchemaPointer(fragment)) {
      identifiers.add(decodeSchemaName(fragment.slice(1)));
    }
  }
  return { identifiers, sensitive };
}

function schemaNames(
  root: unknown,
  ids: Iterable<string>,
  names: Set<string>,
  patternKeys: Set<string>,
  diagnostics?: SchemaDiagnostics,
) {
  collectDataNames(root, names);
  for (const pattern of patternKeys) {
    for (const name of patternMembers(pattern)) {
      names.add(name);
    }
  }
  // Path segments and anchors require names valid in a URI, even if the
  // same name also occurs in a property or example.
  const { identifiers, sensitive } = schemaIdentifiers(ids);
  for (const name of identifiers) {
    names.add(name);
  }
  const renamed = new Map<string, string>();
  let suffix = 0;
  for (const name of Array.from(names)) {
    const safe = sensitive.has(name) ? REDACTED_ID : safeSchemaName(name);
    if (safe === name) {
      continue;
    }
    const identifier = identifiers.has(name);
    let unique = identifier ? REDACTED_ID : safe;
    while (names.has(unique)) {
      unique = (identifier ? REDACTED_ID : `${safe}#`) + ++suffix;
    }
    names.add(unique);
    renamed.set(name, unique);
    diagnostics?.names.set(name, unique);
  }
  // A regex key must match the renamed literal, never a character class.
  // Keep its pointer spelling separate from a property with the same raw key.
  const patterns = new Map<string, string>();
  for (const pattern of patternKeys) {
    let safe = renamedPattern(pattern, renamed);
    if (safe === undefined) {
      continue;
    }
    while (names.has(safe)) {
      safe = `(?:${safe})`;
    }
    names.add(safe);
    patterns.set(pattern, safe);
    diagnostics?.recordPattern(pattern, safe);
    if (!renamed.has(pattern)) {
      renamed.set(pattern, safe);
      diagnostics?.names.set(pattern, safe);
    }
  }
  return { renamed, patterns };
}

function indexSchema(root: unknown, diagnostics?: SchemaDiagnostics) {
  const names = new Set<string>();
  const patternKeys = new Set<string>();
  const annotations = new Set<object>();
  const environments = new Set<Record<string, unknown>>();
  const booleanTargets = new Map<object, Set<string>>();
  const references: { value: string; base: string; schema: object; keyword: string }[] = [];
  const ids = new Map<string, object | null>();
  const uris = new Set<string>();
  const scopes = new WeakMap<object, string>();
  const pending: unknown[] = [];

  function register(id: string, schema: object) {
    // Don't pick one of several conflicting IDs or anchors.
    uris.add(id);
    ids.set(id, ids.has(id) && ids.get(id) !== schema ? null : schema);
  }

  function collectNames(value: unknown) {
    if (Array.isArray(value)) {
      for (const name of value) {
        if (typeof name === 'string') {
          names.add(name);
        }
      }
    }
  }

  function indexResource(schema: Record<string, unknown>, base: string): string {
    if (typeof schema.$id === 'string') {
      const [path, fragment] = splitResourceUri(schema.$id);
      base = schemaResourceId(path, base);
      register(base + fragment, schema);
    }
    if (schema === root) {
      register(base, schema);
    }
    for (const anchor of [schema.$anchor, schema.$dynamicAnchor]) {
      if (typeof anchor === 'string') {
        register(`${base}#${anchor}`, schema);
      }
    }
    collectNames(schema.required);
    scopes.set(schema, base);
    diagnostics?.includeSchema();
    return base;
  }

  // AJV also discovers resource declarations under extension keywords. Plain
  // annotation data remains data unless an ID or pointer designates a schema.
  function collectExtension(value: unknown, base: string, credential: boolean): void {
    if (!isSchemaObject(value) || scopes.has(value)) {
      return;
    }
    if (value.$id || value.$anchor || value.$dynamicAnchor) {
      annotations.add(value);
      if (credential) {
        pending.push(value);
      }
      collect(value, base);
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      collectExtension(child, base, credential || credentialSchemaName(key));
    }
  }

  // Index subschemas before following references, so declaration order doesn't matter.
  function collect(schema: unknown, parent: string): void {
    if (!isSchemaObject(schema) || scopes.has(schema)) {
      return;
    }
    const base = indexResource(schema, parent);
    for (const [keyword, value] of Object.entries(schema)) {
      if (SCHEMA_REFS.has(keyword) && typeof value === 'string') {
        references.push({ value, base, schema, keyword });
      } else if (JSON_SCHEMA_CHILD_KEYWORDS.has(keyword)) {
        for (const child of Array.isArray(value) ? value : [value]) {
          collect(child, base);
        }
      } else if (JSON_SCHEMA_MAP_KEYWORDS.has(keyword) && isSchemaObject(value)) {
        collectMap(value, keyword, base);
      } else if (keyword !== 'const' && keyword !== 'default') {
        collectExtension(value, base, credentialSchemaName(keyword));
      }
    }
  }

  function collectMap(
    map: Record<string, unknown>,
    keyword: string,
    base: string,
    env = false,
  ): void {
    for (const [name, child] of Object.entries(map)) {
      names.add(name);
      if (keyword === 'patternProperties') {
        patternKeys.add(name);
      }
      if (keyword === 'dependencies' || keyword === 'dependentRequired') {
        collectNames(child);
      }
      if (credentialSchemaName(name, keyword, env)) {
        pending.push(child);
      }
      if (
        (keyword === 'properties' && name === 'env') ||
        (keyword === 'patternProperties' && patternMembers(name).includes('env'))
      ) {
        addEnvironment(child);
      }
      collect(child, base);
    }
  }
  collect(root, `${DUMMY_BASE}/`);

  function referenceTarget(ref: string, base: string): unknown {
    if (ref === REDACTED) {
      return REDACTED;
    }
    const [path, fragment] = splitResourceUri(ref);
    const id = schemaResourceId(path, base);
    // A relative reference may inherit a credential route from its base.
    uris.add(ref);
    uris.add(id);
    const resource = ids.get(id);
    if (id === REDACTED || resource === null) {
      return root;
    }
    const anchor = ids.get(id + fragment);
    if (anchor === null) {
      return resource ?? root;
    }
    if (anchor) {
      return anchor;
    }
    if (!resource) {
      return ids.has(REDACTED) ? root : undefined;
    }
    return pointerTarget(fragment, resource, id);
  }

  // AJV honors IDs along the pointer, even under examples or default.
  // Promote those ancestors before indexing any descendant references.
  function pointerScope(
    schema: Record<string, unknown>,
    token: string,
    scope: string,
    last: boolean,
    credential: boolean,
  ): string {
    const id = !POINTER_CONTAINERS.has(token) && typeof schema.$id === 'string' ? schema.$id : '';
    if (id || last) {
      if (!scopes.has(schema)) {
        annotations.add(schema);
        collect(schema, scope);
      }
      if (credential) {
        pending.push(schema);
      }
    }
    return id ? schemaResourceId(splitResourceUri(id)[0], scope) : scope;
  }

  // For an unknown fragment, conservatively protect the whole resource.
  function pointerTarget(fragment: string, resource: object, scope: string): unknown {
    let node: unknown = resource;
    let credential = false;
    let env = false;
    const pointer = localSchemaPointer(fragment) ?? [];
    for (const [i, { raw, name }] of pointer.entries()) {
      if (!node || typeof node !== 'object' || !Object.prototype.hasOwnProperty.call(node, name)) {
        return resource;
      }
      credential ||= credentialSchemaName(name, undefined, env);
      env = name === 'env' || (env && Array.isArray(node));
      const child: unknown = (node as Record<string, unknown>)[name];
      const last = i === pointer.length - 1;
      if (isSchemaObject(child)) {
        scope = pointerScope(child, raw, scope, last, credential);
        if (last && scope !== scopes.get(child)) {
          // The same schema has two possible bases. Do not guess a target.
          if (credential) {
            pending.push(root);
          }
          return root;
        }
      } else if (typeof child === 'boolean' && last) {
        // Booleans have no object identity. Preserve only the referenced slot.
        const keys = booleanTargets.get(node) ?? new Set<string>();
        keys.add(name);
        booleanTargets.set(node, keys);
      }
      node = child;
    }
    return node ?? resource;
  }

  // Even an ordinary reference can reach an annotation containing credential
  // properties. Promoted schemas append their own references to this queue.
  for (const { value, base } of references) {
    referenceTarget(value, base);
  }

  function addEnvironment(value: unknown) {
    if (isSchemaObject(value)) {
      environments.add(value);
    }
  }

  // A pointer can promote a schema inside a credential's default or example
  // before we learn that the enclosing item describes an environment.
  function inspectEnvironmentLiteral(value: unknown) {
    if (Array.isArray(value)) {
      value.forEach(inspectEnvironmentLiteral);
    } else if (isSchemaObject(value)) {
      for (const [name, child] of Object.entries(value)) {
        if (child && typeof child === 'object' && isSecretEnvVarName(name)) {
          pending.push(child);
        }
      }
    }
  }

  // Follow references and applicators that still describe environment values.
  // Only credential members enter the ordinary sensitivity traversal.
  function inspectEnvironment(schema: Record<string, unknown>) {
    const base = scopes.get(schema)!;
    for (const [keyword, value] of Object.entries(schema)) {
      if (SCHEMA_REFS.has(keyword) && typeof value === 'string') {
        addEnvironment(referenceTarget(value, base));
      } else if (annotations.size && SCHEMA_LITERALS.has(keyword)) {
        inspectEnvironmentLiteral(value);
      } else if (ENV_SCHEMA_APPLICATORS.has(keyword)) {
        (Array.isArray(value) ? value : [value]).forEach(addEnvironment);
      } else if (isSchemaObject(value)) {
        if (keyword === 'dependentSchemas' || keyword === 'dependencies') {
          Object.values(value).forEach(addEnvironment);
        } else if (PROPERTY_MAPS.has(keyword)) {
          collectMap(value, keyword, base, true);
        }
      }
    }
  }
  for (const schema of environments) {
    inspectEnvironment(schema);
  }

  const sensitive = new WeakSet<object>();
  while (pending.length) {
    // Older saved rows can have the entire credential schema (including its $ref)
    // replaced by this marker. Any definition could then contain its constraints.
    const target = pending.pop();
    if (target === REDACTED) {
      diagnostics?.addSensitivePattern();
    }
    const node = target === REDACTED ? root : target;
    if (!node || typeof node !== 'object' || sensitive.has(node)) {
      continue;
    }
    sensitive.add(node);
    if (isSchemaObject(node) && typeof node.pattern === 'string') {
      diagnostics?.addSensitivePattern(node.pattern);
    }
    const base = scopes.get(node);
    for (const [key, child] of Object.entries(node)) {
      if (base && SCHEMA_REFS.has(key) && typeof child === 'string') {
        const target = referenceTarget(child, base);
        if (target === undefined) {
          // An external resource is unavailable. Protect historical diagnostics
          // without fetching it or masking unrelated local definitions.
          diagnostics?.addSensitivePattern();
        } else {
          pending.push(target);
        }
      } else if (child && typeof child === 'object') {
        pending.push(child);
      }
    }
  }

  const { renamed, patterns } = schemaNames(root, uris, names, patternKeys, diagnostics);
  return {
    renamed,
    patterns,
    sensitive,
    scopes,
    annotations,
    environments,
    booleanTargets,
    references,
    ids,
    queries: sanitizedResourceQueries(ids.keys()),
  };
}

function sanitizeSchemaUri(
  value: string,
  index: ReturnType<typeof schemaNames> & { queries?: Map<string, string> },
  keyword?: string,
  base?: string,
): string {
  const [path, fragment] = splitSchemaUri(value);
  // Preserve relative paths and scrub their queries without resolving them against a base.
  let safePath = path.startsWith('//')
    ? sanitizeUrl(`https:${path}`).replace(/^https:/, '')
    : URL_REFERENCE.test(path)
      ? sanitizeUrl(path)
      : sanitizeTemplatedUrl(path);
  if (path && base && keyword !== '$schema') {
    const id = keyword === '$id' ? base : schemaResourceId(path, base);
    const query = index.queries?.get(id);
    if (query !== undefined) {
      safePath = safePath.split('?', 1)[0] + query;
    }
  }
  const identifier = (name: string, sensitive = false) =>
    index.renamed.get(name) ?? (sensitive || safeSchemaName(name) !== name ? REDACTED_ID : name);
  safePath = projectPath(safePath, identifier);
  const pointer = localSchemaPointer(fragment);
  if (!pointer) {
    const name = decodeSchemaName(fragment.slice(1));
    const safe = identifier(name);
    return safePath + (name === safe ? sanitizeTemplatedUrl(fragment) : '#' + safe);
  }
  const tokens = pointer.map(({ raw, name }, i) => {
    const pattern = pointer[i - 1]?.name === 'patternProperties';
    const safe = pattern
      ? (index.patterns.get(name) ?? safeSchemaPattern(name))
      : (index.renamed.get(name) ?? safeSchemaName(name));
    return safe === name ? raw : pointerToken(safe);
  });
  return safePath + ['#', ...tokens].join('/');
}

const REDACTED_PATTERN = String.raw`^\[REDACTED\]$`;

// Never use a bare [REDACTED] as a regex: it would be a character class.
// Recognize anchored literals without executing an authored pattern.
function safeSchemaPattern(pattern: string, projected: unknown = pattern): string {
  const secret = patternMembers(pattern).some((name) => safeSchemaName(name) !== name);
  return projected !== pattern || pattern === REDACTED || secret ? REDACTED_PATTERN : pattern;
}

// YAML exceptions embed an excerpt and can also quote source text in the
// reason. Only the numeric location is safe to carry into logs or artifacts.
export function schemaParseFailure(message: string): string {
  const location = /\((\d{1,9}):(\d{1,9})\)(?:\r?\n|$)/.exec(message);
  return location
    ? `Invalid inline assertion schema at line ${location[1]}, column ${location[2]}`
    : 'Invalid inline assertion schema';
}

// AJV includes literal patterns, required names and JSON Pointer paths in
// diagnostics. Share masks across a row but never apply them to provider output.
export class SchemaDiagnostics {
  private readonly patterns = new Map<string, string>();
  readonly names = new Map<string, string>();
  private hasSchema = false;
  private incompletePatterns = false;

  // Derive diagnostic visibility from the actual exported pattern, including
  // value-based redaction in fields with ordinary names.
  recordPattern(original: string, projected: string): void {
    if (projected === REDACTED_PATTERN) {
      this.addSensitivePattern(original);
    } else if (!this.patterns.has(original) || this.patterns.get(original) === original) {
      this.patterns.set(original, projected);
    }
  }

  private pattern(value: string): string {
    return (
      this.patterns.get(value) ??
      (this.incompletePatterns ? REDACTED_PATTERN : safeSchemaPattern(value))
    );
  }

  addSensitivePattern(pattern?: string): void {
    this.hasSchema = true;
    if (pattern !== undefined) {
      this.patterns.set(pattern, REDACTED_PATTERN);
    }
    // The original pattern can be missing even when no pattern keyword survived.
    this.incompletePatterns ||=
      pattern === undefined ||
      pattern === REDACTED ||
      pattern === REDACTED_PATTERN ||
      pattern.includes('{{') ||
      pattern.includes('%5BREDACTED%5D');
  }

  includeSchema(): void {
    this.hasSchema = true;
  }

  private uri(value: string): string {
    return (
      this.names.get(value) ??
      sanitizeSchemaUri(value, { renamed: this.names, patterns: this.patterns })
    );
  }

  private sanitizeCompilationError(message: string): string {
    if (message.includes('Invalid regular expression: /')) {
      message = message.replace(
        /(Invalid regular expression: \/)(.*)(\/[a-z]*: )/s,
        (_, prefix, pattern, suffix) => prefix + this.pattern(pattern) + suffix,
      );
    }
    // AJV quotes format and keyword names and URI-encodes schema paths.
    // Apply the same projection to quoted operands, including on older rows.
    if (message.includes('schema at path') || message.includes('strict mode:')) {
      message = message.replace(/"([^"\n]+)"/g, (_, operand: string) => {
        const safe = operand.includes('#/')
          ? this.uri(operand)
          : (this.names.get(operand) ?? safeSchemaName(operand));
        return `"${safe}"`;
      });
    }
    // A legacy error can contain the resolved URI even if the saved schema no longer does.
    message = message.replace(
      /(schema with key or (?:id|ref)|reference) "([^"\n]+)"/g,
      (_, prefix, uri) => `${prefix} "${this.uri(uri)}"`,
    );
    return message.replace(
      /can't resolve reference (.+?) from id (.+)/g,
      (_, ref, id) => `can't resolve reference ${this.uri(ref)} from id ${this.uri(id)}`,
    );
  }

  sanitize(message: string): string {
    if (!this.hasSchema) {
      return message;
    }
    if (message.includes('YAMLException:') || /\(\d+:\d+\)\r?\n\r?\n\s*\d+ \|/.test(message)) {
      return schemaParseFailure(message);
    }
    const prefix = 'must match pattern "';
    if (message.includes(prefix)) {
      for (const [pattern, safe] of this.patterns) {
        if (pattern !== safe) {
          message = message.split(`${prefix}${pattern}"`).join(`${prefix}${safe}"`);
        }
      }
      // Older records may have retained a diagnostic after losing the schema.
      message = message.replace(
        /must match pattern "(.*?)"(?=, data|\n|$)/gs,
        (_, pattern) => `${prefix}${this.pattern(pattern)}"`,
      );
    }
    message = this.sanitizeCompilationError(message);
    for (const [name, safe] of [...this.names].sort(([a], [b]) => b.length - a.length)) {
      message = message.split(name).join(safe);
      message = message.split(escapePointerToken(name)).join(escapePointerToken(safe));
    }
    return sanitizeDiagnosticNames(message);
  }
}

// When older rows have lost the original names, AJV still spells them out in
// required/dependency errors and instance paths. Apply the same naming policy.
function sanitizeDiagnosticNames(message: string): string {
  return message
    .replace(
      /must have required property '([^'\n]*)'/g,
      (_, name) => `must have required property '${safeSchemaName(name)}'`,
    )
    .replace(
      /(must have propert(?:y|ies) )(.+?) when property (.+?) is present/g,
      (_, prefix, list: string, key) =>
        `${prefix}${list.split(', ').map(safeSchemaName).join(', ')} when property ${safeSchemaName(key)} is present`,
    )
    .replace(
      /\bdata\/([^\n]+?)(?= must |\n|$)/g,
      (_, path: string) =>
        'data/' +
        path
          .split('/')
          .map((token) => {
            const name = token.replace(/~1/g, '/').replace(/~0/g, '~');
            const safe = safeSchemaName(name);
            return safe === name ? token : escapePointerToken(safe);
          })
          .join('/'),
    );
}

export function sanitizeSchemaValidationMessage(message: string, schema: unknown): string {
  const diagnostics = new SchemaDiagnostics();
  sanitizeAssertionJsonSchema(schema, diagnostics);
  return diagnostics.sanitize(message);
}

// Enum values must be unique by JSON equality. Retain first occurrences and
// track shifted indexes for JSON Pointers into an enum.
function uniqueEnum(values: unknown[]) {
  const positions: number[] = [];
  const indexes = new Map<string, number>();
  const unique: unknown[] = [];
  for (const value of values) {
    const key = safeStringify.stable(value);
    let index = indexes.get(key);
    if (index === undefined) {
      index = unique.length;
      indexes.set(key, index);
      unique.push(value);
    }
    positions.push(index);
  }
  return { positions, unique };
}

// Walk the original resource, updating only the indexes of the sanitized URI.
function remapEnumPointer(
  source: string,
  output: string,
  resource: unknown,
  positions: Map<object, number[]>,
): string {
  const pointer = localSchemaPointer(source);
  const [path, fragment] = splitSchemaUri(output);
  const safe = localSchemaPointer(fragment);
  if (!pointer || !safe || pointer.length !== safe.length) {
    return output;
  }
  let node = resource;
  for (const [i, { name }] of pointer.entries()) {
    if (!node || typeof node !== 'object' || !Object.prototype.hasOwnProperty.call(node, name)) {
      return output;
    }
    const index = positions.get(node)?.[Number(name)];
    if (index !== undefined) {
      safe[i].raw = String(index);
    }
    node = (node as Record<string, unknown>)[name];
  }
  return path + ['#', ...safe.map(({ raw }) => raw)].join('/');
}

const SCHEMA_OPTIONS = {
  sanitizeUrls: true,
  throwOnError: true,
  maxDepth: Number.POSITIVE_INFINITY,
};

// Structural names and literal values can both contain encoded data. The
// schema context additionally preserves reference targets and allocated names.
function schemaDataProjector(context?: {
  names: Map<string, string>;
  annotations: Set<object>;
  visit: (schema: unknown, env: boolean) => unknown;
  redactLiteral: (value: unknown, key: string, parent: object) => unknown;
}) {
  function projectString(value: string, key: string, env: boolean): string {
    // Check the source before host and URL handling can normalize or reclassify
    // an opaque credential. Literal references to map keys share their names.
    const renamed = context?.names.get(value);
    if (renamed !== undefined) {
      return renamed;
    }
    const parsed = jsonData(value);
    if (parsed) {
      const safe = JSON.stringify(projectData(parsed, key));
      return projectedJsonText(value, parsed, safe);
    }
    const safeName = safeSchemaName(value);
    if (safeName !== value) {
      return safeName;
    }
    const field = { [key]: value };
    const safe = env
      ? sanitizeObject({ env: field }, SCHEMA_OPTIONS).env
      : sanitizeObject(field, SCHEMA_OPTIONS);
    return Object.prototype.hasOwnProperty.call(safe, key) ? safe[key] : REDACTED;
  }

  // Walk data once, preserving designated subschemas and applying ordinary
  // field sanitization only to literals, never to structural names or URIs.
  function projectData(value: unknown, key = '', env = false): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => projectData(item, key === 'env' ? key : ''));
    }
    if (!isSchemaObject(value)) {
      return typeof value === 'string' ? projectString(value, key, env) : value;
    }
    if (context?.annotations.has(value)) {
      // A referenced default or example is still literal data. Preserve the
      // sensitivity of its members even when retaining schema keywords.
      return context.visit(value, key === 'env');
    }
    return Object.fromEntries(
      Object.entries(value).map(([name, item]) => {
        const field = context ? (context.names.get(name) ?? name) : safeSchemaName(name);
        const secret = credentialSchemaName(name, undefined, key === 'env');
        return [
          field,
          secret
            ? (context?.redactLiteral(item, name, value) ?? REDACTED)
            : projectData(item, field, key === 'env'),
        ];
      }),
    );
  }

  return projectData;
}

const projectStandaloneData = schemaDataProjector();

/** Schema property names describe data. Their literal constraints can carry credentials. */
function sanitizeAssertionJsonSchema(root: unknown, diagnostics?: SchemaDiagnostics): unknown {
  const index = indexSchema(root, diagnostics);
  const { renamed: names, sensitive, scopes, annotations, booleanTargets } = index;
  const enumPositions = new Map<object, number[]>();
  const projected = new WeakMap<object, Record<string, unknown>>();
  // A credential literal can itself contain a referenced schema. Keep only
  // paths to those targets, whose constraints are masked by visit().
  function redactLiteral(value: unknown, key: string | number, parent: object): unknown {
    if (typeof value === 'boolean' && booleanTargets.get(parent)?.has(String(key))) {
      return value;
    }
    if ((!annotations.size && !booleanTargets.size) || !value || typeof value !== 'object') {
      return REDACTED;
    }
    if (annotations.has(value) && sensitive.has(value)) {
      return visit(value);
    }
    if (Array.isArray(value)) {
      const items = value.map(redactLiteral);
      return items.some((item) => item !== REDACTED) ? items : REDACTED;
    }
    const entries = Object.entries(value).flatMap(([key, item]) => {
      const child = redactLiteral(item, key, value);
      return child === REDACTED ? [] : [[sanitizeName(key), child]];
    });
    return entries.length ? Object.fromEntries(entries) : REDACTED;
  }

  const sanitizeName = (name: unknown) =>
    typeof name === 'string' ? (names.get(name) ?? name) : REDACTED;

  const projectData = schemaDataProjector({ names, annotations, visit, redactLiteral });

  function visitMap(
    keyword: string,
    map: Record<string, unknown>,
    credential: boolean,
    env: boolean,
  ) {
    return Object.fromEntries(
      Object.entries(map).map(([name, child]) => {
        const key = (keyword === 'patternProperties' ? index.patterns : names).get(name) ?? name;
        if (isSchemaObject(child) || typeof child === 'boolean') {
          return [key, visit(child)];
        }
        if (
          (keyword === 'dependencies' || keyword === 'dependentRequired') &&
          Array.isArray(child)
        ) {
          return [key, child.map(sanitizeName)];
        }
        return [
          key,
          credential || credentialSchemaName(name, keyword, env) ? REDACTED : projectData(child),
        ];
      }),
    );
  }

  function visitEnum(values: unknown[], credential: boolean, env: boolean) {
    const { unique, positions } = uniqueEnum(
      credential
        ? values.map(redactLiteral)
        : values.map((item) => projectData(item, env ? 'env' : '')),
    );
    if (unique.length < values.length) {
      enumPositions.set(values, positions);
    }
    return unique;
  }

  function visitKeyword(
    schema: Record<string, unknown>,
    keyword: string,
    value: unknown,
    env: boolean,
  ) {
    const credential = sensitive.has(schema);
    if (JSON_SCHEMA_MAP_KEYWORDS.has(keyword) && isSchemaObject(value)) {
      return [keyword, visitMap(keyword, value, credential, env)];
    }
    if (JSON_SCHEMA_CHILD_KEYWORDS.has(keyword)) {
      return [keyword, Array.isArray(value) ? value.map((child) => visit(child)) : visit(value)];
    }
    if (keyword === 'enum' && Array.isArray(value)) {
      return [keyword, visitEnum(value, credential, env)];
    }
    if (credential && !JSON_SCHEMA_STRUCTURAL_KEYWORDS.has(keyword)) {
      const redacted =
        keyword === 'pattern'
          ? REDACTED_PATTERN
          : Array.isArray(value)
            ? value.map(redactLiteral)
            : redactLiteral(value, keyword, schema);
      return [names.get(keyword) ?? keyword, redacted];
    }
    if (typeof value === 'string' && SCHEMA_URIS.has(keyword)) {
      const uri = sanitizeSchemaUri(value, index, keyword, scopes.get(schema));
      if (uri !== value) {
        diagnostics?.names.set(value, uri);
      }
      return [keyword, uri];
    }
    return visitData(schema, keyword, value, env);
  }

  function visitData(
    schema: Record<string, unknown>,
    keyword: string,
    value: unknown,
    env: boolean,
  ) {
    if (keyword === 'required' && Array.isArray(value)) {
      return [keyword, value.map(sanitizeName)];
    }
    const key = sanitizeName(keyword);
    if (credentialSchemaName(keyword, undefined, env)) {
      return [key, redactLiteral(value, keyword, schema)];
    }
    return [key, projectData(value, env && SCHEMA_LITERALS.has(key) ? 'env' : key, env)];
  }

  function visit(schema: unknown, envLiteral = false): unknown {
    if (!isSchemaObject(schema)) {
      return sanitizeObject(schema, SCHEMA_OPTIONS);
    }
    const env = envLiteral || index.environments.has(schema);
    const result = Object.fromEntries(
      Object.entries(schema).map(([keyword, value]) => visitKeyword(schema, keyword, value, env)),
    );
    if (typeof schema.pattern === 'string') {
      result.pattern = sensitive.has(schema)
        ? REDACTED_PATTERN
        : (renamedPattern(schema.pattern, names) ??
          safeSchemaPattern(schema.pattern, result.pattern));
      diagnostics?.recordPattern(schema.pattern, result.pattern);
    }
    if (typeof schema.format === 'string' && result.format !== schema.format) {
      diagnostics?.names.set(schema.format, result.format);
    }
    projected.set(schema, result);
    return result;
  }
  const result = visit(root);
  if (enumPositions.size) {
    for (const { schema, keyword, value, base } of index.references) {
      const output = projected.get(schema);
      if (output && typeof output[keyword] === 'string') {
        const [path, fragment] = splitSchemaUri(value);
        const resource = index.ids.get(schemaResourceId(path, base));
        output[keyword] = remapEnumPointer(fragment, output[keyword], resource, enumPositions);
      }
    }
  }
  return result;
}

/** Restore only JSON schemas from the original assertions, keeping other output fields sanitized. */
export function projectAssertionSchemas<T>(
  output: T,
  source: unknown = output,
  diagnostics?: SchemaDiagnostics,
): T {
  if (Array.isArray(output) && Array.isArray(source)) {
    return output.map((assertion, index) =>
      projectAssertionSchemas(assertion, source[index], diagnostics),
    ) as T;
  }
  if (!isSchemaObject(output) || !isSchemaObject(source)) {
    return output;
  }
  if (source.type === 'assert-set' && Array.isArray(output.assert)) {
    return {
      ...output,
      assert: projectAssertionSchemas(output.assert, source.assert, diagnostics),
    };
  }
  if (
    !['is-json', 'not-is-json', 'contains-json', 'not-contains-json'].includes(
      source.type as string,
    )
  ) {
    return output;
  }
  const schema = source.value;
  if (schema === REDACTED || (typeof schema === 'string' && schema.startsWith('file://'))) {
    diagnostics?.addSensitivePattern();
    return output;
  }
  if (isSchemaObject(schema)) {
    // Match sanitizeObject's JSON snapshot, including its handling of circular values.
    return {
      ...output,
      value: sanitizeAssertionJsonSchema(JSON.parse(safeStringify(schema)), diagnostics),
    };
  }
  if (typeof schema === 'string') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(schema);
    } catch {
      // Assertion handlers also accept inline YAML. Never resolve external
      // sources or expand aliases while projecting untrusted saved rows.
      try {
        parsed = loadYaml(schema, { maxAliases: 0 });
      } catch {
        diagnostics?.addSensitivePattern();
        return schema.includes(':') ? { ...output, value: REDACTED } : output;
      }
    }
    if (isSchemaObject(parsed)) {
      return { ...output, value: JSON.stringify(sanitizeAssertionJsonSchema(parsed, diagnostics)) };
    }
  }
  return output;
}

/** Project direct providers and provider/type maps without changing their local configuration. */
export function stripProviderPromptSelectors<T>(providers: T): T {
  if (Array.isArray(providers)) {
    return providers.map(stripProviderPromptSelectors) as T;
  }
  if (!providers || typeof providers !== 'object') {
    return providers;
  }
  const omitSelectors = (provider: unknown) => {
    if (!provider || typeof provider !== 'object') {
      return provider;
    }
    const record = provider as Record<string, unknown>;
    // Serialize live providers before copying so prototype serializers remain effective.
    const projected =
      typeof record.id === 'function' || typeof record.toJSON === 'function'
        ? sanitizeObject(provider, {
            context: 'provider output',
            sanitizeUrls: true,
            maxDepth: Number.POSITIVE_INFINITY,
            throwOnError: true,
          })
        : record;
    if (!projected || typeof projected !== 'object' || Array.isArray(projected)) {
      return projected;
    }
    const { prompts: _prompts, ...rest } = projected;
    return rest;
  };
  if (isProviderTypeMap(providers)) {
    const projected: Record<string, unknown> = { ...providers };
    for (const type of GRADING_PROVIDER_TYPE_KEYS) {
      if (Object.prototype.hasOwnProperty.call(providers, type)) {
        projected[type] = omitSelectors(providers[type]);
      }
    }
    return projected as T;
  }
  // Runtime serialization can remove id() and absent selectors from an options object.
  const isOptions = [
    'id',
    'label',
    'config',
    'env',
    'transform',
    'delay',
    'inputs',
    'prompts',
  ].some((key) => key in providers);
  return (
    isOptions
      ? omitSelectors(providers)
      : Object.fromEntries(
          Object.entries(providers).map(([key, provider]) => [key, omitSelectors(provider)]),
        )
  ) as T;
}

/** Map only provider slots in a test or assertion, preserving shared assertion sets. */
export function mapTestProviderRefs<T>(test: T, mapProvider: (provider: unknown) => unknown): T {
  const visited = new WeakMap<object, Record<string, unknown>>();
  const project = (value: unknown): unknown => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return value;
    }
    const previous = visited.get(value);
    if (previous) {
      return previous;
    }
    const record = value as Record<string, unknown>;
    const projected = { ...record };
    visited.set(value, projected);
    const options = record.options as Record<string, unknown> | undefined;
    if ('provider' in record) {
      projected.provider = mapProvider(record.provider);
    }
    if (options?.provider !== undefined) {
      projected.options = { ...options, provider: mapProvider(options.provider) };
    }
    if (Array.isArray(record.assert)) {
      projected.assert = record.assert.map(project);
    }
    return projected;
  };
  return project(test) as T;
}

/** Project only provider slots in a test or assertion (including sets). */
export function stripTestProviderPromptSelectors<T>(test: T): T {
  return mapTestProviderRefs(test, stripProviderPromptSelectors);
}

/** Sanitize exported/shared configuration while preserving safe tracing env references. */
export function sanitizeConfigForOutput(
  config: Partial<UnifiedConfig>,
  options: {
    shouldStripPromptText?: boolean;
    shouldStripTestVars?: boolean;
    shouldStripMetadata?: boolean;
    shouldStripResponseOutput?: boolean;
  } = {},
): Partial<UnifiedConfig> {
  const safe = sanitizeTracingConfigForPersistence(config);
  const { basePath, ...outputConfig } = safe;
  if (options.shouldStripPromptText) {
    // Classify live grading maps before serialization removes their provider methods.
    outputConfig.providers = stripProviderPromptSelectors(outputConfig.providers);
    outputConfig.defaultTest = stripTestProviderPromptSelectors(outputConfig.defaultTest);
    if (Array.isArray(outputConfig.tests)) {
      outputConfig.tests = outputConfig.tests.map(stripTestProviderPromptSelectors);
    }
    outputConfig.scenarios = outputConfig.scenarios?.map((scenario) =>
      typeof scenario === 'object'
        ? {
            ...scenario,
            config: scenario.config?.map(stripTestProviderPromptSelectors),
            tests: Array.isArray(scenario.tests)
              ? scenario.tests.map(stripTestProviderPromptSelectors)
              : scenario.tests,
          }
        : scenario,
    );
  }
  const sanitized = sanitizeObject(outputConfig, {
    context: 'output config',
    sanitizeUrls: true,
    throwOnError: true,
    maxDepth: Number.POSITIVE_INFINITY,
  }) as Partial<UnifiedConfig>;
  if (basePath !== undefined) {
    sanitized.basePath = basePath;
  }
  if (options.shouldStripPromptText) {
    delete sanitized.prompts;
    Reflect.deleteProperty(sanitized, 'providerPromptMap');
  }
  const {
    shouldStripTestVars: stripVars,
    shouldStripMetadata: stripMetadata,
    shouldStripResponseOutput: stripOutput,
  } = options;
  const collectTests = (value: Partial<UnifiedConfig>) => [
    ...(Array.isArray(value.tests) ? value.tests : []),
    value.defaultTest,
    ...(value.scenarios ?? []).flatMap((scenario) =>
      typeof scenario === 'object'
        ? [...(scenario.config ?? []), ...(Array.isArray(scenario.tests) ? scenario.tests : [])]
        : [],
    ),
  ];
  const sourceTests = collectTests(safe);
  for (const [index, test] of collectTests(sanitized).entries()) {
    if (!test || typeof test !== 'object') {
      continue;
    }
    const sourceTest = sourceTests[index];
    if (
      sourceTest &&
      typeof sourceTest === 'object' &&
      'assert' in sourceTest &&
      'assert' in test
    ) {
      test.assert = projectAssertionSchemas(test.assert, sourceTest.assert);
    }
    const sourceMetadata =
      sourceTest && typeof sourceTest === 'object' && 'metadata' in sourceTest
        ? sourceTest.metadata?.__promptfoo
        : undefined;
    const providerBasePath = sourceMetadata?.providerBasePath;
    // Like the config's basePath, local provider origins are operational paths, not
    // opaque tokens. Keep them for replay; sharing removes them from its own copy.
    if (
      'metadata' in test &&
      sourceMetadata?.remote !== true &&
      typeof providerBasePath === 'string' &&
      /^(?:\/|[a-zA-Z]:[\\/]|\\\\)/.test(providerBasePath)
    ) {
      test.metadata = {
        ...test.metadata,
        __promptfoo: { ...test.metadata?.__promptfoo, providerBasePath },
      };
    }
    if (stripVars && 'vars' in test) {
      delete test.vars;
    }
    if (stripMetadata && 'metadata' in test) {
      // Remote-row safety and local replay origins are operational metadata.
      if (test.metadata?.__promptfoo?.remote === true) {
        test.metadata = { __promptfoo: { remote: true } };
      } else if (typeof test.metadata?.__promptfoo?.providerBasePath === 'string') {
        test.metadata = {
          __promptfoo: { providerBasePath: test.metadata.__promptfoo.providerBasePath },
        };
      } else {
        delete test.metadata;
      }
    }
    if (stripOutput && 'providerOutput' in test) {
      delete test.providerOutput;
    }
  }
  const provider = safe.tracing?.provider;
  const sanitizedProvider = sanitized.tracing?.provider;
  if (provider && sanitizedProvider) {
    const referencedEnv = getReferencedTracingCredentialEnvironmentVariables(
      provider.auth,
      provider.headers,
      safe.env,
      undefined,
    );
    for (const [name, value] of Object.entries(safe.env ?? {})) {
      if (sanitized.env && referencedEnv.has(name) && isSafeTracingCredentialTemplate(value)) {
        Object.assign(sanitized.env, { [name]: value });
      }
    }
    for (const field of ['auth', 'headers'] as const) {
      const values = provider[field];
      if (!values) {
        continue;
      }
      const sanitizedValues = sanitizeObject(values) as Record<string, string>;
      for (const [key, value] of Object.entries(values)) {
        if (isSafeTracingCredentialTemplate(value)) {
          sanitizedValues[key] = value;
        }
      }
      sanitizedProvider[field] = sanitizedValues;
    }
  }
  return sanitized;
}

/**
 * Detect class instances (objects with custom prototypes and methods)
 */
function isClassInstance(obj: any): boolean {
  const proto = Object.getPrototypeOf(obj);
  // Bail out early if proto is null or Object.prototype
  if (!proto || proto === Object.prototype) {
    return false;
  }
  const hasMethods = Object.getOwnPropertyNames(proto).some(
    (prop) => prop !== 'constructor' && typeof proto[prop] === 'function',
  );
  return hasMethods;
}

function redactAzureBlobSasToken(value: string): string {
  if (!/^az:\/\//i.test(value)) {
    return value;
  }

  const queryStart = value.indexOf('?');
  if (queryStart === -1) {
    return value;
  }

  const fragmentStart = value.indexOf('#', queryStart);
  const queryEnd = fragmentStart === -1 ? value.length : fragmentStart;
  let redacted = false;
  const sanitizedQuery = value
    .slice(queryStart + 1, queryEnd)
    .split('&')
    .map((parameter) => {
      const equalsIndex = parameter.indexOf('=');
      const encodedName = equalsIndex === -1 ? parameter : parameter.slice(0, equalsIndex);
      let name: string;
      try {
        name = decodeURIComponent(encodedName.replace(/\+/g, ' '));
      } catch {
        return parameter;
      }

      if (name.toLowerCase() !== 'sig') {
        return parameter;
      }

      redacted = true;
      return `${encodedName}=${encodeURIComponent(REDACTED)}`;
    })
    .join('&');

  return redacted
    ? `${value.slice(0, queryStart + 1)}${sanitizedQuery}${value.slice(queryEnd)}`
    : value;
}

/**
 * Redact SAS credentials embedded in Azure Blob config references without
 * applying broader output sanitization to configuration consumed by clients.
 */
export function redactAzureBlobSasTokens<T>(value: T): T {
  if (typeof value === 'string') {
    return redactAzureBlobSasToken(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactAzureBlobSasTokens(item)) as T;
  }

  if (!value || typeof value !== 'object' || isClassInstance(value)) {
    return value;
  }

  const redactedEntries = Object.entries(value).map(([key, item]) => [
    key,
    redactAzureBlobSasTokens(item),
  ]);
  return Object.fromEntries(redactedEntries) as T;
}

type RestoreResult<T> = {
  value: T;
  restored: boolean;
};

function collectStoredAzureBlobSasTokens(
  value: unknown,
  tokensByRedactedUri = new Map<string, string>(),
  ambiguousRedactedUris = new Set<string>(),
): Map<string, string> {
  if (typeof value === 'string') {
    const redacted = redactAzureBlobSasToken(value);
    if (redacted !== value && !ambiguousRedactedUris.has(redacted)) {
      const existing = tokensByRedactedUri.get(redacted);
      if (existing === undefined) {
        tokensByRedactedUri.set(redacted, value);
      } else if (existing !== value) {
        tokensByRedactedUri.delete(redacted);
        ambiguousRedactedUris.add(redacted);
      }
    }
    return tokensByRedactedUri;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectStoredAzureBlobSasTokens(item, tokensByRedactedUri, ambiguousRedactedUris);
    }
    return tokensByRedactedUri;
  }

  if (!value || typeof value !== 'object' || isClassInstance(value)) {
    return tokensByRedactedUri;
  }

  for (const item of Object.values(value)) {
    collectStoredAzureBlobSasTokens(item, tokensByRedactedUri, ambiguousRedactedUris);
  }
  return tokensByRedactedUri;
}

function restoreAzureBlobSasTokensFromMap<T>(
  value: T,
  tokensByRedactedUri: ReadonlyMap<string, string>,
): RestoreResult<T> {
  if (typeof value === 'string') {
    const storedValue = tokensByRedactedUri.get(value);
    return storedValue === undefined
      ? { value, restored: false }
      : { value: storedValue as T, restored: true };
  }

  if (Array.isArray(value)) {
    let restored = false;
    const restoredItems = value.map((item) => {
      const result = restoreAzureBlobSasTokensFromMap(item, tokensByRedactedUri);
      restored ||= result.restored;
      return result.value;
    });
    return restored ? { value: restoredItems as T, restored } : { value, restored };
  }

  if (!value || typeof value !== 'object' || isClassInstance(value)) {
    return { value, restored: false };
  }

  let restored = false;
  const restoredEntries = Object.entries(value).map(([key, item]) => {
    const result = restoreAzureBlobSasTokensFromMap(item, tokensByRedactedUri);
    restored ||= result.restored;
    return [key, result.value];
  });
  return restored
    ? { value: Object.fromEntries(restoredEntries) as T, restored }
    : { value, restored };
}

function restoreAzureBlobSasTokensWithResult<T>(
  value: T,
  storedValue: unknown,
  ambiguousRedactedUris = new Set<string>(),
  unchangedPosition = true,
): RestoreResult<T> {
  if (typeof value === 'string') {
    if (
      typeof storedValue === 'string' &&
      value === redactAzureBlobSasToken(storedValue) &&
      (!ambiguousRedactedUris.has(value) || unchangedPosition)
    ) {
      return { value: storedValue as T, restored: storedValue !== value };
    }
    return { value, restored: false };
  }

  if (Array.isArray(value)) {
    const storedItems = Array.isArray(storedValue) ? storedValue : [];
    const arrayAmbiguousUris = new Set(ambiguousRedactedUris);
    const storedTokensByRedactedUri = collectStoredAzureBlobSasTokens(
      storedItems,
      new Map(),
      arrayAmbiguousUris,
    );
    let restored = false;
    const restoredItems = value.map((item, index) => {
      const positional = restoreAzureBlobSasTokensWithResult(
        item,
        storedItems[index],
        arrayAmbiguousUris,
        // A changed ancestor cannot establish which duplicate signature belongs here.
        // Unchanged entries retain their positional credentials, including nested arrays.
        unchangedPosition &&
          (arrayAmbiguousUris.size === 0 ||
            deepEqual(item, redactAzureBlobSasTokens(storedItems[index]))),
      );

      // Positional restore fails when array entries are reordered, inserted, or
      // edited outside the URI field. Also match by redacted URI identity so
      // unchanged nested SAS references keep their stored signature.
      const fallback = restoreAzureBlobSasTokensFromMap(
        positional.value,
        storedTokensByRedactedUri,
      );
      restored ||= positional.restored || fallback.restored;
      return fallback.value;
    });
    return restored ? { value: restoredItems as T, restored } : { value, restored };
  }

  if (!value || typeof value !== 'object' || isClassInstance(value)) {
    return { value, restored: false };
  }

  const storedObject =
    storedValue && typeof storedValue === 'object' && !Array.isArray(storedValue)
      ? (storedValue as Record<string, unknown>)
      : {};
  let restored = false;
  const restoredEntries = Object.entries(value).map(([key, item]) => {
    const result = restoreAzureBlobSasTokensWithResult(
      item,
      storedObject[key],
      ambiguousRedactedUris,
      unchangedPosition,
    );
    restored ||= result.restored;
    return [key, result.value];
  });
  return restored
    ? { value: Object.fromEntries(restoredEntries) as T, restored }
    : { value, restored };
}

/**
 * Preserve stored SAS credentials when a sanitized config is written back unchanged.
 * If the caller edits the resource or supplies a replacement token, retain its value.
 */
export function restoreAzureBlobSasTokens<T>(value: T, storedValue: unknown): T {
  return restoreAzureBlobSasTokensWithResult(value, storedValue).value;
}

/**
 * Parse and sanitize JSON strings, also check if the string looks like a secret
 */
function sanitizeJsonString(
  str: string,
  depth: number,
  maxDepth: number,
  sanitizeUrls = false,
): string {
  const redactedAzureBlobUri = redactAzureBlobSasToken(str);
  if (redactedAzureBlobUri !== str) {
    return redactedAzureBlobUri;
  }

  try {
    const parsed = JSON.parse(str);
    if (parsed && typeof parsed === 'object') {
      const sanitized = recursiveSanitize(parsed, depth, maxDepth, sanitizeUrls);
      return JSON.stringify(sanitized);
    }
    if (typeof parsed === 'string') {
      // Bound string unwrapping even when object traversal has no depth limit.
      if (depth >= maxDepth || depth >= 64) {
        return JSON.stringify(REDACTED);
      }
      return JSON.stringify(sanitizeJsonString(parsed, depth + 1, maxDepth, sanitizeUrls));
    }
  } catch {
    if (looksLikeUrlEncodedFormData(str)) {
      const sanitizedUrlEncoded = sanitizeUrlEncodedString(str);
      if (sanitizedUrlEncoded !== str) {
        return sanitizedUrlEncoded;
      }
    }

    // Not JSON - check if it looks like a secret
    if (looksLikeSecret(str)) {
      return REDACTED;
    }
  }
  return str;
}

// `key=value` where the key is a typical form-data identifier (allow brackets
// for PHP/qs-style nested keys) and the value runs to the next separator. The
// first `=` is the separator within a pair; subsequent `=` (e.g. base64
// padding) belong to the value. Both `&` and `;` are accepted as pair
// separators since PHP/CGI/several Java stacks treat `;` as a `&` equivalent.
const URL_ENCODED_SEGMENT_RE = /^[A-Za-z0-9._~+%\[\]-]+=[^&;]*$/;

function looksLikeUrlEncodedFormData(value: string): boolean {
  // Every non-empty separator-delimited chunk must be a `key=value` pair with
  // safe key characters. Values may contain raw spaces because some clients
  // emit non-canonical form bodies instead of encoding them as `+` or `%20`,
  // but multiline/tab-delimited diagnostic text must not be collapsed into a
  // single form field. Empty chunks (leading/trailing/consecutive separators)
  // are tolerated. The strict key shape keeps prose and shell commands
  // containing `=` from being treated as form data.
  if (!value.includes('=') || /[\r\n\t]/.test(value)) {
    return false;
  }
  const segments = value.split(/[&;]/).filter((segment) => segment.length > 0);
  if (segments.length === 0) {
    return false;
  }
  return segments.every((segment) => URL_ENCODED_SEGMENT_RE.test(segment));
}

// Matches one `key=value` pair. `[^=&;]+` for the key ensures we split on the
// FIRST `=` (so values can contain `=`, e.g. base64 padding); `[^&;]*` lets the
// value run to the next pair separator (`&` or `;`).
const URL_ENCODED_PAIR_RE = /(^|[&;])([^=&;]+)=([^&;]*)/g;

function decodeFormComponent(component: string): string | undefined {
  try {
    return decodeURIComponent(component.replace(/\+/g, ' '));
  } catch {
    return undefined;
  }
}

/**
 * When a form value URL-decodes to a JSON object/array, recursively sanitize
 * it and return the serialized result — but only if sanitization actually
 * changed something. Returns `null` when there is no JSON to sanitize or when
 * the value is JSON but contains no secrets (so callers can preserve the
 * original byte-for-byte).
 */
function redactNestedJsonValue(decoded: string | undefined): string | null {
  if (decoded === undefined) {
    return null;
  }
  const trimmed = decoded.trim();
  if (!trimmed || (trimmed[0] !== '{' && trimmed[0] !== '[')) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }
  const sanitized = sanitizeObject(parsed, {
    sanitizeUrls: true,
    maxDepth: Number.POSITIVE_INFINITY,
  });
  const originalSerialized = JSON.stringify(parsed);
  const sanitizedSerialized = JSON.stringify(sanitized);
  return sanitizedSerialized === originalSerialized ? null : sanitizedSerialized;
}

// Matches one `{{ ... }}` Nunjucks placeholder. `[^{}]*` excludes braces so it
// cannot backtrack against the closing `}}` (linear, no ReDoS).
const NUNJUCKS_PLACEHOLDER = /\{\{[^{}]*\}\}/g;

// A value that is entirely Nunjucks placeholders (e.g. `{{password}}`) with no
// literal content is a config template, not a runtime secret. A value that merely
// CONTAINS a placeholder alongside literal text (e.g. `abc{{x}}def`) is not, so a
// secret-named key must still redact it.
function isPureTemplateValue(value: string): boolean {
  return value.includes('{{') && value.replace(NUNJUCKS_PLACEHOLDER, '').trim() === '';
}

export function sanitizeUrlEncodedString(value: string): string {
  if (!value.includes('=')) {
    return value;
  }

  let changed = false;
  const result = value.replace(URL_ENCODED_PAIR_RE, (match, separator, rawKey, rawValue) => {
    if (rawValue.length === 0) {
      // Preserve empty values verbatim so `password=` doesn't masquerade as a
      // redacted secret.
      return match;
    }

    // Preserve pure Nunjucks placeholders (e.g. a provider body template
    // `password={{password}}`): these are config templates, not runtime secrets,
    // and this string flows through sanitizeObject into persisted provider
    // configs. Mirrors the template guard in sanitizeUrl. Checked before the
    // secret-key redaction so a templated secret field is kept, but a value that
    // only embeds a placeholder among literal text is not exempted.
    if (isPureTemplateValue(rawValue)) {
      return match;
    }

    // An undecodable key (stray `%` not forming %HH) only disables the key-NAME
    // match — the value-pattern checks below must still run, otherwise a malformed
    // key smuggles its secret value past redaction (e.g. `api%ZZkey=AKIA...`).
    const decodedKey = decodeFormComponent(rawKey);
    const decodedValue = decodeFormComponent(rawValue);
    const keyIsSecret = decodedKey !== undefined && isSecretParameter(decodedKey, decodedValue);

    // A secret-named key redacts its ENTIRE value before any template skip or
    // nested-JSON recursion, so a partial-template value (`password=abc{{x}}def`)
    // or a JSON value (`password={"value":"plain"}`) can't leak a fragment.
    if (keyIsSecret) {
      changed = true;
      // `encodeURIComponent(REDACTED)` keeps the output a valid form-encoded
      // body; debug consumers that decode it see `[REDACTED]`.
      return `${separator}${rawKey}=${encodeURIComponent(REDACTED)}`;
    }

    // Recurse into JSON-shaped values so credentials buried in a
    // form-encoded JSON payload (e.g. `data=%7B%22password%22%3A...%7D`) get
    // redacted at the leaf rather than leaked as opaque bytes.
    const nestedJson = redactNestedJsonValue(decodedValue);
    if (nestedJson !== null) {
      changed = true;
      return `${separator}${rawKey}=${encodeURIComponent(nestedJson)}`;
    }

    // Check both raw and decoded forms of the value so `+` decoding can't be
    // used to escape pattern-based secret detection (e.g.
    // `key=AAAA+BBBB...` where the raw 64-char chunk matches but the
    // space-bearing decoded form doesn't).
    const valueLooksSecret =
      looksLikeSecret(rawValue) || (decodedValue !== undefined && looksLikeSecret(decodedValue));

    if (valueLooksSecret) {
      changed = true;
      return `${separator}${rawKey}=${encodeURIComponent(REDACTED)}`;
    }
    return match;
  });

  return changed ? result : value;
}

/**
 * Sanitize plain object fields
 */
function sanitizePlainObject(
  obj: any,
  depth: number,
  maxDepth: number,
  sanitizeUrls: boolean,
  isEnvMap: boolean,
): any {
  const sanitized: any = {};
  let keySuffix = 0;
  const isSecretKey = isEnvMap ? isSecretEnvVarName : isSecretField;
  for (const [rawKey, value] of Object.entries(obj)) {
    const redactedKey = sanitizeUrls && URL_REFERENCE.test(rawKey) ? sanitizeUrl(rawKey) : rawKey;
    let key = redactedKey;
    while (
      Object.prototype.hasOwnProperty.call(sanitized, key) ||
      (key !== rawKey && Object.prototype.hasOwnProperty.call(obj, key))
    ) {
      key = `${redactedKey}#${++keySuffix}`;
    }
    if (isSecretKey(key)) {
      sanitized[key] = REDACTED;
    } else if (key.toLowerCase() === 'headers' && value && typeof value === 'object') {
      sanitized[key] = Object.fromEntries(
        Object.entries(value).map(([name, item]) => [
          name,
          isSafeTracingCredentialTemplate(item) ||
          (typeof item === 'string' &&
            !isCredentialHeader(name, item) &&
            (isNonCredentialHeader(name) || SAFE_TRACING_PROVIDER_HEADERS.has(name.toLowerCase())))
            ? item
            : REDACTED,
        ]),
      );
    } else if (
      typeof value === 'string' &&
      (key === 'apiHost' || (isEnvMap && key.toUpperCase().endsWith('_HOST')))
    ) {
      const scheme = /^[a-z][a-z\d+.-]*:\/\//i;
      const hasScheme = scheme.test(value);
      const endpoint = sanitizeUrlForLogging(hasScheme ? value : `https://${value}`);
      const host = hasScheme ? endpoint : endpoint.replace(/^https:\/\//, '');
      const hasPath = value.replace(scheme, '').split(/[?#]/, 1)[0].includes('/');
      sanitized[key] = hasPath ? host : host.replace(/\/(?=[?#]|$)/, '');
    } else if (
      typeof value === 'string' &&
      (key === 'url' ||
        key === 'apiBaseUrl' ||
        key === 'server_url' ||
        (isEnvMap && key.toUpperCase().endsWith('_URL')))
    ) {
      sanitized[key] =
        key === 'url' ||
        (isEnvMap && key.toUpperCase().endsWith('_URL') && !/^OPENAI_(?:API_)?BASE_URL$/i.test(key))
          ? sanitizeUrl(value)
          : sanitizeUrlForLogging(value);
    } else if (typeof value === 'string' && looksLikeSecret(value)) {
      // Redact opaque credential values before trying URL-specific handling.
      sanitized[key] = REDACTED;
    } else {
      // An `env` map is handed verbatim to a subprocess, so its keys are environment
      // variable names and get the broader credential-word match one level down.
      const sanitizedValue = recursiveSanitize(
        value,
        depth + 1,
        maxDepth,
        sanitizeUrls,
        key === 'env',
      );
      sanitized[key] =
        typeof sanitizedValue === 'string' &&
        (key.toLowerCase() === 'url' ||
          (sanitizeUrls && /(?:url|uri|host|endpoint|proxy)$/i.test(key)))
          ? sanitizeUrl(sanitizedValue)
          : sanitizedValue;
    }
  }
  return sanitized;
}

/**
 * Recursively sanitize an object, redacting secret fields at any depth
 */
function recursiveSanitize(
  obj: any,
  depth = 0,
  maxDepth = MAX_DEPTH,
  sanitizeUrls = false,
  isEnvMap = false,
): any {
  if (typeof obj === 'function') {
    return `[Function] ${obj.name}`;
  }

  // Handle strings - check if they're JSON and sanitize if so
  if (typeof obj === 'string') {
    return sanitizeUrls && URL_REFERENCE.test(obj)
      ? sanitizeUrl(obj)
      : sanitizeJsonString(obj, depth, maxDepth, sanitizeUrls);
  }

  // Handle primitives and null/undefined
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return obj;
  }

  // Enforce depth limit for objects and arrays
  if (depth > maxDepth) {
    return '[...]';
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map((item) => recursiveSanitize(item, depth + 1, maxDepth, sanitizeUrls));
  }

  // Handle class instances
  if (isClassInstance(obj)) {
    const constructorName = obj.constructor?.name || 'Object';
    return `[${constructorName} Instance]`;
  }

  // Handle plain objects
  return sanitizePlainObject(obj, depth, maxDepth, sanitizeUrls, isEnvMap);
}

/**
 * Generic function to sanitize any object by removing or redacting sensitive information
 * @param obj - The object to sanitize
 * @param options - Optional configuration
 * @returns A sanitized copy of the object with secrets redacted
 */
export function sanitizeObject(
  obj: any,
  options: {
    context?: string;
    throwOnError?: boolean;
    maxDepth?: number;
    // Config output and provider configs can carry credentials in any URL string or map key.
    sanitizeUrls?: boolean;
  } = {},
): any {
  const {
    context = 'object',
    throwOnError = false,
    maxDepth = MAX_DEPTH,
    sanitizeUrls = false,
  } = options;

  try {
    // Handle null/undefined
    if (obj === null || obj === undefined) {
      return obj;
    }

    // Handle strings - check if they're JSON and sanitize if so
    if (typeof obj === 'string') {
      return recursiveSanitize(obj, 0, maxDepth, sanitizeUrls);
    }

    // Handle other primitives
    if (typeof obj !== 'object') {
      return obj;
    }

    // Use safeStringify only to handle circular references
    // Custom replacer to handle Error objects which don't serialize properly
    // (Error objects have no enumerable properties, so JSON.stringify returns "{}")
    const safeObj = JSON.parse(
      safeStringify(
        obj,
        (_key, val) => {
          if (val instanceof Error) {
            return {
              name: val.name,
              message: val.message,
            };
          }
          return val;
        },
        undefined,
        {
          depthLimit: Number.MAX_SAFE_INTEGER,
          edgesLimit: Number.MAX_SAFE_INTEGER,
        },
      ),
    );

    // Apply recursive sanitization with depth limiting
    return recursiveSanitize(safeObj, 0, maxDepth, sanitizeUrls);
  } catch (error) {
    if (throwOnError) {
      throw error;
    }

    // Can't use logger here as it would create circular dependency
    console.error(`Error sanitizing ${context}:`, error);

    return REDACTED;
  }
}

// Legacy exports for backward compatibility
export const sanitizeBody = sanitizeObject;
export const sanitizeHeaders = sanitizeObject;
export const sanitizeQueryParams = sanitizeObject;

function getSecretLookingRawQueryKeys(search: string): Set<string> {
  const secretKeys = new Set<string>();

  for (const segment of search.slice(1).split('&')) {
    const separatorIndex = segment.indexOf('=');
    if (separatorIndex < 0) {
      continue;
    }

    const rawValue = segment.slice(separatorIndex + 1);
    if (!looksLikeSecret(rawValue)) {
      continue;
    }

    const rawKey = segment.slice(0, separatorIndex);
    const decodedKey = decodeFormComponent(rawKey);
    if (decodedKey !== undefined) {
      secretKeys.add(decodedKey);
    }
  }

  return secretKeys;
}

function sanitizeTemplatedUrl(url: string): string {
  // A template may coexist with an already-rendered env credential. Avoid URL
  // parsing here because it encodes the remaining Nunjucks syntax, but still
  // scrub literal query and fragment credentials before the value is logged or
  // persisted.
  if (hasUrlUserinfo(url)) {
    return REDACTED;
  }

  const hashIndex = url.indexOf('#');
  const beforeHash = hashIndex === -1 ? url : url.slice(0, hashIndex);
  const hash = hashIndex === -1 ? '' : url.slice(hashIndex + 1);
  const queryIndex = beforeHash.indexOf('?');
  const beforeQuery = queryIndex === -1 ? beforeHash : beforeHash.slice(0, queryIndex);
  const query = queryIndex === -1 ? '' : beforeHash.slice(queryIndex + 1);
  const sanitizedQuery = query ? sanitizeUrlEncodedString(query) : query;
  const sanitizedHash = hash ? sanitizeUrlEncodedString(hash) : hash;

  return `${beforeQuery}${queryIndex === -1 ? '' : `?${sanitizedQuery}`}${hashIndex === -1 ? '' : `#${sanitizedHash}`}`;
}

export function sanitizeUrl(url: string): string {
  try {
    // Ensure url is a string and handle edge cases
    if (typeof url !== 'string' || !url.trim()) {
      return url;
    }

    // Preserve unresolved template syntax while redacting any literal credentials
    // that were already rendered into another part of the same URL.
    if (url.includes('{{') && url.includes('}}')) {
      return sanitizeTemplatedUrl(url);
    }

    const nestedJson = redactNestedJsonValue(url);
    if (nestedJson !== null) {
      return nestedJson;
    }

    // Handle path-only URLs (e.g., /api/openai/completion from raw HTTP request mode).
    // new URL() requires a fully qualified URL, so prepend a dummy base for parsing.
    const isPathOnly = url.startsWith('/') && !url.startsWith('//');
    const parsedUrl = isPathOnly ? new URL(url, DUMMY_BASE) : new URL(url);

    // Create a copy for sanitization to avoid modifying the original URL
    // Use href instead of toString() for better cross-platform compatibility
    const sanitizedUrl = new URL(parsedUrl.href);

    if (sanitizedUrl.username || sanitizedUrl.password) {
      sanitizedUrl.username = '***';
      sanitizedUrl.password = '***';
    }

    // Sanitize query parameters that might contain sensitive data
    const rawSecretParamKeys = getSecretLookingRawQueryKeys(parsedUrl.search);

    try {
      for (const [key, value] of Array.from(sanitizedUrl.searchParams.entries())) {
        if (
          isSecretParameter(key, value) ||
          rawSecretParamKeys.has(key) ||
          looksLikeSecret(value) ||
          // URLSearchParams only splits on `&`, so a `;`-delimited credential
          // (`data=ok;api_key=sk-...`, legacy but still accepted by some stacks)
          // hides inside one value. Redact the whole value when it conceals one.
          (value.includes(';') && hasSecretFormSegment(value))
        ) {
          sanitizedUrl.searchParams.set(key, '[REDACTED]');
        } else {
          const nestedJson = redactNestedJsonValue(value);
          if (nestedJson !== null) {
            sanitizedUrl.searchParams.set(key, nestedJson);
          }
        }
      }
    } catch (paramError) {
      // Can't use logger here as it would create a circular dependency.
      console.warn(`Failed to sanitize URL parameters: ${paramError}`);
      return REDACTED;
    }

    // Redact credentials carried in the fragment too (e.g. the OAuth implicit-flow
    // shape `#access_token=...`). The hash is a `key=value(&...)` string after the
    // leading `#`, so reuse the same form-pair scrubbing as the query.
    if (sanitizedUrl.hash.length > 1) {
      const sanitizedHash = sanitizeUrlEncodedString(sanitizedUrl.hash.slice(1));
      sanitizedUrl.hash = sanitizedHash ? `#${sanitizedHash}` : '';
    }

    // Preserve spelling, encoding, and trailing slashes when no credential changed.
    if (sanitizedUrl.href === parsedUrl.href) {
      return url;
    }

    // For path-only URLs, return just the path (+ search + hash), not the dummy base
    if (isPathOnly) {
      return sanitizedUrl.pathname + sanitizedUrl.search + sanitizedUrl.hash;
    }

    return sanitizedUrl.toString();
  } catch {
    // Fail closed only when the unparseable value plausibly carries a credential.
    // sanitizeObject runs this on any field literally named `url`, so blanket
    // redaction would destroy non-secret bare domains, relative paths, and prose
    // in persisted eval results and user-facing config error messages.
    return unparseableUrlMightLeakSecret(url) ? REDACTED : url;
  }
}

function isCredentialPathSegment(segment: string, previous: string): boolean {
  const route = isSecretField(decodeFormComponent(previous) ?? '');
  try {
    const decoded = decodeURIComponent(segment);
    // Credential routes can also contain ordinary words such as /auth/proxy.
    return (
      (route &&
        /^[a-z0-9._~+-]{12,}$/i.test(decoded) &&
        /[a-z]/i.test(decoded) &&
        /[0-9]/.test(decoded)) ||
      OPAQUE_CREDENTIAL_PATH_SEGMENT.test(decoded) ||
      looksLikeSecret(decoded)
    );
  } catch {
    return route;
  }
}

/**
 * Sanitize a URL specifically for diagnostic output. Opaque path segments can be
 * legitimate resource IDs in persisted provider results, so only logging paths
 * use this stricter redaction.
 */
export function sanitizeUrlForLogging(url: string): string {
  const sanitized = sanitizeUrl(url);
  try {
    const isPathOnly = sanitized.startsWith('/') && !sanitized.startsWith('//');
    const parsed = isPathOnly ? new URL(sanitized, DUMMY_BASE) : new URL(sanitized);
    const sanitizedPathname = parsed.pathname
      .split('/')
      .map((segment, index, segments) =>
        isCredentialPathSegment(segment, segments[index - 1] ?? '') ? '%5BREDACTED%5D' : segment,
      )
      .join('/');
    if (sanitizedPathname === parsed.pathname) {
      return sanitized;
    }
    parsed.pathname = sanitizedPathname;
    return isPathOnly ? parsed.pathname + parsed.search + parsed.hash : parsed.toString();
  } catch {
    const hasOpaquePath = url
      .split(/[/?#]/)
      .some((segment) =>
        OPAQUE_CREDENTIAL_PATH_SEGMENT.test(decodeFormComponent(segment) ?? segment),
      );
    return unparseableUrlMightLeakSecret(url) || hasOpaquePath ? REDACTED : sanitized;
  }
}
