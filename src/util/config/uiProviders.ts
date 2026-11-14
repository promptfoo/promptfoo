import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import * as yaml from 'js-yaml';
import logger from '../../logger';
import { parseRateLimitHeaders } from '../../scheduler/headerParser';
import { getProviderResponseHeaders, isProviderResponseRateLimited } from '../../scheduler/types';
import { JsonProviderOptionsWithIdSchema } from '../../types/api/providers';
import { BaseTokenUsageSchema } from '../../types/shared';
import { isSafeCost } from '../numeric';
import { UI_CATALOG_PROVIDER_PREFIX } from '../providerRef';
import { loadYaml } from '../yamlLoad';
import { getConfigDirectoryPath } from './manage';

import type { ProviderOptions, ProviderResponse } from '../../types/providers';

interface ServerConfig {
  providers?: (string | ProviderOptions)[];
}

// Undefined is not loaded; null means no catalog existed when configuration was loaded.
let cachedConfig: ServerConfig | null | undefined;
let cachedCatalog: Map<string, ProviderOptions> | undefined;

/**
 * Get the path to the UI providers config file
 * Checks in order:
 * 1. ${PROMPTFOO_CONFIG_DIR}/ui-providers.yaml
 * 2. ~/.promptfoo/ui-providers.yaml
 * @returns Path to config file or null if not found
 */
export function getServerConfigPath(): string | null {
  // Get config directory (default to ~/.promptfoo)
  const configDir = getConfigDirectoryPath();

  // Check for ui-providers.yaml, then the alternate .yml extension.
  for (const filename of ['ui-providers.yaml', 'ui-providers.yml']) {
    const configPath = join(configDir, filename);
    if (existsSync(configPath)) {
      return configPath;
    }
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
  if (cachedConfig !== undefined) {
    return cachedConfig ?? {};
  }

  const configPath = getServerConfigPath();

  if (configPath) {
    try {
      const content = readFileSync(configPath, 'utf8');
      const config = loadYaml(content) as ServerConfig;

      // Validate basic structure
      if (config && typeof config !== 'object') {
        logger.error('Invalid ui-providers.yaml: root must be an object, using defaults', {
          configPath,
          actualType: typeof config,
        });
      } else if (config?.providers && !Array.isArray(config.providers)) {
        logger.error('Invalid ui-providers.yaml: providers must be an array, using defaults', {
          configPath,
          actualType: typeof config.providers,
        });
      } else {
        logger.info('Loaded server configuration', {
          configPath,
          providerCount: config?.providers?.length || 0,
        });

        cachedConfig = config || {};
        return cachedConfig;
      }
    } catch (err) {
      // Differentiate error types for better debugging
      if (err instanceof yaml.YAMLException) {
        logger.error('Invalid YAML syntax in ui-providers.yaml, using defaults', {
          configPath,
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
    }
  } else {
    logger.debug('No server config file found, using defaults');
  }
  cachedConfig = configPath ? {} : null;
  return cachedConfig ?? {};
}

export function hasCustomProviderConfig(): boolean {
  loadServerConfig();
  return cachedConfig !== null;
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
    const result = JsonProviderOptionsWithIdSchema.safeParse(normalized);

    if (!result.success) {
      logger.warn('Invalid provider configuration in ui-providers.yaml, skipping', {
        providerIndex: i,
        invalidFields: result.error.issues.map(({ path }) => path.join('.')),
      });
      continue;
    }

    if (result.data.id.startsWith(UI_CATALOG_PROVIDER_PREFIX)) {
      logger.warn('Ignoring a recursive ui-providers.yaml reference', { providerIndex: i });
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

function getProviderCatalog(): Map<string, ProviderOptions> {
  if (cachedCatalog) {
    return cachedCatalog;
  }

  const catalog = new Map<string, ProviderOptions>();
  const duplicates = new Set<string>();
  for (const [index, provider] of getAvailableProviders().entries()) {
    const providerId = provider.id!;
    // Only network hosts are public by default. Opaque IDs and local paths may contain secrets.
    const url = URL.parse(providerId);
    const displayId =
      url && ['https:', 'http:', 'wss:', 'ws:'].includes(url.protocol) && url.hostname
        ? `${url.protocol}//${url.hostname}`
        : `Configured provider ${index + 1}`;
    const key = createHash('sha256')
      .update(JSON.stringify([providerId, provider.label]))
      .digest('hex');
    const id = `${UI_CATALOG_PROVIDER_PREFIX}${key}`;
    if (catalog.has(id) || duplicates.has(id)) {
      catalog.delete(id);
      duplicates.add(id);
      continue;
    }
    catalog.set(id, { ...provider, label: provider.label || displayId });
  }
  if (duplicates.size > 0) {
    logger.warn('Give entries with the same provider ID distinct labels in ui-providers.yaml');
  }
  cachedCatalog = catalog;
  return catalog;
}

export function getPublicProviderCatalog(): { id: string; label: string }[] {
  return Array.from(getProviderCatalog(), ([id, provider]) => ({ id, label: provider.label! }));
}

export function getUiCatalogProvider(id: string): ProviderOptions | undefined {
  return getProviderCatalog().get(id);
}

export function redactCatalogError(result: ProviderResponse, thrown?: Error): ProviderResponse {
  const usage = BaseTokenUsageSchema.safeParse(result.tokenUsage);
  const retryable = isProviderResponseRateLimited(result, thrown);
  const headers = getProviderResponseHeaders(result);
  const retryAfterMs = headers && parseRateLimitHeaders(headers).retryAfterMs;
  return {
    error: 'The configured catalog provider could not complete the request.',
    ...(usage.success && { tokenUsage: usage.data }),
    ...(isSafeCost(result.cost) && { cost: result.cost }),
    ...(isSafeCost(result.incurredCost) && { incurredCost: result.incurredCost }),
    ...(typeof result.cached === 'boolean' && { cached: result.cached }),
    metadata: {
      rateLimitRetryable: retryable,
      ...(retryable && { rateLimitKind: 'rate_limit' }),
      ...(retryable &&
        retryAfterMs !== undefined && {
          headers: { 'retry-after-ms': String(retryAfterMs) },
        }),
      ...(result.metadata?.retryableErrorKind === 'transient_availability' && {
        retryableErrorKind: 'transient_availability',
      }),
    },
  };
}
