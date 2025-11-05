import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

import yaml from 'js-yaml';
import { getEnvString } from '../../envars';
import logger from '../../logger';
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

    logger.info('Loaded server configuration', {
      configPath,
      providerCount: config.providers?.length || 0,
    });

    cachedConfig = config;
    return config;
  } catch (err) {
    logger.error('Failed to load server config, using defaults', {
      error: err,
      configPath,
    });
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
 * @returns Array of provider options
 */
export function getAvailableProviders(): ProviderOptions[] {
  const config = loadServerConfig();

  if (!config.providers || config.providers.length === 0) {
    // No providers in config - will use defaults from frontend
    return [];
  }

  // Normalize providers to ProviderOptions format
  return config.providers.map((p) => (typeof p === 'string' ? { id: p } : p));
}
