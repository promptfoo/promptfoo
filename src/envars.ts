// Define the supported environment variables and their types
interface EnvVars {
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
  PROMPTFOO_DELAY_MS?: number;
  PROMPTFOO_DISABLE_AJV_STRICT_MODE?: boolean;
  PROMPTFOO_DISABLE_CONVERSATION_VAR?: boolean;
  PROMPTFOO_DISABLE_JSON_AUTOESCAPE?: boolean;
  PROMPTFOO_DISABLE_REF_PARSER?: boolean;
  PROMPTFOO_DISABLE_SHARING?: boolean;
  PROMPTFOO_DISABLE_TELEMETRY?: boolean;
  PROMPTFOO_DISABLE_UPDATE?: boolean;
  PROMPTFOO_DISABLE_VAR_EXPANSION?: boolean;
  PROMPTFOO_NO_TESTCASE_ASSERT_WARNING?: boolean;
  PROMPTFOO_REMOTE_API_BASE_URL?: string;
  PROMPTFOO_REMOTE_APP_BASE_URL?: string;
  PROMPTFOO_REQUEST_BACKOFF_MS?: number;
  PROMPTFOO_RETRY_5XX?: boolean;
  PROMPTFOO_FAILED_TEST_EXIT_CODE?: number;
  WEBHOOK_TIMEOUT?: number;

  // node/npm
  NODE_ENV?: string;
  npm_execpath?: string;

  // CI
  CI?: boolean;
  GITHUB_ACTIONS?: boolean;
  TRAVIS?: boolean;
  CIRCLECI?: boolean;
  JENKINS?: boolean;
  GITLAB_CI?: boolean;
}

type EnvVarKey = keyof EnvVars;

/**
 * Get an environment variable.
 * @param key The name of the environment variable.
 * @param defaultValue Optional default value if the environment variable is not set.
 * @returns The value of the environment variable, or the default value if provided.
 */
export function getEnvar<K extends EnvVarKey>(key: K, defaultValue?: EnvVars[K]) {
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
  const value = getEnvar(key, defaultValue);
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
export function getEnvInt(key: EnvVarKey, defaultValue?: number): number {
  const value = getEnvar(key, defaultValue);
  if (typeof value === 'number') {
    return Math.floor(value);
  }
  if (typeof value === 'string') {
    const parsedValue = parseInt(value, 10);
    if (!isNaN(parsedValue)) {
      return parsedValue;
    }
  }
  return defaultValue || 0;
}

/**
 * Get a float environment variable.
 * @param key The name of the environment variable.
 * @param defaultValue Optional default value if the environment variable is not set.
 * @returns The float value of the environment variable, or the default value if provided.
 */
export function getEnvFloat(key: EnvVarKey, defaultValue?: number): number {
  const value = getEnvar(key, defaultValue);
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    const parsedValue = parseFloat(value);
    if (!isNaN(parsedValue)) {
      return parsedValue;
    }
  }
  return defaultValue || 0;
}
