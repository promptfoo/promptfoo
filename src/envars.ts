import type { EnvOverrides } from './types';

// Define the supported environment variables and their types
export type EnvVars = {
  LOG_LEVEL?: 'error' | 'warn' | 'info' | 'debug';
  NEXT_PUBLIC_PROMPTFOO_BASE_URL?: string;
  NEXT_PUBLIC_PROMPTFOO_REMOTE_API_BASE_URL?: string;
  PROMPTFOO_ASSERTIONS_MAX_CONCURRENCY?: number;
  PROMPTFOO_AUTHOR?: string;
  PROMPTFOO_CACHE_ENABLED?: boolean;
  PROMPTFOO_CACHE_MAX_FILE_COUNT?: number;
  PROMPTFOO_CACHE_MAX_SIZE?: number;
  PROMPTFOO_CACHE_PATH?: string;
  PROMPTFOO_CACHE_TTL?: number;
  PROMPTFOO_CACHE_TYPE?: 'memory' | 'disk';
  PROMPTFOO_CONFIG_DIR?: string;
  PROMPTFOO_DELAY_MS?: number;
  PROMPTFOO_DISABLE_AJV_STRICT_MODE?: boolean;
  PROMPTFOO_DISABLE_CONVERSATION_VAR?: boolean;
  PROMPTFOO_DISABLE_JSON_AUTOESCAPE?: boolean;
  PROMPTFOO_DISABLE_REDTEAM_MODERATION?: boolean;
  PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION?: boolean;
  PROMPTFOO_DISABLE_REF_PARSER?: boolean;
  PROMPTFOO_DISABLE_SHARE_WARNING?: boolean;
  PROMPTFOO_DISABLE_SHARING?: boolean;
  PROMPTFOO_DISABLE_TELEMETRY?: boolean;
  PROMPTFOO_DISABLE_TEMPLATING?: boolean;
  PROMPTFOO_DISABLE_UPDATE?: boolean;
  PROMPTFOO_DISABLE_VAR_EXPANSION?: boolean;
  PROMPTFOO_FAILED_TEST_EXIT_CODE?: number;
  PROMPTFOO_LIGHTWEIGHT_RESULTS?: boolean;
  PROMPTFOO_NO_TESTCASE_ASSERT_WARNING?: boolean;
  PROMPTFOO_PASS_RATE_THRESHOLD?: number;
  PROMPTFOO_PROMPT_SEPARATOR?: string;
  PROMPTFOO_PYTHON?: string;
  PROMPTFOO_REMOTE_API_BASE_URL?: string;
  PROMPTFOO_REMOTE_APP_BASE_URL?: string;
  PROMPTFOO_REMOTE_GENERATION_URL?: string;
  PROMPTFOO_REQUEST_BACKOFF_MS?: number;
  PROMPTFOO_REQUIRE_JSON_PROMPTS?: boolean;
  PROMPTFOO_RETRY_5XX?: boolean;
  PROMPTFOO_SHARING_APP_BASE_URL?: string;
  PROMPTFOO_SHORT_CIRCUIT_TEST_FAILURES?: boolean;
  PROMPTFOO_STRICT_FILES?: boolean;
  PROMPTFOO_UNALIGNED_INFERENCE_ENDPOINT?: string;
  PROMPTFOO_TELEMETRY_DEBUG?: boolean;
  REQUEST_TIMEOUT_MS?: number;
  RESULT_HISTORY_LENGTH?: number;
  WEBHOOK_TIMEOUT?: number;

  // 3rd party
  ANTHROPIC_MAX_TOKENS?: number;
  ANTHROPIC_STOP?: string;
  ANTHROPIC_TEMPERATURE?: number;
  AWS_BEDROCK_MAX_GEN_LEN?: number;
  AWS_BEDROCK_TEMPERATURE?: number;
  COHERE_CLIENT_NAME?: string;
  GROQ_API_KEY?: string;
  HELICONE_API_KEY?: string;
  HF_API_TOKEN?: string;
  LANGFUSE_HOST?: string;
  LANGFUSE_PUBLIC_KEY?: string;
  LANGFUSE_SECRET_KEY?: string;
  LLAMA_BASE_URL?: string;
  LOCALAI_BASE_URL?: string;
  LOCALAI_TEMPERATURE?: number;
  OLLAMA_API_KEY?: string;
  OLLAMA_BASE_URL?: string;
  OPENAI_BEST_OF?: number;
  OPENAI_FREQUENCY_PENALTY?: number;
  OPENAI_MAX_COMPLETION_TOKENS?: number;
  OPENAI_MAX_TOKENS?: number;
  OPENAI_PRESENCE_PENALTY?: number;
  OPENAI_STOP?: string;
  OPENAI_TEMPERATURE?: number;
  OPENAI_TOP_P?: number;
  PORTKEY_API_KEY?: string;
  REPLICATE_MAX_LENGTH?: number;
  REPLICATE_MAX_NEW_TOKENS?: number;
  REPLICATE_REPETITION_PENALTY?: number;
  REPLICATE_SEED?: number;
  REPLICATE_STOP_SEQUENCES?: string;
  REPLICATE_SYSTEM_PROMPT?: string;
  REPLICATE_TEMPERATURE?: number;
  REPLICATE_TOP_K?: number;
  REPLICATE_TOP_P?: number;
  VOYAGE_API_BASE_URL?: string;
  VOYAGE_API_KEY?: string;

  // node/npm
  NODE_ENV?: string;
  npm_execpath?: string;

  // CI
  CI?: boolean;
  CIRCLECI?: boolean;
  GITHUB_ACTIONS?: boolean;
  GITLAB_CI?: boolean;
  JENKINS?: boolean;
  TRAVIS?: boolean;
  APPVEYOR?: boolean;
  CODEBUILD_BUILD_ID?: boolean;
  TF_BUILD?: boolean;
  BITBUCKET_COMMIT?: boolean;
  BUDDY?: boolean;
  BUILDKITE?: boolean;
  TEAMCITY_VERSION?: boolean;
} & EnvOverrides;

type EnvVarKey = keyof EnvVars;

/**
 * Get an environment variable.
 * @param key The name of the environment variable.
 * @param defaultValue Optional default value if the environment variable is not set.
 * @returns The value of the environment variable, or the default value if provided.
 */
export function getEnvString(key: EnvVarKey): string | undefined;
export function getEnvString(key: EnvVarKey, defaultValue: string): string;
export function getEnvString(key: EnvVarKey, defaultValue?: string): string | undefined {
  const value = process.env[key];
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
