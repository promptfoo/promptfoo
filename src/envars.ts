import { z } from 'zod';

// Define the supported environment variables and their types
const EnvVars = {
  PROMPTFOO_DISABLE_UPDATE: z.boolean().optional(),
  PROMPTFOO_CACHE_ENABLED: z.boolean().optional().default(true),
  PROMPTFOO_CACHE_TYPE: z.enum(['memory', 'disk']).optional(),
  PROMPTFOO_CACHE_PATH: z.string().optional(),
  PROMPTFOO_CACHE_MAX_FILE_COUNT: z.number().int().positive().optional().default(10000),
  PROMPTFOO_CACHE_TTL: z.number().int().positive().optional().default(60 * 60 * 24 * 14),
  PROMPTFOO_CACHE_MAX_SIZE: z.number().int().positive().optional().default(1e7),
  PROMPTFOO_DELAY_MS: z.number().int().nonnegative().optional().default(0),
  PROMPTFOO_DISABLE_TELEMETRY: z.boolean().optional(),
  PROMPTFOO_DISABLE_CONVERSATION_VAR: z.boolean().optional(),
  PROMPTFOO_DISABLE_VAR_EXPANSION: z.boolean().optional(),
  PROMPTFOO_DISABLE_AJV_STRICT_MODE: z.boolean().optional(),
  PROMPTFOO_DISABLE_REF_PARSER: z.boolean().optional(),
  PROMPTFOO_DISABLE_SHARING: z.boolean().optional(),
  PROMPTFOO_ASSERTIONS_MAX_CONCURRENCY: z.number().int().positive().optional().default(3),
  PROMPTFOO_REQUEST_BACKOFF_MS: z.number().int().nonnegative().optional().default(5000),
  PROMPTFOO_RETRY_5XX: z.boolean().optional(),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).optional().default('info'),
  CI: z.boolean().optional(),
  GITHUB_ACTIONS: z.boolean().optional(),
  TRAVIS: z.boolean().optional(),
  CIRCLECI: z.boolean().optional(),
  JENKINS: z.boolean().optional(),
  GITLAB_CI: z.boolean().optional(),
} as const;

type EnvVarKey = keyof typeof EnvVars;

/**
 * Get an environment variable.
 * @param key The name of the environment variable.
 * @param defaultValue Optional default value if the environment variable is not set.
 * @returns The value of the environment variable, or the default value if provided.
 */
export function getEnvar<K extends EnvVarKey>(
  key: K,
  defaultValue?: z.infer<typeof EnvVars[K]>
): z.infer<typeof EnvVars[K]> | undefined {
  const schema = EnvVars[key];
  const value = process.env[key];
  
  if (value === undefined) {
    return defaultValue;
  }

  try {
    return schema.parse(value);
  } catch (error) {
    console.warn(`Invalid value for environment variable ${key}: ${value}`);
    return defaultValue;
  }
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
  return !!defaultValue;
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
