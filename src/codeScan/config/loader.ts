/**
 * Configuration Loader
 *
 * Loads and validates configuration from YAML files.
 */

import fs from 'fs';
import path from 'path';

import yaml from 'js-yaml';
import { ConfigLoadError, validateSeverity } from '../../types/codeScan';
import { type Config, ConfigSchema, DEFAULT_CONFIG } from './schema';

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
    const errors = result.error.issues
      .map((err) => `${err.path.join('.')}: ${err.message}`)
      .join(', ');
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

/**
 * Options that can be passed to merge with config
 */
export interface ConfigMergeOptions {
  diffsOnly?: boolean;
  minSeverity?: string;
  minimumSeverity?: string;
  apiHost?: string;
}

/**
 * Merge CLI options with configuration
 *
 * CLI options take precedence over config file settings
 *
 * @param config - Base configuration
 * @param options - CLI options to merge
 * @returns Merged configuration
 */
export function mergeConfigWithOptions(config: Config, options: ConfigMergeOptions): Config {
  const merged = { ...config };

  // Allow options to override config file settings
  if (options.diffsOnly !== undefined) {
    merged.diffsOnly = options.diffsOnly;
  }

  // Allow CLI flags to override config severity (minSeverity takes precedence over minimumSeverity)
  if (options.minSeverity || options.minimumSeverity) {
    const cliSeverity = (options.minSeverity || options.minimumSeverity) as string;
    // Validate severity input (throws ZodError if invalid)
    merged.minimumSeverity = validateSeverity(cliSeverity);
  }

  // Override API host if provided
  if (options.apiHost) {
    merged.apiHost = options.apiHost;
  }

  return merged;
}

/**
 * Options for resolving guidance
 */
export interface GuidanceOptions {
  guidance?: string;
  guidanceFile?: string;
}

/**
 * Resolve guidance from options or config
 *
 * CLI options take precedence over config file settings
 *
 * @param options - Options that may contain guidance
 * @param config - Configuration that may contain guidance
 * @returns Guidance string or undefined
 * @throws Error if both guidance and guidanceFile are specified
 */
export function resolveGuidance(options: GuidanceOptions, config: Config): string | undefined {
  // Handle guidance options (mutually exclusive)
  if (options.guidance && options.guidanceFile) {
    throw new Error('Cannot specify both --guidance and --guidance-file options');
  }

  // CLI options take precedence over config
  if (options.guidance) {
    return options.guidance;
  }

  if (options.guidanceFile) {
    const absoluteGuidancePath = path.resolve(options.guidanceFile);
    try {
      return fs.readFileSync(absoluteGuidancePath, 'utf-8');
    } catch (error) {
      throw new Error(
        `Failed to read guidance file: ${absoluteGuidancePath} - ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // Config loader already read guidanceFile and populated guidance field
  return config.guidance;
}

/**
 * Options for resolving API host
 */
export interface ApiHostOptions {
  apiHost?: string;
}

/**
 * Resolve API host from options or config
 *
 * @param options - Options that may contain API host
 * @param config - Configuration that may contain API host
 * @returns API host URL
 */
export function resolveApiHost(options: ApiHostOptions, config: Config): string {
  return options.apiHost || config.apiHost || 'https://api.promptfoo.app';
}
