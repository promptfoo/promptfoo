import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { looksLikeSecret, redactAzureBlobSasTokens } from '../../../util/sanitizer';

import type { EvaluateTestSuiteWithEvaluateOptions, UnifiedConfig } from '../../../types/index';

export interface EvalConfigState {
  config: Partial<UnifiedConfig>;
  /** Replace the entire config */
  setConfig: (config: Partial<UnifiedConfig>) => void;
  /** Merge updates into the existing config */
  updateConfig: (updates: Partial<UnifiedConfig>) => void;
  /** Reset config to defaults */
  reset: () => void;
  /** Get the test suite in the expected format */
  getTestSuite: () => EvaluateTestSuiteWithEvaluateOptions;
}

export const DEFAULT_CONFIG: Partial<UnifiedConfig> = {
  description: '',
  providers: [],
  prompts: [],
  tests: [],
  defaultTest: {},
  derivedMetrics: [],
  env: {},
  evaluateOptions: {},
  scenarios: [],
  extensions: [],
};

const CREDENTIAL_TOKEN_PATTERN =
  /(?:^|_)(ssh_?key|id_?token|jwt_?token|x_?api_?key|json_?web_?token|api_?key|api_?secret|key|secret|token|password|passphrase|credential|signature|cookie|authorization|bearer)s?(?:_|$)/;

// Field names whose value is always credential material (inline key/keystore
// bytes), even when the name itself does not match the credential token regex.
const INLINE_CREDENTIAL_MATERIAL_NAMES = new Set([
  'certificate_content',
  'jks_content',
  'key_content',
  'keystore_content',
  'pfx',
  'pfx_content',
]);

// Bare auth-carrier header names that escape the main regex. Only consulted
// when the parent key is the `headers` bag.
const HEADER_CREDENTIAL_NAMES = new Set([
  'auth',
  'x_auth',
  'x_honeycomb_team',
  'proxy_authorization',
  'x_amz_security_token',
]);

const NON_SECRET_CREDENTIAL_NAME_PATTERNS = [
  /(?:^|_)api_bearer_token_envar$/,
  /(?:^|_)api_key_envar$/,
  /(?:^|_)api_key_required$/,
  /(?:^|_)azure_token_scope$/,
  /(?:^|_)langfuse_public_key$/,
  /(?:^|_)key_alias$/,
  /(?:^|_)key_filename$/,
  /(?:^|_)key_name$/,
  /(?:^|_)key_path$/,
  /(?:^|_)max(?:_[a-z0-9]+)*_tokens?(?:_[a-z0-9]+)*$/,
  /(?:^|_)pay_per_token$/,
  /(?:^|_)private_key_path$/,
  /(?:^|_)prompt_cache_key$/,
  /(?:^|_)session_key$/,
  /(?:^|_)signature_auth$/,
  /(?:^|_)signature_(?:algorithm|validity_ms|data_template|refresh_buffer_ms)$/,
  /(?:^|_)token_estimation$/,
  /(?:^|_)token_url$/,
];

// Provider-config subtrees that are model-facing contracts, not credentials.
// Walking them would corrupt JSON schemas (e.g. a tool parameter literally
// named `password`). The check fires at the entry point — children of an
// opaque key are protected transitively.
const OPAQUE_PROVIDER_CONFIG_KEYS = new Set([
  'tools',
  'functions',
  'tool_choice',
  'response_format',
  'output_schema',
  'json_schema',
]);

// Normalize so the credential regex can match any casing convention
// (camelCase, PascalCase, ALL_CAPS, kebab-case, all-caps acronyms).
const normalizeCredentialName = (name: string): string =>
  name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/-/g, '_')
    .toLowerCase();

const looksLikeCredential = (name: string): boolean => {
  const normalized = normalizeCredentialName(name);
  if (NON_SECRET_CREDENTIAL_NAME_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return false;
  }
  return (
    CREDENTIAL_TOKEN_PATTERN.test(normalized) || INLINE_CREDENTIAL_MATERIAL_NAMES.has(normalized)
  );
};

const looksLikeCredentialHeader = (headerName: string): boolean => {
  const normalized = normalizeCredentialName(headerName);
  return HEADER_CREDENTIAL_NAMES.has(normalized) || looksLikeCredential(headerName);
};

const URL_USERINFO = /^([a-z][a-z0-9+.-]*:\/\/)([^/?#@\s]+)@/i;
const URL_QUERY_PARAMETER = /([?&])([^=&#]+)=([^&#]*)/g;
const URL_PATH_SEGMENT = /\/([^/?#\s]+)/g;
const URL_PROTOCOL = /^[a-z][a-z0-9+.-]*:\/\//i;
const NUNJUCKS_REFERENCE = /\{\{[^{}]*\}\}/g;
const NUNJUCKS_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SAFE_CREDENTIAL_TEMPLATE_FILTERS = new Set(['trim', 'urlencode']);

const getSafeNunjucksPath = (reference: string): string | undefined => {
  const [path, ...filters] = reference
    .slice(2, -2)
    .split('|')
    .map((part) => part.trim());
  const safePath =
    path.length > 0 && path.split('.').every((part) => NUNJUCKS_NAME.test(part.trim()));
  const safeFilters = filters.every((filter) => SAFE_CREDENTIAL_TEMPLATE_FILTERS.has(filter));
  return safePath && safeFilters
    ? path
        .split('.')
        .map((part) => part.trim())
        .join('.')
    : undefined;
};

const stripSafeNunjucksReferences = (value: string): string =>
  value.replace(NUNJUCKS_REFERENCE, (reference) =>
    getSafeNunjucksPath(reference) === undefined ? reference : '',
  );

const recordCredentialTemplatePaths = (value: string, paths?: Set<string>): void => {
  if (!paths) {
    return;
  }
  for (const match of value.matchAll(NUNJUCKS_REFERENCE)) {
    const path = getSafeNunjucksPath(match[0]);
    if (path) {
      paths.add(path);
    }
  }
};

const isTemplatedCredentialReference = (value: unknown): boolean => {
  if (typeof value !== 'string' || !value.includes('{{')) {
    return false;
  }
  const literal = stripSafeNunjucksReferences(value);
  if (literal === value) {
    return false;
  }
  const trimmedLiteral = literal.trim();
  return trimmedLiteral === '' || /^(?:bearer|basic|token|api[-_]?key)$/i.test(trimmedLiteral);
};

const preserveCredentialTemplate = (value: unknown, paths?: Set<string>): boolean => {
  if (!isTemplatedCredentialReference(value)) {
    return false;
  }
  recordCredentialTemplatePaths(value as string, paths);
  return true;
};

const isTemplatedUrlUserinfo = (value: string, paths?: Set<string>): boolean => {
  if (!value.includes('{{')) {
    return false;
  }
  const literal = stripSafeNunjucksReferences(value);
  const templated = literal !== value && /^:?$/.test(literal.trim());
  if (templated) {
    recordCredentialTemplatePaths(value, paths);
  }
  return templated;
};

const looksLikeUrlCredentialParameter = (rawName: string): boolean => {
  let name = rawName;
  try {
    name = decodeURIComponent(rawName);
  } catch {
    // Keep malformed parameter names unchanged for conservative matching.
  }
  return normalizeCredentialName(name) === 'sig' || looksLikeCredentialHeader(name);
};

const looksLikeCredentialPathSegment = (rawValue: string): boolean => {
  let value = rawValue;
  try {
    value = decodeURIComponent(rawValue);
  } catch {
    // Keep malformed segments unchanged for conservative matching.
  }
  return looksLikeSecret(value);
};

// Operate on URL text so Nunjucks placeholders remain intact and safe query
// settings retain their exact representation.
const scrubProviderUrl = (value: string, templatePaths?: Set<string>): string => {
  const scrubbed = value
    .replace(URL_USERINFO, (match, prefix, userinfo) =>
      isTemplatedUrlUserinfo(userinfo, templatePaths) ? match : `${prefix}[REDACTED]@`,
    )
    .replace(URL_QUERY_PARAMETER, (match, separator, name, parameterValue) =>
      looksLikeUrlCredentialParameter(name) &&
      !preserveCredentialTemplate(parameterValue, templatePaths)
        ? `${separator}${name}=[REDACTED]`
        : match,
    );
  return URL_PROTOCOL.test(scrubbed)
    ? scrubbed.replace(URL_PATH_SEGMENT, (match, segment) =>
        looksLikeCredentialPathSegment(segment) ? '/[REDACTED]' : match,
      )
    : scrubbed;
};

const looksLikeCredentialValue = (value: string, templatePaths?: Set<string>): boolean =>
  !isTemplatedCredentialReference(value) &&
  (looksLikeSecret(value.trim()) || scrubProviderUrl(value, templatePaths) !== value);

const looksLikeHeaderCredential = (
  headerName: string,
  value: unknown,
  templatePaths?: Set<string>,
): boolean =>
  looksLikeCredentialHeader(headerName) ||
  (typeof value === 'string' && looksLikeCredentialValue(value, templatePaths));

const FORM_PARAMETER = /(^|&)([^=&#]+)=([^&]*)/g;

const scrubHttpBodyString = (body: string, templatePaths?: Set<string>): string => {
  try {
    const parsed = JSON.parse(body) as unknown;
    if (parsed && typeof parsed === 'object') {
      return JSON.stringify(walkValue(parsed, 'body', new WeakSet<object>(), 0, templatePaths));
    }
  } catch {
    // Handle non-JSON request bodies below.
  }

  if (!body.includes('=')) {
    return looksLikeCredentialValue(body, templatePaths) ? '[REDACTED]' : body;
  }

  const scrubbed = body.replace(FORM_PARAMETER, (match, separator, key, value) =>
    (looksLikeUrlCredentialParameter(key) || looksLikeCredentialValue(value, templatePaths)) &&
    !preserveCredentialTemplate(value, templatePaths)
      ? `${separator}${key}=[REDACTED]`
      : match,
  );
  return scrubbed !== body || !looksLikeCredentialValue(body, templatePaths)
    ? scrubbed
    : '[REDACTED]';
};

// Only scan the header block, so body content that happens to resemble a
// credential header is not rewritten during persistence.
const scrubRawHttpRequest = (raw: string, templatePaths?: Set<string>): string => {
  const boundary = raw.match(/\r?\n\r?\n/);
  const headerEnd = boundary?.index ?? raw.length;
  const headerBlock = raw.slice(0, headerEnd);
  const separator = boundary?.[0] ?? '';
  const body = boundary ? raw.slice(headerEnd + separator.length) : '';
  const requestLine = /^(\S+[ \t]+)([^\r\n]*?)([ \t]+HTTP\/\d(?:\.\d)?[^\r\n]*)$/im;
  const headerLine = /^([ \t]*)([^:\r\n]+)([ \t]*:[ \t]*)(.*)$/gm;

  return (
    headerBlock
      .replace(
        requestLine,
        (_match, method, target, protocol) =>
          `${method}${scrubProviderUrl(target, templatePaths)}${protocol}`,
      )
      .replace(headerLine, (match, indent, name, headerSeparator, value) =>
        looksLikeHeaderCredential(name, value, templatePaths) &&
        !preserveCredentialTemplate(value, templatePaths)
          ? `${indent}${name}${headerSeparator}[REDACTED]`
          : match,
      ) +
    separator +
    (boundary ? scrubHttpBodyString(body, templatePaths) : body)
  );
};

const isMultipartFieldPart = (value: Record<string, unknown>): boolean =>
  value.kind === 'field' && typeof value.name === 'string';

// Guard against pathological user input: a cycle or extreme nesting in the
// in-memory config must not throw and bypass redaction. Both limits are far
// above any realistic provider config.
const MAX_WALK_DEPTH = 64;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const hasOwn = (value: object, key: PropertyKey): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

const omitOpaqueToolCredentials = (tool: unknown, templatePaths?: Set<string>): unknown => {
  if (!isRecord(tool) || tool.type !== 'mcp') {
    return tool;
  }

  const { authorization: _authorization, ...toolWithoutAuthorization } = tool;
  return {
    ...toolWithoutAuthorization,
    ...(preserveCredentialTemplate(tool.authorization, templatePaths)
      ? { authorization: tool.authorization }
      : {}),
    ...(typeof tool.server_url === 'string'
      ? { server_url: scrubProviderUrl(tool.server_url, templatePaths) }
      : {}),
    ...(isRecord(tool.headers)
      ? {
          headers: Object.fromEntries(
            Object.entries(tool.headers).filter(
              ([key, value]) =>
                !looksLikeHeaderCredential(key, value, templatePaths) ||
                preserveCredentialTemplate(value, templatePaths),
            ),
          ),
        }
      : {}),
  };
};

const walkValue = (
  value: unknown,
  parentKey: string | undefined,
  seen: WeakSet<object>,
  depth: number,
  templatePaths?: Set<string>,
): unknown => {
  if (typeof value === 'string') {
    if (parentKey === 'request') {
      return scrubRawHttpRequest(value, templatePaths);
    }
    if (parentKey === 'body') {
      return scrubHttpBodyString(value, templatePaths);
    }
    const scrubbedUrl = scrubProviderUrl(value, templatePaths);
    return scrubbedUrl !== value || !looksLikeSecret(value.trim()) ? scrubbedUrl : '[REDACTED]';
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  if (depth > MAX_WALK_DEPTH || seen.has(value as object)) {
    // Fail closed: drop the subtree rather than persist it unredacted.
    return Array.isArray(value) ? [] : {};
  }
  seen.add(value as object);

  try {
    const normalizedParent =
      parentKey === undefined ? undefined : normalizeCredentialName(parentKey);

    if (normalizedParent !== undefined && OPAQUE_PROVIDER_CONFIG_KEYS.has(normalizedParent)) {
      if (normalizedParent === 'tools') {
        return Array.isArray(value)
          ? value.map((tool) => omitOpaqueToolCredentials(tool, templatePaths))
          : omitOpaqueToolCredentials(value, templatePaths);
      }
      return value;
    }

    if (Array.isArray(value)) {
      return value.map((item) => walkValue(item, parentKey, seen, depth + 1, templatePaths));
    }

    const record = value as Record<string, unknown>;

    // HTTP multipart parts: `{ kind: 'field', name: 'api_key', value: '…' }`.
    // The credential indicator lives in `name`, not the object's own key.
    if (isMultipartFieldPart(record) && looksLikeCredential(record.name as string)) {
      return Object.fromEntries(
        Object.entries(record).flatMap(([key, nested]) => {
          if (key === 'value' || looksLikeCredential(key)) {
            return preserveCredentialTemplate(nested, templatePaths) ? [[key, nested]] : [];
          }
          return [[key, walkValue(nested, key, seen, depth + 1, templatePaths)]];
        }),
      );
    }

    const isApiKeyAuth = normalizedParent === 'auth' && record.type === 'api_key';
    const isHeaders = normalizedParent === 'headers';

    return Object.fromEntries(
      Object.entries(record).flatMap(([key, nestedValue]) => {
        const credential = isHeaders
          ? looksLikeHeaderCredential(key, nestedValue)
          : looksLikeCredential(key);
        if (credential || (isApiKeyAuth && key === 'value')) {
          return preserveCredentialTemplate(nestedValue, templatePaths) ? [[key, nestedValue]] : [];
        }
        return [[key, walkValue(nestedValue, key, seen, depth + 1, templatePaths)]];
      }),
    );
  } finally {
    seen.delete(value as object);
  }
};

const omitProviderCredentials = (
  value: unknown,
  parentKey?: string,
  templatePaths?: Set<string>,
): unknown => walkValue(value, parentKey, new WeakSet<object>(), 0, templatePaths);

const omitAssertionProviderCredentials = (
  assertions: unknown,
  templatePaths?: Set<string>,
): unknown => {
  if (!Array.isArray(assertions)) {
    return assertions;
  }

  return assertions.map((assertion) => {
    if (!isRecord(assertion)) {
      return assertion;
    }

    return {
      ...assertion,
      ...(hasOwn(assertion, 'provider')
        ? { provider: omitProviderCredentials(assertion.provider, undefined, templatePaths) }
        : {}),
      ...(hasOwn(assertion, 'config')
        ? { config: omitProviderCredentials(assertion.config, undefined, templatePaths) }
        : {}),
      ...(hasOwn(assertion, 'assert')
        ? { assert: omitAssertionProviderCredentials(assertion.assert, templatePaths) }
        : {}),
    };
  });
};

// `test.options` is merged into provider config at runtime, so any field on it
// (`headers`, `transform`, etc.) can end up holding credential material. We
// walk it the same way we walk a provider config.
const omitTestOptionsCredentials = (options: unknown, templatePaths?: Set<string>): unknown => {
  if (!isRecord(options)) {
    return options;
  }
  return omitProviderCredentials(options, undefined, templatePaths);
};

const omitTestCaseProviderCredentials = (
  testCase: unknown,
  templatePaths?: Set<string>,
): unknown => {
  if (!isRecord(testCase)) {
    return testCase;
  }

  return {
    ...testCase,
    ...(hasOwn(testCase, 'provider')
      ? { provider: omitProviderCredentials(testCase.provider, undefined, templatePaths) }
      : {}),
    ...(hasOwn(testCase, 'options')
      ? { options: omitTestOptionsCredentials(testCase.options, templatePaths) }
      : {}),
    ...(hasOwn(testCase, 'assert')
      ? { assert: omitAssertionProviderCredentials(testCase.assert, templatePaths) }
      : {}),
  };
};

const omitTestGeneratorCredentials = (
  testGenerator: unknown,
  templatePaths?: Set<string>,
): unknown => {
  if (!isRecord(testGenerator) || typeof testGenerator.path !== 'string') {
    return omitTestCaseProviderCredentials(testGenerator, templatePaths);
  }

  return {
    ...testGenerator,
    ...(hasOwn(testGenerator, 'config')
      ? { config: omitProviderCredentials(testGenerator.config, undefined, templatePaths) }
      : {}),
  };
};

const omitTestsCredentials = (tests: unknown, templatePaths?: Set<string>): unknown => {
  if (typeof tests === 'string') {
    return redactAzureBlobSasTokens(tests);
  }
  if (Array.isArray(tests)) {
    return tests.map((test) =>
      typeof test === 'string'
        ? redactAzureBlobSasTokens(test)
        : omitTestGeneratorCredentials(test, templatePaths),
    );
  }
  return omitTestGeneratorCredentials(tests, templatePaths);
};

const omitScenarioProviderCredentials = (
  scenario: unknown,
  templatePaths?: Set<string>,
): unknown => {
  if (!isRecord(scenario)) {
    return scenario;
  }

  return {
    ...scenario,
    ...(Array.isArray(scenario.config)
      ? {
          config: scenario.config.map((test) =>
            omitTestCaseProviderCredentials(test, templatePaths),
          ),
        }
      : {}),
    ...(Array.isArray(scenario.tests)
      ? {
          tests: scenario.tests.map((test) => omitTestCaseProviderCredentials(test, templatePaths)),
        }
      : {}),
  };
};

const omitRedteamProviderCredentials = (redteam: unknown, templatePaths?: Set<string>): unknown => {
  if (!isRecord(redteam)) {
    return redteam;
  }

  return {
    ...redteam,
    ...(hasOwn(redteam, 'provider')
      ? { provider: omitProviderCredentials(redteam.provider, undefined, templatePaths) }
      : {}),
    ...(Array.isArray(redteam.plugins)
      ? {
          plugins: redteam.plugins.map((plugin) =>
            isRecord(plugin) && hasOwn(plugin, 'config')
              ? {
                  ...plugin,
                  config: omitProviderCredentials(plugin.config, undefined, templatePaths),
                }
              : plugin,
          ),
        }
      : {}),
    ...(Array.isArray(redteam.strategies)
      ? {
          strategies: redteam.strategies.map((strategy) => {
            if (!isRecord(strategy) || !hasOwn(strategy, 'config')) {
              return strategy;
            }
            return {
              ...strategy,
              config: omitProviderCredentials(strategy.config, undefined, templatePaths),
            };
          }),
        }
      : {}),
  };
};

// Prompts can be either strings or `{ raw, label, config }` objects whose
// `config` is merged into provider config at runtime. Walk the embedded
// configs so we do not bypass redaction via the prompt slot.
const omitPromptCredentials = (prompts: unknown, templatePaths?: Set<string>): unknown => {
  if (typeof prompts === 'string' || prompts === undefined || prompts === null) {
    return prompts;
  }
  if (Array.isArray(prompts)) {
    return prompts.map((prompt) => omitPromptCredentials(prompt, templatePaths));
  }
  if (!isRecord(prompts)) {
    return prompts;
  }
  if (!hasOwn(prompts, 'config')) {
    return prompts;
  }
  return {
    ...prompts,
    config: omitProviderCredentials(prompts.config, undefined, templatePaths),
  };
};

// OTLP trace forwarding can carry an `Authorization` header. The rest of the
// tracing block is non-secret runtime config.
const omitTracingCredentials = (tracing: unknown, templatePaths?: Set<string>): unknown => {
  if (!isRecord(tracing) || !isRecord(tracing.forwarding)) {
    return tracing;
  }
  const forwarding = tracing.forwarding;
  return {
    ...tracing,
    forwarding: {
      ...forwarding,
      ...(typeof forwarding.endpoint === 'string'
        ? { endpoint: scrubProviderUrl(forwarding.endpoint, templatePaths) }
        : {}),
      ...(isRecord(forwarding.headers)
        ? {
            headers: Object.fromEntries(
              Object.entries(forwarding.headers).filter(
                ([key, value]) =>
                  !looksLikeHeaderCredential(key, value, templatePaths) ||
                  preserveCredentialTemplate(value, templatePaths),
              ),
            ),
          }
        : {}),
    },
  };
};

const omitSensitiveEnv = (env: Partial<UnifiedConfig>['env']): Partial<UnifiedConfig>['env'] => {
  if (!env || typeof env !== 'object') {
    return env;
  }
  const filtered = Object.fromEntries(
    Object.entries(env).filter(
      ([key, value]) =>
        !looksLikeCredential(key) &&
        !(typeof value === 'string' && looksLikeCredentialValue(value)),
    ),
  );
  return filtered as Partial<UnifiedConfig>['env'];
};

const omitNestedPath = (
  record: Record<string, unknown>,
  path: string[],
): Record<string, unknown> => {
  const [head, ...tail] = path;
  if (!head || !hasOwn(record, head)) {
    return record;
  }
  if (tail.length === 0) {
    const { [head]: _removed, ...rest } = record;
    return rest;
  }
  if (!isRecord(record[head])) {
    return record;
  }
  return { ...record, [head]: omitNestedPath(record[head], tail) };
};

const omitReferencedCredentialVars = (vars: unknown, templatePaths: Set<string>): unknown => {
  if (!isRecord(vars) || templatePaths.size === 0) {
    return vars;
  }
  return Array.from(templatePaths)
    .filter((path) => !path.startsWith('env.'))
    .reduce((sanitized, path) => omitNestedPath(sanitized, path.split('.')), vars);
};

const omitReferencedCredentialEnv = (
  env: Partial<UnifiedConfig>['env'],
  templatePaths: Set<string>,
): Partial<UnifiedConfig>['env'] => {
  if (!isRecord(env) || templatePaths.size === 0) {
    return env;
  }
  return Array.from(templatePaths)
    .filter((path) => path.startsWith('env.'))
    .reduce(
      (sanitized, path) => omitNestedPath(sanitized, path.slice('env.'.length).split('.')),
      env,
    ) as Partial<UnifiedConfig>['env'];
};

const omitTestCaseCredentialVars = (testCase: unknown, templatePaths: Set<string>): unknown => {
  if (!isRecord(testCase) || !hasOwn(testCase, 'vars')) {
    return testCase;
  }
  return { ...testCase, vars: omitReferencedCredentialVars(testCase.vars, templatePaths) };
};

const omitTestsCredentialVars = (tests: unknown, templatePaths: Set<string>): unknown =>
  Array.isArray(tests)
    ? tests.map((test) => omitTestCaseCredentialVars(test, templatePaths))
    : omitTestCaseCredentialVars(tests, templatePaths);

const omitScenarioCredentialVars = (scenario: unknown, templatePaths: Set<string>): unknown => {
  if (!isRecord(scenario)) {
    return scenario;
  }
  return {
    ...scenario,
    ...(Array.isArray(scenario.config)
      ? { config: scenario.config.map((test) => omitTestCaseCredentialVars(test, templatePaths)) }
      : {}),
    ...(Array.isArray(scenario.tests)
      ? { tests: scenario.tests.map((test) => omitTestCaseCredentialVars(test, templatePaths)) }
      : {}),
  };
};

const buildSanitizedConfig = (config: Partial<UnifiedConfig>): Partial<UnifiedConfig> => {
  const templatePaths = new Set<string>();
  const configWithoutAzureSas = redactAzureBlobSasTokens(config);
  const sanitized = {
    ...configWithoutAzureSas,
    env: omitSensitiveEnv(configWithoutAzureSas.env),
    providers: omitProviderCredentials(
      configWithoutAzureSas.providers,
      undefined,
      templatePaths,
    ) as Partial<UnifiedConfig>['providers'],
    targets: omitProviderCredentials(
      configWithoutAzureSas.targets,
      undefined,
      templatePaths,
    ) as Partial<UnifiedConfig>['targets'],
    prompts: omitPromptCredentials(
      configWithoutAzureSas.prompts,
      templatePaths,
    ) as Partial<UnifiedConfig>['prompts'],
    defaultTest: omitTestCaseProviderCredentials(
      configWithoutAzureSas.defaultTest,
      templatePaths,
    ) as Partial<UnifiedConfig>['defaultTest'],
    tests: omitTestsCredentials(
      configWithoutAzureSas.tests,
      templatePaths,
    ) as Partial<UnifiedConfig>['tests'],
    scenarios: Array.isArray(configWithoutAzureSas.scenarios)
      ? (configWithoutAzureSas.scenarios.map((scenario) =>
          omitScenarioProviderCredentials(scenario, templatePaths),
        ) as Partial<UnifiedConfig>['scenarios'])
      : configWithoutAzureSas.scenarios,
    redteam: omitRedteamProviderCredentials(
      configWithoutAzureSas.redteam,
      templatePaths,
    ) as Partial<UnifiedConfig>['redteam'],
    ...(hasOwn(configWithoutAzureSas, 'tracing')
      ? {
          tracing: omitTracingCredentials(
            configWithoutAzureSas.tracing,
            templatePaths,
          ) as Partial<UnifiedConfig>['tracing'],
        }
      : {}),
  };
  return {
    ...sanitized,
    env: omitReferencedCredentialEnv(sanitized.env, templatePaths),
    defaultTest: omitTestCaseCredentialVars(
      sanitized.defaultTest,
      templatePaths,
    ) as Partial<UnifiedConfig>['defaultTest'],
    tests: omitTestsCredentialVars(
      sanitized.tests,
      templatePaths,
    ) as Partial<UnifiedConfig>['tests'],
    scenarios: Array.isArray(sanitized.scenarios)
      ? (sanitized.scenarios.map((scenario) =>
          omitScenarioCredentialVars(scenario, templatePaths),
        ) as Partial<UnifiedConfig>['scenarios'])
      : sanitized.scenarios,
  };
};

// Fail closed: if redaction throws (e.g. on a pathological config) we must
// never let zustand persist the raw state instead. Returning the defaults
// loses unsaved UI work but never leaks credentials.
const omitPersistedSensitiveValues = (config: Partial<UnifiedConfig>): Partial<UnifiedConfig> => {
  try {
    return buildSanitizedConfig(config);
  } catch (err) {
    if (typeof console !== 'undefined' && console.error) {
      console.error('[evalConfig] credential redaction failed; persisting defaults', err);
    }
    return { ...DEFAULT_CONFIG };
  }
};

export const useStore = create<EvalConfigState>()(
  persist(
    (set, get) => ({
      config: { ...DEFAULT_CONFIG },

      setConfig: (config) => set({ config }),

      updateConfig: (updates) =>
        set((state) => ({
          config: { ...state.config, ...updates },
        })),

      reset: () => set({ config: { ...DEFAULT_CONFIG } }),

      getTestSuite: () => {
        const { config } = get();

        // Transform config to match the expected EvaluateTestSuiteWithEvaluateOptions format
        // Note: The 'tests' field in UnifiedConfig maps to 'testCases' in the old store
        return {
          description: config.description,
          env: config.env,
          extensions: config.extensions,
          prompts: config.prompts,
          providers: config.providers,
          scenarios: config.scenarios,
          tests: config.tests || [], // This is what was 'testCases' before
          evaluateOptions: config.evaluateOptions,
          defaultTest: config.defaultTest,
          derivedMetrics: config.derivedMetrics,
        } as EvaluateTestSuiteWithEvaluateOptions;
      },
    }),
    {
      name: 'promptfoo',
      skipHydration: true,
      partialize: (state) => ({
        config: omitPersistedSensitiveValues(state.config),
      }),
      merge: (persistedState, currentState) => {
        const persistedConfig = (persistedState as Partial<EvalConfigState> | undefined)?.config;

        return {
          ...currentState,
          ...(persistedState as Partial<EvalConfigState> | undefined),
          config: omitPersistedSensitiveValues({
            ...DEFAULT_CONFIG,
            ...persistedConfig,
          }),
        };
      },
      onRehydrateStorage: () => (state) => {
        // Re-persist so credentials dropped during merge are also cleared from storage.
        state?.setConfig(state.config);
      },
    },
  ),
);
