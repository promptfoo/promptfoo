import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { looksLikeSecret, sanitizeObject } from '../../../util/sanitizer';

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

// Field names whose value is always credential material (inline cert/keystore
// bytes), even when the name itself does not match the credential token regex.
const INLINE_CREDENTIAL_MATERIAL_NAMES = new Set([
  'ca',
  'cert',
  'cert_content',
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

const looksLikeUrlCredentialParameter = (rawName: string): boolean => {
  let name = rawName;
  try {
    name = decodeURIComponent(rawName);
  } catch {
    // Keep malformed parameter names unchanged for conservative matching.
  }
  return normalizeCredentialName(name) === 'sig' || looksLikeCredentialHeader(name);
};

// Operate on URL text so Nunjucks placeholders remain intact and safe query
// settings retain their exact representation.
const scrubProviderUrl = (value: string): string =>
  value
    .replace(URL_USERINFO, '$1[REDACTED]@')
    .replace(URL_QUERY_PARAMETER, (match, separator, name) =>
      looksLikeUrlCredentialParameter(name) ? `${separator}${name}=[REDACTED]` : match,
    );

const looksLikeCredentialValue = (value: string): boolean =>
  looksLikeSecret(value.trim()) || scrubProviderUrl(value) !== value;

const looksLikeHeaderCredential = (headerName: string, value: unknown): boolean =>
  looksLikeCredentialHeader(headerName) ||
  (typeof value === 'string' && looksLikeCredentialValue(value));

const scrubHttpBodyString = (body: string): string => {
  const sanitizedBody = sanitizeObject(body, { context: 'persisted HTTP request body' }) as string;
  if (!sanitizedBody.includes('=')) {
    return sanitizedBody;
  }

  const params = new URLSearchParams(sanitizedBody);
  let changed = false;
  for (const [key, value] of params.entries()) {
    if (looksLikeCredential(key) || looksLikeCredentialValue(value)) {
      params.set(key, '[REDACTED]');
      changed = true;
    }
  }
  return changed ? params.toString() : sanitizedBody;
};

// Only scan the header block, so body content that happens to resemble a
// credential header is not rewritten during persistence.
const scrubRawHttpRequest = (raw: string): string => {
  const boundary = raw.match(/\r?\n\r?\n/);
  const headerEnd = boundary?.index ?? raw.length;
  const headerBlock = raw.slice(0, headerEnd);
  const separator = boundary?.[0] ?? '';
  const body = boundary ? raw.slice(headerEnd + separator.length) : '';
  const requestLine = /^(\S+[ \t]+)(\S+)([ \t]+HTTP\/\d(?:\.\d)?[^\r\n]*)$/im;
  const headerLine = /^([ \t]*)([^:\r\n]+)([ \t]*:[ \t]*)(.*)$/gm;

  return (
    headerBlock
      .replace(
        requestLine,
        (_match, method, target, protocol) => `${method}${scrubProviderUrl(target)}${protocol}`,
      )
      .replace(headerLine, (match, indent, name, headerSeparator, value) =>
        looksLikeHeaderCredential(name, value)
          ? `${indent}${name}${headerSeparator}[REDACTED]`
          : match,
      ) +
    separator +
    (boundary ? scrubHttpBodyString(body) : body)
  );
};

const isMultipartFieldPart = (value: Record<string, unknown>): boolean =>
  value.kind === 'field' && typeof value.name === 'string';

// Guard against pathological user input: a cycle or extreme nesting in the
// in-memory config must not throw and bypass redaction. Both limits are far
// above any realistic provider config.
const MAX_WALK_DEPTH = 64;

const walkValue = (
  value: unknown,
  parentKey: string | undefined,
  seen: WeakSet<object>,
  depth: number,
): unknown => {
  if (typeof value === 'string') {
    if (parentKey === 'request') {
      return scrubRawHttpRequest(value);
    }
    if (parentKey === 'body') {
      return scrubHttpBodyString(value);
    }
    const scrubbedUrl = scrubProviderUrl(value);
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
    if (Array.isArray(value)) {
      return value.map((item) => walkValue(item, parentKey, seen, depth + 1));
    }

    const normalizedParent =
      parentKey === undefined ? undefined : normalizeCredentialName(parentKey);

    if (normalizedParent !== undefined && OPAQUE_PROVIDER_CONFIG_KEYS.has(normalizedParent)) {
      return value;
    }

    const record = value as Record<string, unknown>;

    // HTTP multipart parts: `{ kind: 'field', name: 'api_key', value: '…' }`.
    // The credential indicator lives in `name`, not the object's own key.
    if (isMultipartFieldPart(record) && looksLikeCredential(record.name as string)) {
      return Object.fromEntries(
        Object.entries(record).flatMap(([key, nested]) =>
          key === 'value' || looksLikeCredential(key)
            ? []
            : [[key, walkValue(nested, key, seen, depth + 1)]],
        ),
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
          return [];
        }
        return [[key, walkValue(nestedValue, key, seen, depth + 1)]];
      }),
    );
  } finally {
    seen.delete(value as object);
  }
};

const omitProviderCredentials = (value: unknown, parentKey?: string): unknown =>
  walkValue(value, parentKey, new WeakSet<object>(), 0);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const hasOwn = (value: object, key: PropertyKey): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

const omitAssertionProviderCredentials = (assertions: unknown): unknown => {
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
        ? { provider: omitProviderCredentials(assertion.provider) }
        : {}),
      ...(hasOwn(assertion, 'assert')
        ? { assert: omitAssertionProviderCredentials(assertion.assert) }
        : {}),
    };
  });
};

// `test.options` is merged into provider config at runtime, so any field on it
// (`headers`, `transform`, etc.) can end up holding credential material. We
// walk it the same way we walk a provider config.
const omitTestOptionsCredentials = (options: unknown): unknown => {
  if (!isRecord(options)) {
    return options;
  }
  return omitProviderCredentials(options);
};

const omitTestCaseProviderCredentials = (testCase: unknown): unknown => {
  if (!isRecord(testCase)) {
    return testCase;
  }

  return {
    ...testCase,
    ...(hasOwn(testCase, 'provider')
      ? { provider: omitProviderCredentials(testCase.provider) }
      : {}),
    ...(hasOwn(testCase, 'options')
      ? { options: omitTestOptionsCredentials(testCase.options) }
      : {}),
    ...(hasOwn(testCase, 'assert')
      ? { assert: omitAssertionProviderCredentials(testCase.assert) }
      : {}),
  };
};

const omitScenarioProviderCredentials = (scenario: unknown): unknown => {
  if (!isRecord(scenario)) {
    return scenario;
  }

  return {
    ...scenario,
    ...(Array.isArray(scenario.config)
      ? { config: scenario.config.map(omitTestCaseProviderCredentials) }
      : {}),
    ...(Array.isArray(scenario.tests)
      ? { tests: scenario.tests.map(omitTestCaseProviderCredentials) }
      : {}),
  };
};

const omitRedteamProviderCredentials = (redteam: unknown): unknown => {
  if (!isRecord(redteam) || !hasOwn(redteam, 'provider')) {
    return redteam;
  }

  return {
    ...redteam,
    provider: omitProviderCredentials(redteam.provider),
  };
};

// Prompts can be either strings or `{ raw, label, config }` objects whose
// `config` is merged into provider config at runtime. Walk the embedded
// configs so we do not bypass redaction via the prompt slot.
const omitPromptCredentials = (prompts: unknown): unknown => {
  if (typeof prompts === 'string' || prompts === undefined || prompts === null) {
    return prompts;
  }
  if (Array.isArray(prompts)) {
    return prompts.map(omitPromptCredentials);
  }
  if (!isRecord(prompts)) {
    return prompts;
  }
  if (!hasOwn(prompts, 'config')) {
    return prompts;
  }
  return {
    ...prompts,
    config: omitProviderCredentials(prompts.config),
  };
};

// OTLP trace forwarding can carry an `Authorization` header. The rest of the
// tracing block is non-secret runtime config.
const omitTracingCredentials = (tracing: unknown): unknown => {
  if (!isRecord(tracing) || !isRecord(tracing.forwarding)) {
    return tracing;
  }
  const forwarding = tracing.forwarding;
  return {
    ...tracing,
    forwarding: {
      ...forwarding,
      ...(typeof forwarding.endpoint === 'string'
        ? { endpoint: scrubProviderUrl(forwarding.endpoint) }
        : {}),
      ...(isRecord(forwarding.headers)
        ? {
            headers: Object.fromEntries(
              Object.entries(forwarding.headers).filter(
                ([key, value]) => !looksLikeHeaderCredential(key, value),
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

const buildSanitizedConfig = (config: Partial<UnifiedConfig>): Partial<UnifiedConfig> => ({
  ...config,
  env: omitSensitiveEnv(config.env),
  providers: omitProviderCredentials(config.providers) as Partial<UnifiedConfig>['providers'],
  targets: omitProviderCredentials(config.targets) as Partial<UnifiedConfig>['targets'],
  prompts: omitPromptCredentials(config.prompts) as Partial<UnifiedConfig>['prompts'],
  defaultTest: omitTestCaseProviderCredentials(
    config.defaultTest,
  ) as Partial<UnifiedConfig>['defaultTest'],
  tests: Array.isArray(config.tests)
    ? (config.tests.map(omitTestCaseProviderCredentials) as Partial<UnifiedConfig>['tests'])
    : config.tests,
  scenarios: Array.isArray(config.scenarios)
    ? (config.scenarios.map(omitScenarioProviderCredentials) as Partial<UnifiedConfig>['scenarios'])
    : config.scenarios,
  redteam: omitRedteamProviderCredentials(config.redteam) as Partial<UnifiedConfig>['redteam'],
  ...(hasOwn(config, 'tracing')
    ? { tracing: omitTracingCredentials(config.tracing) as Partial<UnifiedConfig>['tracing'] }
    : {}),
});

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
