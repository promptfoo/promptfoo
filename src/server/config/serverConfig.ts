import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

import yaml from 'js-yaml';
import { getEnvString } from '../../envars';
import logger from '../../logger';
import { ProviderOptionsSchema } from '../../validators/providers';

import type { ProviderOptions } from '../../types/providers';

interface ServerConfig {
  providers?: (string | ProviderOptions)[];
}

let cachedConfig: ServerConfig | null = null;

/**
 * Get the path to the UI providers config file
 * Checks in order:
 * 1. ${PROMPTFOO_CONFIG_DIR}/ui-providers.yaml
 * 2. ~/.promptfoo/ui-providers.yaml
 * @returns Path to config file or null if not found
 */
export function getServerConfigPath(): string | null {
  // Get config directory (default to ~/.promptfoo)
  const configDir = getEnvString('PROMPTFOO_CONFIG_DIR') || join(homedir(), '.promptfoo');

  // Check for ui-providers.yaml
  const yamlPath = join(configDir, 'ui-providers.yaml');
  if (existsSync(yamlPath)) {
    return yamlPath;
  }

  // Check for alternate .yml extension
  const ymlPath = join(configDir, 'ui-providers.yml');
  if (existsSync(ymlPath)) {
    return ymlPath;
  }

  // No config file found
  return null;
}

/**
 * Load server configuration from file
 * Caches the result for performance
 * @returns Server configuration object
 */
export function loadServerConfig(): ServerConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const configPath = getServerConfigPath();

  if (!configPath) {
    logger.debug('No server config file found, using defaults');
    cachedConfig = {};
    return cachedConfig;
  }

  try {
    const content = readFileSync(configPath, 'utf8');
    const config = yaml.load(content) as ServerConfig;

    // Validate basic structure
    if (config && typeof config !== 'object') {
      logger.error('Invalid ui-providers.yaml: root must be an object, using defaults', {
        configPath,
        actualType: typeof config,
      });
      cachedConfig = {};
      return cachedConfig;
    }

    if (config?.providers && !Array.isArray(config.providers)) {
      logger.error('Invalid ui-providers.yaml: providers must be an array, using defaults', {
        configPath,
        actualType: typeof config.providers,
      });
      cachedConfig = {};
      return cachedConfig;
    }

    logger.info('Loaded server configuration', {
      configPath,
      providerCount: config?.providers?.length || 0,
    });

    cachedConfig = config || {};
    return cachedConfig;
  } catch (err) {
    // Differentiate error types for better debugging
    if (err instanceof yaml.YAMLException) {
      logger.error('Invalid YAML syntax in ui-providers.yaml, using defaults', {
        configPath,
        error: err,
        yamlError: err.message,
        line: err.mark?.line,
        column: err.mark?.column,
      });
    } else if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      // File not found - already logged in getServerConfigPath, this is unexpected
      logger.warn('Config file disappeared between check and read, using defaults', {
        configPath,
        error: err,
      });
    } else if ((err as NodeJS.ErrnoException).code === 'EACCES') {
      logger.error('Permission denied reading ui-providers.yaml, using defaults', {
        configPath,
        error: err,
      });
    } else {
      logger.error('Unexpected error loading ui-providers.yaml, using defaults', {
        configPath,
        error: err,
      });
    }
    cachedConfig = {};
    return cachedConfig;
  }
}

/**
 * Clear the cached config and reload from file
 * Useful for hot-reloading configuration
 * @returns Newly loaded server configuration
 */
export function reloadServerConfig(): ServerConfig {
  cachedConfig = null;
  return loadServerConfig();
}

/**
 * Get the list of available providers
 * Validates each provider against schema and filters out invalid ones
 * @returns Array of validated provider options
 */
export function getAvailableProviders(): ProviderOptions[] {
  const config = loadServerConfig();

  if (!config.providers || config.providers.length === 0) {
    // No providers in config - will use defaults from frontend
    return [];
  }

  // Normalize and validate providers
  const validatedProviders: ProviderOptions[] = [];

  for (let i = 0; i < config.providers.length; i++) {
    const p = config.providers[i];
    const normalized = typeof p === 'string' ? { id: p } : p;

    // Validate against schema
    const result = ProviderOptionsSchema.safeParse(normalized);

    if (!result.success) {
      logger.warn('Invalid provider configuration in ui-providers.yaml, skipping', {
        providerIndex: i,
        provider: normalized,
        validationErrors: result.error.issues,
      });
      continue;
    }

    // Ensure id is present (required for providers even though schema makes it optional)
    if (!result.data.id) {
      logger.warn('Provider missing required "id" field in ui-providers.yaml, skipping', {
        providerIndex: i,
        provider: normalized,
      });
      continue;
    }

    validatedProviders.push(result.data);
  }

  if (validatedProviders.length < config.providers.length) {
    logger.warn('Some providers were skipped due to validation errors', {
      totalProviders: config.providers.length,
      validProviders: validatedProviders.length,
      skippedCount: config.providers.length - validatedProviders.length,
    });
  }

  return validatedProviders;
}
