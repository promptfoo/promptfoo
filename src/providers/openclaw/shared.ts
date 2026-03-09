import fs from 'fs';
import os from 'os';
import path from 'path';

import { getEnvString } from '../../envars';
import logger from '../../logger';

import type { ProviderOptions } from '../../types/providers';
import type { OpenClawConfig, OpenClawGatewayConfig } from './types';

export const DEFAULT_GATEWAY_PORT = 18789;
export const DEFAULT_GATEWAY_HOST = '127.0.0.1';

/**
 * Strip JSON5 syntax (comments and trailing commas) for JSON.parse compatibility.
 * Uses a state machine to avoid corrupting strings containing // or slash characters.
 */
function stripJson5Syntax(raw: string): string {
  let result = '';
  let i = 0;
  let inString = false;
  let stringQuote = '';
  let escape = false;

  while (i < raw.length) {
    const ch = raw[i];

    if (inString) {
      result += ch;
      if (escape) {
        escape = false;
      } else if (ch === '\\') {
        escape = true;
      } else if (ch === stringQuote) {
        inString = false;
      }
      i++;
      continue;
    }

    // Not in string
    if (ch === '"' || ch === "'") {
      inString = true;
      stringQuote = ch;
      result += ch;
      i++;
    } else if (ch === '/' && raw[i + 1] === '/') {
      // Line comment — skip to end of line
      while (i < raw.length && raw[i] !== '\n') {
        i++;
      }
    } else if (ch === '/' && raw[i + 1] === '*') {
      // Block comment — skip to */
      i += 2;
      while (i < raw.length - 1 && !(raw[i] === '*' && raw[i + 1] === '/')) {
        i++;
      }
      // Skip closing */ if found (guard against unclosed block comments)
      if (i < raw.length - 1 && raw[i] === '*' && raw[i + 1] === '/') {
        i += 2;
      }
    } else if (ch === ',') {
      // Skip trailing commas (comma followed only by whitespace then } or ])
      let j = i + 1;
      while (
        j < raw.length &&
        (raw[j] === ' ' || raw[j] === '\t' || raw[j] === '\n' || raw[j] === '\r')
      ) {
        j++;
      }
      if (j < raw.length && (raw[j] === '}' || raw[j] === ']')) {
        // Trailing comma — skip it, whitespace will be added by next iterations
        i++;
      } else {
        result += ch;
        i++;
      }
    } else {
      result += ch;
      i++;
    }
  }

  return result;
}

/**
 * Cached config to avoid re-reading the file multiple times during provider init.
 */
let cachedConfig: { config: OpenClawGatewayConfig | undefined; mtime: number } | undefined;
let cachedConfigPath: string | undefined;

/**
 * Reset the config cache. Exported for test isolation.
 */
export function resetConfigCache(): void {
  cachedConfig = undefined;
  cachedConfigPath = undefined;
}

function resolveConfigPath(env?: Record<string, string | undefined>): string {
  return (
    env?.OPENCLAW_CONFIG_PATH ||
    getEnvString('OPENCLAW_CONFIG_PATH') ||
    path.join(os.homedir(), '.openclaw', 'openclaw.json')
  );
}

function resolveGatewayHost(gatewayConfig: OpenClawGatewayConfig['gateway'] | undefined): string {
  const bind = gatewayConfig?.bind?.trim();
  const customBindHost = gatewayConfig?.customBindHost?.trim();

  // OpenClaw stores bind modes, not literal listener hosts, for common cases.
  if (
    !bind ||
    bind === 'auto' ||
    bind === 'loopback' ||
    bind === 'lan' ||
    bind === 'tailnet' ||
    bind === '0.0.0.0' ||
    bind === '::' ||
    bind === '127.0.0.1' ||
    bind === 'localhost' ||
    bind === '::1'
  ) {
    return DEFAULT_GATEWAY_HOST;
  }

  if (bind === 'custom') {
    if (
      !customBindHost ||
      customBindHost === '0.0.0.0' ||
      customBindHost === '::' ||
      customBindHost === '127.0.0.1' ||
      customBindHost === 'localhost' ||
      customBindHost === '::1'
    ) {
      return DEFAULT_GATEWAY_HOST;
    }
    return customBindHost;
  }

  // Support older configs that still stored a concrete host in gateway.bind.
  return bind;
}

/**
 * Read and parse the active OpenClaw configuration file.
 * Results are cached based on file modification time.
 * Returns undefined if the file doesn't exist or can't be parsed.
 */
export function readOpenClawConfig(
  env?: Record<string, string | undefined>,
): OpenClawGatewayConfig | undefined {
  const configPath = resolveConfigPath(env);
  try {
    if (!fs.existsSync(configPath)) {
      return undefined;
    }

    const stat = fs.statSync(configPath);
    const mtime = stat.mtimeMs;

    if (cachedConfig && cachedConfigPath === configPath && cachedConfig.mtime === mtime) {
      return cachedConfig.config;
    }

    const raw = fs.readFileSync(configPath, 'utf-8');
    const cleaned = stripJson5Syntax(raw);
    const config = JSON.parse(cleaned) as OpenClawGatewayConfig;
    cachedConfig = { config, mtime };
    cachedConfigPath = configPath;
    return config;
  } catch (err) {
    logger.debug(`Failed to read OpenClaw config at ${configPath}: ${err}`);
    return undefined;
  }
}

/**
 * Auto-detect the OpenClaw gateway URL from config, env overrides, or the active config file.
 */
export function resolveGatewayUrl(
  config?: { gateway_url?: string },
  env?: Record<string, string | undefined>,
): string {
  // 1. Explicit config
  if (config?.gateway_url) {
    return config.gateway_url;
  }

  // 2. Per-provider env overrides, then process environment variable
  const envUrl = env?.OPENCLAW_GATEWAY_URL || getEnvString('OPENCLAW_GATEWAY_URL');
  if (envUrl) {
    return envUrl;
  }

  // 3. Auto-detect from the active OpenClaw config file
  const openclawConfig = readOpenClawConfig(env);
  if (openclawConfig?.gateway) {
    const port = openclawConfig.gateway.port ?? DEFAULT_GATEWAY_PORT;
    const host = resolveGatewayHost(openclawConfig.gateway);
    return `http://${host}:${port}`;
  }

  // 4. Default
  return `http://${DEFAULT_GATEWAY_HOST}:${DEFAULT_GATEWAY_PORT}`;
}

/**
 * Auto-detect the OpenClaw gateway bearer secret from config, env overrides, or the active
 * config file. OpenClaw accepts either a token or password as the HTTP bearer secret.
 */
export function resolveAuthToken(
  config?: { auth_password?: string; auth_token?: string },
  env?: Record<string, string | undefined>,
): string | undefined {
  // 1. Explicit config
  if (config?.auth_token) {
    return config.auth_token;
  }
  if (config?.auth_password) {
    return config.auth_password;
  }

  // 2. Per-provider env overrides, then process environment variable
  const envToken =
    env?.OPENCLAW_GATEWAY_TOKEN ||
    env?.OPENCLAW_GATEWAY_PASSWORD ||
    getEnvString('OPENCLAW_GATEWAY_TOKEN') ||
    getEnvString('OPENCLAW_GATEWAY_PASSWORD');
  if (envToken) {
    return envToken;
  }

  // 3. Auto-detect from the active OpenClaw config file
  const openclawConfig = readOpenClawConfig(env);
  if (openclawConfig?.gateway?.auth?.mode === 'password' && openclawConfig.gateway.auth.password) {
    return openclawConfig.gateway.auth.password;
  }
  return openclawConfig?.gateway?.auth?.token || openclawConfig?.gateway?.auth?.password;
}

/**
 * Build common OpenClaw headers for agent-id and session-key.
 * Note: thinking_level is only supported by the WS Agent provider and is
 * passed as an RPC param there, not as an HTTP header.
 */
export function buildOpenClawHeaders(
  agentId: string,
  config?: OpenClawConfig,
): Record<string, string> {
  const headers: Record<string, string> = {
    'x-openclaw-agent-id': agentId,
  };
  if (config?.session_key) {
    headers['x-openclaw-session-key'] = config.session_key;
  }
  return headers;
}

/**
 * Build provider options for OpenAI-compatible OpenClaw providers (chat, responses).
 * Resolves gateway URL, auth token, and merges OpenClaw-specific headers.
 */
export function buildOpenClawProviderOptions(
  agentId: string,
  providerOptions: ProviderOptions,
): ProviderOptions {
  const config = (providerOptions.config || {}) as Record<string, unknown>;
  const env = providerOptions.env as Record<string, string | undefined> | undefined;
  const gatewayUrl = resolveGatewayUrl(config as { gateway_url?: string }, env);
  const authToken = resolveAuthToken(config as { auth_token?: string }, env);

  return {
    ...providerOptions,
    config: {
      ...config,
      apiBaseUrl: `${gatewayUrl}/v1`,
      // Only set apiKey if we resolved an OpenClaw token; don't clobber user-supplied keys
      ...(authToken && { apiKey: authToken }),
      // Prevent OpenAI base class from falling back to OPENAI_API_KEY
      apiKeyRequired: false,
      headers: {
        ...(config.headers as Record<string, string> | undefined),
        ...buildOpenClawHeaders(agentId, config as OpenClawConfig),
      },
    },
  };
}
