import { z } from 'zod';

/**
 * Get an environment variable.
 * @param key The name of the environment variable.
 * @param defaultValue Optional default value if the environment variable is not set.
 * @returns The value of the environment variable, or the default value if provided.
 * @throws Error if the environment variable is not set and no default value is provided.
 */
export function getEnvar(key: string, defaultValue?: string): string | undefined {
  const value = process.env[key];
  if (value === undefined) {
    return defaultValue || undefined;
  }
  return value;
}

/**
 * Get a boolean environment variable.
 * @param key The name of the environment variable.
 * @param defaultValue Optional default value if the environment variable is not set.
 * @returns The boolean value of the environment variable, or the default value if provided.
 * @throws Error if the environment variable is not set and no default value is provided.
 */
export function getEnvBool(key: string, defaultValue?: boolean): boolean {
  const value = process.env[key];
  if (value === undefined) {
    return defaultValue || false;
  }
  return ['1', 'true', 'yes', 'yup', 'yeppers'].includes(value.toLowerCase());
}

/**
 * Get an integer environment variable.
 * @param key The name of the environment variable.
 * @param defaultValue Optional default value if the environment variable is not set.
 * @returns The integer value of the environment variable, or the default value if provided.
 * @throws Error if the environment variable is not set and no default value is provided, or if the value is not a valid integer.
 */
export function getEnvInt(key: string, defaultValue?: number): number {
  const value = process.env[key];
  if (value === undefined) {
    return defaultValue || 0;
  }
  const parsedValue = parseInt(value, 10);
  if (isNaN(parsedValue)) {
    throw new Error(`Environment variable ${key} is not a valid integer`);
  }
  return parsedValue;
}

/**
 * Get a float environment variable.
 * @param key The name of the environment variable.
 * @param defaultValue Optional default value if the environment variable is not set.
 * @returns The float value of the environment variable, or the default value if provided.
 * @throws Error if the environment variable is not set and no default value is provided, or if the value is not a valid float.
 */
export function getEnvFloat(key: string, defaultValue?: number): number {
  const value = process.env[key];
  if (value === undefined) {
    return defaultValue || 0;
  }
  const parsedValue = parseFloat(value);
  if (isNaN(parsedValue)) {
    throw new Error(`Environment variable ${key} is not a valid float`);
  }
  return parsedValue;
}

/**
 * Get an environment variable and validate it against a Zod schema.
 * @param key The name of the environment variable.
 * @param schema The Zod schema to validate against.
 * @param defaultValue Optional default value if the environment variable is not set.
 * @returns The validated value of the environment variable, or the default value if provided.
 * @throws Error if the environment variable is not set and no default value is provided, or if the value fails validation.
 */
export function getEnvValidated<T>(key: string, schema: z.ZodType<T>, defaultValue?: T): T {
  const value = process.env[key];
  if (value === undefined) {
    return schema.parse(defaultValue || undefined);
  }
  try {
    return schema.parse(value);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Environment variable ${key} failed validation: ${error.errors.join(', ')}`);
    }
    throw error;
  }
}
