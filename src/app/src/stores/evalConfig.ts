import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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

// Names that look like credentials in any casing convention. A few runtime
// selectors contain these words without storing secret material, so they are
// allowlisted below.
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

// Header names that look like auth carriers but escape the main regex (e.g. a
// bare `Auth` or `X-Auth` header). Only checked when the parent key is the
// well-known `headers` bag.
const HEADER_CREDENTIAL_NAMES = new Set([
  'auth',
  'x_auth',
  'proxy_authorization',
  'x_amz_security_token',
]);

// Common header-name prefixes for secrets in raw HTTP request strings.
const RAW_HTTP_SECRET_HEADERS =
  /^([ \t]*)(authorization|proxy[-_]authorization|cookie|set[-_]cookie|x[-_]api[-_]key|x[-_]auth[-_]token|x[-_]auth|x[-_]amz[-_]security[-_]token|api[-_]key|bearer)([ \t]*:[ \t]*)(.+)$/gim;

const NON_SECRET_CREDENTIAL_NAME_PATTERNS = [
  /(?:^|_)api_bearer_token_envar$/,
  /(?:^|_)api_key_envar$/,
  /(?:^|_)api_key_required$/,
  /(?:^|_)azure_token_scope$/,
  /(?:^|_)key_alias$/,
  /(?:^|_)key_filename$/,
  /(?:^|_)key_name$/,
  /(?:^|_)key_path$/,
  // `max_tokens`, `max_completion_tokens`, `max_new_tokens`,
  // `max_tokens_to_sample`, `max_response_tokens`, `max_thinking_tokens`, ...
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

const normalizeCredentialName = (name: string): string =>
  name
    // Split camelCase boundaries (`abcDef` → `abc_Def`).
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    // Split adjacent-uppercase → trailing-mixed (`SSHKey` → `SSH_Key`,
    // `JSONWebToken` → after first pass: `JSONWeb_Token`; here: `JSON_Web_Token`).
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

// Scrub `Authorization: Bearer …` and similar lines from raw HTTP request
// strings persisted under HTTP provider `config.request`. Returns the original
// string unchanged when nothing matches.
const scrubRawHttpRequest = (raw: string): string =>
  raw.replace(RAW_HTTP_SECRET_HEADERS, (_match, indent, name, sep) => `${indent}${name}${sep}[REDACTED]`);

const isMultipartFieldPart = (value: Record<string, unknown>): boolean =>
  value.kind === 'field' && typeof value.name === 'string';

const omitProviderCredentials = (value: unknown, parentKey?: string): unknown => {
  if (typeof value === 'string') {
    if (parentKey === 'request') {
      return scrubRawHttpRequest(value);
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => omitProviderCredentials(item, parentKey));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const normalizedParent = parentKey === undefined ? undefined : normalizeCredentialName(parentKey);

  if (normalizedParent !== undefined && OPAQUE_PROVIDER_CONFIG_KEYS.has(normalizedParent)) {
    // Model-facing schema; do not redact field names inside.
    return value;
  }

  const record = value as Record<string, unknown>;

  // HTTP multipart parts: `{ kind: 'field', name: 'api_key', value: '…' }`.
  // The credential indicator lives in `name`, not the object's own key.
  if (isMultipartFieldPart(record) && looksLikeCredential(record.name as string)) {
    return Object.fromEntries(
      Object.entries(record).flatMap(([key, nested]) =>
        key === 'value' ? [] : [[key, omitProviderCredentials(nested, key)]],
      ),
    );
  }

  const isApiKeyAuth = normalizedParent === 'auth' && record.type === 'api_key';
  const isHeaders = normalizedParent === 'headers';

  return Object.fromEntries(
    Object.entries(record).flatMap(([key, nestedValue]) => {
      const credential = isHeaders ? looksLikeCredentialHeader(key) : looksLikeCredential(key);
      if (credential || (isApiKeyAuth && key === 'value')) {
        return [];
      }
      return [[key, omitProviderCredentials(nestedValue, key)]];
    }),
  );
};

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
    ...(hasOwn(testCase, 'options') ? { options: omitTestOptionsCredentials(testCase.options) } : {}),
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
  if (!isRecord(forwarding.headers)) {
    return tracing;
  }
  const headers = Object.fromEntries(
    Object.entries(forwarding.headers).filter(([key]) => !looksLikeCredentialHeader(key)),
  );
  return {
    ...tracing,
    forwarding: {
      ...forwarding,
      headers,
    },
  };
};

const omitSensitiveEnv = (env: Partial<UnifiedConfig>['env']): Partial<UnifiedConfig>['env'] => {
  if (!env || typeof env !== 'object') {
    return env;
  }
  const filtered = Object.fromEntries(
    Object.entries(env).filter(([key]) => !looksLikeCredential(key)),
  );
  return filtered as Partial<UnifiedConfig>['env'];
};

const omitPersistedSensitiveValues = (config: Partial<UnifiedConfig>): Partial<UnifiedConfig> => {
  return {
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
      ? (config.scenarios.map(
          omitScenarioProviderCredentials,
        ) as Partial<UnifiedConfig>['scenarios'])
      : config.scenarios,
    redteam: omitRedteamProviderCredentials(config.redteam) as Partial<UnifiedConfig>['redteam'],
    ...(hasOwn(config, 'tracing')
      ? {
          tracing: omitTracingCredentials(config.tracing) as Partial<UnifiedConfig>['tracing'],
        }
      : {}),
  };
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
        // Purge credentials persisted by earlier app versions after sanitizing the loaded state.
        state?.setConfig(state.config);
      },
    },
  ),
);
