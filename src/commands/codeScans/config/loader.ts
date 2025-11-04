/**
 * Configuration Loader
 *
 * Loads and validates configuration from YAML files.
 */

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { ConfigSchema, DEFAULT_CONFIG, type Config } from './schema';

// Re-export Config type for convenience
export type { Config };

export class ConfigLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigLoadError';
  }
}

/**
 * Load configuration from a YAML file
 * @param configPath Path to the configuration file
 * @returns Validated configuration object
 * @throws ConfigLoadError if file cannot be read or parsed
 */
export function loadConfig(configPath: string): Config {
  // Check if file exists
  if (!fs.existsSync(configPath)) {
    throw new ConfigLoadError(`Configuration file not found: ${configPath}`);
  }

  // Read file
  let fileContents: string;
  try {
    fileContents = fs.readFileSync(configPath, 'utf8');
  } catch (error) {
    throw new ConfigLoadError(
      `Failed to read configuration file: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // Parse YAML
  let rawConfig: unknown;
  try {
    rawConfig = yaml.load(fileContents);
  } catch (error) {
    throw new ConfigLoadError(
      `Failed to parse YAML: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // Validate against schema
  const result = ConfigSchema.safeParse(rawConfig);
  if (!result.success) {
    const errors = result.error.errors.map((err) => `${err.path.join('.')}: ${err.message}`).join(', ');
    throw new ConfigLoadError(`Invalid configuration: ${errors}`);
  }

  const config = result.data;

  // If guidanceFile is specified, read it and populate guidance field
  if (config.guidanceFile) {
    const guidanceFilePath = path.isAbsolute(config.guidanceFile)
      ? config.guidanceFile
      : path.resolve(path.dirname(configPath), config.guidanceFile);

    try {
      config.guidance = fs.readFileSync(guidanceFilePath, 'utf-8');
    } catch (error) {
      throw new ConfigLoadError(
        `Failed to read guidance file "${guidanceFilePath}": ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return config;
}

/**
 * Load configuration with defaults
 * If no config path provided, returns default configuration
 * Returns a clone to prevent mutation of the singleton default
 */
export function loadConfigOrDefault(configPath?: string): Config {
  if (!configPath) {
    return { ...DEFAULT_CONFIG }; // Return clone to prevent singleton mutation
  }

  return loadConfig(configPath);
}
