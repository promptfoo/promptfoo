import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join, posix } from 'path';

import * as yaml from 'js-yaml';
import { getEnvString, parseEnvBool } from '../../envars';
import logger from '../../logger';
import { loadYaml } from '../../util/yamlLoad';
import { ProviderOptionsSchema } from '../../validators/providers';
import type { RequestHandler, Response } from 'express';

import type { ProviderOptions } from '../../types/providers';

interface ServerConfig {
  providers?: (string | ProviderOptions)[];
}

let cachedConfig: ServerConfig | null = null;

// This must be a process-level opt-in. getEnvBool also reads untrusted
// evaluation/config env overrides, which must never grant server permissions.
export function allowLocalCloudProxyRequests(): boolean {
  return parseEnvBool(process.env.PROMPTFOO_ALLOW_LOCAL_CLOUD_PROXY);
}

export const LOCAL_CLOUD_PROXY_DISABLED_MESSAGE =
  'Cloud-backed setup is disabled for local API requests. Restart the server with PROMPTFOO_ALLOW_LOCAL_CLOUD_PROXY=true only when you trust local callers and accept cloud quota usage.';

/** Keep non-Cloud providers usable when a caller previews a provider or red-team test. */
export function guardLocalCloudPreview(
  withCloudDestinationGuard: (check: (target: URL) => void, next: () => void) => void,
): RequestHandler {
  return (_req, res, next) => {
    if (allowLocalCloudProxyRequests()) {
      next();
      return;
    }
    withCloudDestinationGuard((target) => {
      const { pathname } = target;
      let path = pathname;
      try {
        path = posix.normalize(decodeURIComponent(pathname));
      } catch {
        // Other Cloud APIs can handle malformed escapes themselves.
      }
      // Self-hosted deployments may use a custom path for the task service.
      const configured = getEnvString('PROMPTFOO_REMOTE_GENERATION_URL');
      const task = configured && URL.parse(configured);
      if (
        res.locals.cloudProxyDenied ||
        (task && task.origin === target.origin && task.pathname === pathname) ||
        /\/api\/v1\/(?:task|http-provider-generator)\/?$/i.test(path)
      ) {
        res.locals.cloudProxyDenied = true;
        throw new Error(LOCAL_CLOUD_PROXY_DISABLED_MESSAGE);
      }
    }, next);
  };
}

// Plugins and providers can turn transport errors into ordinary results.
export function replyIfCloudProxyDenied(res: Response): boolean {
  if (!res.locals.cloudProxyDenied) {
    return false;
  }
  res.status(403).json({ error: LOCAL_CLOUD_PROXY_DISABLED_MESSAGE });
  return true;
}

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
  if (cachedConfig) {
    return cachedConfig;
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
    }
  } else {
    logger.debug('No server config file found, using defaults');
  }
  cachedConfig = {};
  return cachedConfig;
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
