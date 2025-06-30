import 'dotenv/config';
import cliState from './cliState';
import type { EnvOverrides } from './types/env';

// Define the supported environment variables and their types
export type EnvVars = {
  //=========================================================================
  // Core promptfoo configuration
  //=========================================================================
  LOG_LEVEL?: 'error' | 'warn' | 'info' | 'debug';
  NODE_ENV?: string;
  npm_execpath?: string;
  npm_lifecycle_script?: string;

  //=========================================================================
  // promptfoo feature flags
  //=========================================================================
  PROMPTFOO_CACHE_ENABLED?: boolean;
  PROMPTFOO_DISABLE_AJV_STRICT_MODE?: boolean;
  PROMPTFOO_DISABLE_CONVERSATION_VAR?: boolean;
  PROMPTFOO_DISABLE_ERROR_LOG?: boolean;
  PROMPTFOO_DISABLE_JSON_AUTOESCAPE?: boolean;
  PROMPTFOO_DISABLE_MULTIMEDIA_AS_BASE64?: boolean;
  PROMPTFOO_DISABLE_OBJECT_STRINGIFY?: boolean;
  PROMPTFOO_DISABLE_PDF_AS_TEXT?: boolean;
  PROMPTFOO_DISABLE_REDTEAM_MODERATION?: boolean;
  PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION?: boolean;
  PROMPTFOO_DISABLE_REF_PARSER?: boolean;
  PROMPTFOO_DISABLE_SHARE_EMAIL_REQUEST?: boolean;
  PROMPTFOO_DISABLE_SHARE_WARNING?: boolean;
  PROMPTFOO_DISABLE_SHARING?: boolean;
  PROMPTFOO_DISABLE_TELEMETRY?: boolean;
  PROMPTFOO_DISABLE_TEMPLATE_ENV_VARS?: boolean;
  PROMPTFOO_DISABLE_TEMPLATING?: boolean;
  PROMPTFOO_DISABLE_UPDATE?: boolean;
  PROMPTFOO_DISABLE_VAR_EXPANSION?: boolean;
  PROMPTFOO_ENABLE_DATABASE_LOGS?: boolean;
  PROMPTFOO_EVAL_TIMEOUT_MS?: number;
  PROMPTFOO_EXPERIMENTAL?: boolean;
  PROMPTFOO_MAX_EVAL_TIME_MS?: number;
  PROMPTFOO_NO_TESTCASE_ASSERT_WARNING?: boolean;
  PROMPTFOO_RETRY_5XX?: boolean;
  PROMPTFOO_SELF_HOSTED?: boolean;
  PROMPTFOO_SHORT_CIRCUIT_TEST_FAILURES?: boolean;
  PROMPTFOO_STRICT_FILES?: boolean;
  PROMPTFOO_STRIP_GRADING_RESULT?: boolean;
  PROMPTFOO_STRIP_METADATA?: boolean;
  PROMPTFOO_STRIP_PROMPT_TEXT?: boolean;
  PROMPTFOO_STRIP_RESPONSE_OUTPUT?: boolean;
  PROMPTFOO_STRIP_TEST_VARS?: boolean;
  PROMPTFOO_TELEMETRY_DEBUG?: boolean;

  //=========================================================================
  // promptfoo configuration options
  //=========================================================================
  PROMPTFOO_ASSERTIONS_MAX_CONCURRENCY?: number;
  PROMPTFOO_AUTHOR?: string;
  PROMPTFOO_CACHE_MAX_FILE_COUNT?: number;
  PROMPTFOO_CACHE_MAX_SIZE?: number;
  PROMPTFOO_CACHE_PATH?: string;
  PROMPTFOO_CACHE_TTL?: number;
  PROMPTFOO_CACHE_TYPE?: 'memory' | 'disk';
  PROMPTFOO_CLOUD_API_URL?: string;
  PROMPTFOO_CONFIG_DIR?: string;
  PROMPTFOO_CSV_DELIMITER?: string;
  PROMPTFOO_CSV_STRICT?: boolean;
  PROMPTFOO_DELAY_MS?: number;
  PROMPTFOO_FAILED_TEST_EXIT_CODE?: number;
  PROMPTFOO_INSECURE_SSL?: boolean | string;
  PROMPTFOO_JAILBREAK_TEMPERATURE?: string;
  PROMPTFOO_LOG_DIR?: string;
  PROMPTFOO_MAX_HARMFUL_TESTS_PER_REQUEST?: number;
  PROMPTFOO_NUM_JAILBREAK_ITERATIONS?: string;
  PROMPTFOO_PASS_RATE_THRESHOLD?: number;
  PROMPTFOO_PROMPT_SEPARATOR?: string;
  PROMPTFOO_PYTHON?: string;
  PROMPTFOO_REMOTE_API_BASE_URL?: string;
  PROMPTFOO_REMOTE_APP_BASE_URL?: string;
  PROMPTFOO_REMOTE_GENERATION_URL?: string;
  PROMPTFOO_REQUEST_BACKOFF_MS?: number;
  PROMPTFOO_REQUIRE_JSON_PROMPTS?: boolean;
  PROMPTFOO_SHARING_APP_BASE_URL?: string;
  PROMPTFOO_SHARE_CHUNK_SIZE?: number;
  PROMPTFOO_UNALIGNED_INFERENCE_ENDPOINT?: string;
  PROMPTFOO_CA_CERT_PATH?: string;

  //=========================================================================
  // HTTP proxy settings
  //=========================================================================
  ALL_PROXY?: string;
  all_proxy?: string;
  HTTP_PROXY?: string;
  http_proxy?: string;
  HTTPS_PROXY?: string;
  https_proxy?: string;
  NO_PROXY?: string;
  no_proxy?: string;

  //=========================================================================
  // System and network settings
  //=========================================================================
  API_HOST?: string;
  API_PORT?: string | number;
  DISPLAY?: string;
  IS_TESTING?: string | boolean;
  JEST_WORKER_ID?: string;
  NODE_EXTRA_CA_CERTS?: string;
  NODE_TLS_REJECT_UNAUTHORIZED?: string;
  REQUEST_TIMEOUT_MS?: number;
  RESULT_HISTORY_LENGTH?: number;
  WEBHOOK_TIMEOUT?: number;

  // Posthog
  PROMPTFOO_POSTHOG_KEY?: string;
  PROMPTFOO_POSTHOG_HOST?: string;

  //=========================================================================
  // UI configuration
  //=========================================================================
  /**
   * @deprecated Use PROMPTFOO_REMOTE_APP_BASE_URL instead
   */
  NEXT_PUBLIC_PROMPTFOO_BASE_URL?: string;
  /**
   * @deprecated Use PROMPTFOO_REMOTE_API_BASE_URL instead
   */
  NEXT_PUBLIC_PROMPTFOO_REMOTE_API_BASE_URL?: string;
  VITE_PUBLIC_BASENAME?: string;
  VITE_PUBLIC_PROMPTFOO_APP_SHARE_URL?: string;
  VITE_PUBLIC_PROMPTFOO_REMOTE_API_BASE_URL?: string;
  VITE_PUBLIC_PROMPTFOO_SHARE_API_URL?: string;

  //=========================================================================
  // Continuous Integration
  //=========================================================================
  APPVEYOR?: boolean;
  BITBUCKET_COMMIT?: boolean;
  BUDDY?: boolean;
  BUILDKITE?: boolean;
  CI?: boolean;
  CIRCLECI?: boolean;
  CODEBUILD_BUILD_ID?: boolean;
  GITHUB_ACTIONS?: boolean;
  GITLAB_CI?: boolean;
  JENKINS?: boolean;
  TEAMCITY_VERSION?: boolean;
  TF_BUILD?: boolean;
  TRAVIS?: boolean;

  //=========================================================================
  // Provider-specific settings
  //=========================================================================
  // AI21
  AI21_API_BASE_URL?: string;
  AI21_API_KEY?: string;

  // Anthropic
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_MAX_TOKENS?: number;
  ANTHROPIC_STOP?: string;
  ANTHROPIC_TEMPERATURE?: number;

  // AWS Bedrock
  AWS_BEDROCK_FREQUENCY_PENALTY?: string;
  AWS_BEDROCK_MAX_GEN_LEN?: number;
  AWS_BEDROCK_MAX_NEW_TOKENS?: number;
  AWS_BEDROCK_MAX_RETRIES?: string;
  AWS_BEDROCK_MAX_TOKENS?: string;
  AWS_BEDROCK_PRESENCE_PENALTY?: string;
  AWS_BEDROCK_REGION?: string;
  AWS_BEDROCK_STOP?: string;
  AWS_BEDROCK_TEMPERATURE?: number;
  AWS_BEDROCK_TOP_P?: string;
  CEREBRAS_API_KEY?: string;

  // Azure OpenAI auth params
  AZURE_AUTHORITY_HOST?: string;
  AZURE_CLIENT_ID?: string;
  AZURE_CLIENT_SECRET?: string;
  AZURE_DEPLOYMENT_NAME?: string;
  AZURE_EMBEDDING_DEPLOYMENT_NAME?: string;
  AZURE_OPENAI_DEPLOYMENT_NAME?: string;
  AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME?: string;
  AZURE_TENANT_ID?: string;
  AZURE_TOKEN_SCOPE?: string;

  // Azure Content Safety params
  AZURE_CONTENT_SAFETY_API_KEY?: string;
  AZURE_CONTENT_SAFETY_API_VERSION?: string;
  AZURE_CONTENT_SAFETY_ENDPOINT?: string;

  // Cohere
  COHERE_CLIENT_NAME?: string;
  COHERE_K?: string;
  COHERE_MAX_TOKENS?: string;
  COHERE_P?: string;
  COHERE_TEMPERATURE?: string;

  // Cloudflare
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_API_KEY?: string;

  // CDP
  CDP_DOMAIN?: string;

  // FAL
  FAL_KEY?: string;

  // Groq
  GROQ_API_KEY?: string;

  // Helicone
  HELICONE_API_KEY?: string;

  // Hugging Face
  /** @deprecated Use HF_TOKEN instead */
  HF_API_TOKEN?: string;
  HF_TOKEN?: string;

  // Hyperbolic
  HYPERBOLIC_API_KEY?: string;

  // Langfuse
  LANGFUSE_HOST?: string;
  LANGFUSE_PUBLIC_KEY?: string;
  LANGFUSE_SECRET_KEY?: string;

  // LLaMa
  LLAMA_BASE_URL?: string;

  // Local AI
  LOCALAI_BASE_URL?: string;
  LOCALAI_TEMPERATURE?: number;

  // Mistral
  MISTRAL_MAX_TOKENS?: string;
  MISTRAL_TEMPERATURE?: string;
  MISTRAL_TOP_K?: string;
  MISTRAL_TOP_P?: string;

  // Ollama
  OLLAMA_API_KEY?: string;
  OLLAMA_BASE_URL?: string;

  // OpenAI
  OPENAI_API_KEY?: string;
  OPENAI_BEST_OF?: number;
  OPENAI_FREQUENCY_PENALTY?: number;
  OPENAI_MAX_COMPLETION_TOKENS?: number;
  OPENAI_MAX_TOKENS?: number;
  OPENAI_PRESENCE_PENALTY?: number;
  OPENAI_STOP?: string;
  OPENAI_TEMPERATURE?: number;
  OPENAI_TOP_P?: number;

  // OpenRouter
  OPENROUTER_API_KEY?: string;

  // Portkey
  PORTKEY_API_BASE_URL?: string;
  PORTKEY_API_KEY?: string;

  // Replicate
  REPLICATE_MAX_LENGTH?: number;
  REPLICATE_MAX_NEW_TOKENS?: number;
  REPLICATE_REPETITION_PENALTY?: number;
  REPLICATE_SEED?: number;
  REPLICATE_STOP_SEQUENCES?: string;
  REPLICATE_SYSTEM_PROMPT?: string;
  REPLICATE_TEMPERATURE?: number;
  REPLICATE_TOP_K?: number;
  REPLICATE_TOP_P?: number;

  // Together AI
  TOGETHER_API_KEY?: string;

  // Vertex AI
  VERTEX_API_VERSION?: string;

  // Voyage AI
  VOYAGE_API_BASE_URL?: string;
  VOYAGE_API_KEY?: string;

  // Watson X
  WATSONX_AI_APIKEY?: string;
  WATSONX_AI_AUTH_TYPE?: string;
  WATSONX_AI_BEARER_TOKEN?: string;
  WATSONX_AI_PROJECT_ID?: string;

  // Pi Labs
  WITHPI_API_KEY?: string;

  // xAI
  XAI_API_KEY?: string;
} & EnvOverrides;

// Allow string access to any key for environment variables not explicitly listed
export type EnvVarKey = keyof EnvVars;

/**
 * Get an environment variable.
 * @param key The name of the environment variable.
 * @param defaultValue Optional default value if the environment variable is not set.
 * @returns The value of the environment variable, or the default value if provided.
 */
export function getEnvString(key: EnvVarKey): string | undefined;
export function getEnvString(key: EnvVarKey, defaultValue: string): string;
export function getEnvString(key: EnvVarKey, defaultValue?: string): string | undefined {
  // First check if the key exists in CLI state env config
  if (cliState.config?.env && typeof cliState.config.env === 'object') {
    // Handle both ProviderEnvOverridesSchema and Record<string, string|number|boolean> type
    const envValue = cliState.config.env[key as keyof typeof cliState.config.env];
    if (envValue !== undefined) {
      return String(envValue);
    }
  }

  // Fallback to process.env
  const value = process.env[key as string];
  if (value === undefined) {
    return defaultValue;
  }
  return value;
}

/**
 * Get a boolean environment variable.
 * @param key The name of the environment variable.
 * @param defaultValue Optional default value if the environment variable is not set.
 * @returns The boolean value of the environment variable, or the default value if provided.
 */
export function getEnvBool(key: EnvVarKey, defaultValue?: boolean): boolean {
  const value = getEnvString(key) || defaultValue;
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return ['1', 'true', 'yes', 'yup', 'yeppers'].includes(value.toLowerCase());
  }
  return Boolean(defaultValue);
}

/**
 * Get an integer environment variable.
 * @param key The name of the environment variable.
 * @param defaultValue Optional default value if the environment variable is not set.
 * @returns The integer value of the environment variable, or the default value if provided.
 */
export function getEnvInt(key: EnvVarKey): number | undefined;
export function getEnvInt(key: EnvVarKey, defaultValue: number): number;
export function getEnvInt(key: EnvVarKey, defaultValue?: number): number | undefined {
  const value = getEnvString(key) || defaultValue;
  if (typeof value === 'number') {
    return Math.floor(value);
  }
  if (typeof value === 'string') {
    const parsedValue = Number.parseInt(value, 10);
    if (!Number.isNaN(parsedValue)) {
      return parsedValue;
    }
  }
  return defaultValue;
}

/**
 * Get a float environment variable.
 * @param key The name of the environment variable.
 * @param defaultValue Optional default value if the environment variable is not set.
 * @returns The float value of the environment variable, or the default value if provided.
 */
export function getEnvFloat(key: EnvVarKey): number | undefined;
export function getEnvFloat(key: EnvVarKey, defaultValue: number): number;
export function getEnvFloat(key: EnvVarKey, defaultValue?: number): number | undefined {
  const value = getEnvString(key) || defaultValue;
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    const parsedValue = Number.parseFloat(value);
    if (!Number.isNaN(parsedValue)) {
      return parsedValue;
    }
  }
  return defaultValue;
}

/**
 * Get the evaluation timeout in milliseconds.
 * @param defaultValue Optional default value if the environment variable is not set. Defaults to 0 (no timeout).
 * @returns The timeout value in milliseconds, or the default value if not set.
 */
export function getEvalTimeoutMs(defaultValue: number = 0): number {
  return getEnvInt('PROMPTFOO_EVAL_TIMEOUT_MS', defaultValue);
}

/**
 * Get the maximum duration for an evaluation in milliseconds.
 * @param defaultValue Optional default value if the environment variable is not set. Defaults to 0 (no limit).
 * @returns The max duration in milliseconds, or the default value if not set.
 */
export function getMaxEvalTimeMs(defaultValue: number = 0): number {
  return getEnvInt('PROMPTFOO_MAX_EVAL_TIME_MS', defaultValue);
}

/**
 * Check if the application is running in a CI environment.
 * @returns True if running in a CI environment, false otherwise.
 */
export function isCI() {
  return (
    getEnvBool('CI') ||
    getEnvBool('GITHUB_ACTIONS') ||
    getEnvBool('TRAVIS') ||
    getEnvBool('CIRCLECI') ||
    getEnvBool('JENKINS') ||
    getEnvBool('GITLAB_CI') ||
    getEnvBool('APPVEYOR') ||
    getEnvBool('CODEBUILD_BUILD_ID') ||
    getEnvBool('TF_BUILD') ||
    getEnvBool('BITBUCKET_COMMIT') ||
    getEnvBool('BUDDY') ||
    getEnvBool('BUILDKITE') ||
    getEnvBool('TEAMCITY_VERSION')
  );
}
