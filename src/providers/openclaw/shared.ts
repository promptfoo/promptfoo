import fs from 'fs';
import os from 'os';
import path from 'path';

import JSON5 from 'json5';
import { getEnvString } from '../../envars';
import logger from '../../logger';

import type { ProviderOptions } from '../../types/providers';
import type { OpenClawConfig, OpenClawGatewayConfig } from './types';

export const DEFAULT_GATEWAY_PORT = 18789;
export const DEFAULT_GATEWAY_HOST = '127.0.0.1';

/**
 * Cached config to avoid re-reading the file multiple times during provider init.
 */
let cachedConfig: { config: OpenClawGatewayConfig | undefined; mtime: number } | undefined;
let cachedConfigPath: string | undefined;

type GatewayTransport = 'http' | 'ws';
export type OpenClawAuthSecret = { kind: 'password' | 'token'; value: string };

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

function normalizeGatewayUrl(url: string, transport: GatewayTransport): string | undefined {
  const trimmed = url.trim();
  if (!trimmed) {
    return undefined;
  }

  if (transport === 'http') {
    if (trimmed.startsWith('wss://')) {
      return `https://${trimmed.slice('wss://'.length)}`;
    }
    if (trimmed.startsWith('ws://')) {
      return `http://${trimmed.slice('ws://'.length)}`;
    }
    return trimmed;
  }

  if (trimmed.startsWith('https://')) {
    return `wss://${trimmed.slice('https://'.length)}`;
  }
  if (trimmed.startsWith('http://')) {
    return `ws://${trimmed.slice('http://'.length)}`;
  }
  return trimmed;
}

function resolveGatewayHost(gatewayConfig: OpenClawGatewayConfig['gateway'] | undefined): string {
  const bind = gatewayConfig?.bind?.trim();
  const customBindHost = gatewayConfig?.customBindHost?.trim();

  // OpenClaw commonly stores named bind modes; older configs may still contain literal bind
  // addresses, so normalize both shapes to a loopback URL for local autodetection.
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

function buildLocalGatewayUrl(
  gatewayConfig: OpenClawGatewayConfig['gateway'],
  transport: GatewayTransport,
  portOverride?: number,
): string {
  const scheme =
    transport === 'ws'
      ? gatewayConfig?.tls?.enabled
        ? 'wss'
        : 'ws'
      : gatewayConfig?.tls?.enabled
        ? 'https'
        : 'http';
  const port = portOverride ?? gatewayConfig?.port ?? DEFAULT_GATEWAY_PORT;
  const host = resolveGatewayHost(gatewayConfig);
  return `${scheme}://${host}:${port}`;
}

function resolveGatewayUrlFromConfig(
  openclawConfig: OpenClawGatewayConfig | undefined,
  transport: GatewayTransport,
  portOverride?: number,
): string | undefined {
  const gatewayConfig = openclawConfig?.gateway;
  if (!gatewayConfig) {
    return undefined;
  }

  if (gatewayConfig.mode === 'remote') {
    const remoteUrl = normalizeGatewayUrl(gatewayConfig.remote?.url ?? '', transport);
    if (remoteUrl) {
      return remoteUrl;
    }
  }

  return buildLocalGatewayUrl(gatewayConfig, transport, portOverride);
}

function resolveGatewayPortOverride(env?: Record<string, string | undefined>): number | undefined {
  const rawPort = env?.OPENCLAW_GATEWAY_PORT || getEnvString('OPENCLAW_GATEWAY_PORT');
  const trimmedPort = rawPort?.trim();
  if (!trimmedPort || !/^\d+$/.test(trimmedPort)) {
    return undefined;
  }
  const parsedPort = Number(trimmedPort);
  return Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort <= 65535
    ? parsedPort
    : undefined;
}

function toAuthSecret(
  kind: OpenClawAuthSecret['kind'],
  value: string | undefined,
): OpenClawAuthSecret | undefined {
  const trimmed = value?.trim();
  return trimmed ? { kind, value: trimmed } : undefined;
}

function resolveAuthSecretFromConfig(
  openclawConfig: OpenClawGatewayConfig | undefined,
): OpenClawAuthSecret | undefined {
  const gatewayConfig = openclawConfig?.gateway;
  const authMode = gatewayConfig?.auth?.mode?.trim();
  const preferRemoteCredentials = gatewayConfig?.mode === 'remote';

  const localToken = toAuthSecret('token', gatewayConfig?.auth?.token);
  const localPassword = toAuthSecret('password', gatewayConfig?.auth?.password);
  const remoteToken = toAuthSecret('token', gatewayConfig?.remote?.token);
  const remotePassword = toAuthSecret('password', gatewayConfig?.remote?.password);

  if (preferRemoteCredentials) {
    if (authMode === 'password') {
      return remotePassword || localPassword || remoteToken || localToken;
    }
    if (authMode === 'token') {
      return remoteToken || localToken || remotePassword || localPassword;
    }
    return remoteToken || remotePassword || localToken || localPassword;
  }

  if (authMode === 'password') {
    return localPassword || remotePassword || localToken || remoteToken;
  }
  if (authMode === 'token') {
    return localToken || remoteToken || localPassword || remotePassword;
  }
  return localToken || localPassword || remoteToken || remotePassword;
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
    const config = JSON5.parse(raw) as OpenClawGatewayConfig;
    cachedConfig = { config, mtime };
    cachedConfigPath = configPath;
    return config;
  } catch (err) {
    logger.warn(`Failed to read OpenClaw config at ${configPath}`, { err });
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
  return resolveGatewayTransportUrl(config, env, 'http');
}

export function resolveGatewayWsUrl(
  config?: { gateway_url?: string },
  env?: Record<string, string | undefined>,
): string {
  return resolveGatewayTransportUrl(config, env, 'ws');
}

function resolveGatewayTransportUrl(
  config: { gateway_url?: string } | undefined,
  env: Record<string, string | undefined> | undefined,
  transport: GatewayTransport,
): string {
  // 1. Explicit config
  const configUrl = config?.gateway_url?.trim();
  if (configUrl) {
    return normalizeGatewayUrl(configUrl, transport) || configUrl;
  }

  // 2. Per-provider env overrides, then process environment variable
  const envUrl =
    env?.OPENCLAW_GATEWAY_URL ||
    getEnvString('OPENCLAW_GATEWAY_URL') ||
    env?.CLAWDBOT_GATEWAY_URL ||
    getEnvString('CLAWDBOT_GATEWAY_URL');
  const trimmedEnvUrl = envUrl?.trim();
  if (trimmedEnvUrl) {
    return normalizeGatewayUrl(trimmedEnvUrl, transport) || trimmedEnvUrl;
  }

  // 3. Auto-detect from the active OpenClaw config file
  const portOverride = resolveGatewayPortOverride(env);
  const openclawConfig = readOpenClawConfig(env);
  const resolvedUrl = resolveGatewayUrlFromConfig(openclawConfig, transport, portOverride);
  if (resolvedUrl) {
    return resolvedUrl;
  }

  // 4. Default
  const scheme = transport === 'ws' ? 'ws' : 'http';
  return `${scheme}://${DEFAULT_GATEWAY_HOST}:${portOverride ?? DEFAULT_GATEWAY_PORT}`;
}

export function resolveAuthSecret(
  config?: { auth_password?: string; auth_token?: string },
  env?: Record<string, string | undefined>,
): OpenClawAuthSecret | undefined {
  // 1. Explicit config
  if (config?.auth_token) {
    return { kind: 'token', value: config.auth_token };
  }
  if (config?.auth_password) {
    return { kind: 'password', value: config.auth_password };
  }

  // 2. Per-provider env overrides, then process environment variable
  const envToken =
    env?.OPENCLAW_GATEWAY_TOKEN ||
    getEnvString('OPENCLAW_GATEWAY_TOKEN') ||
    env?.CLAWDBOT_GATEWAY_TOKEN ||
    getEnvString('CLAWDBOT_GATEWAY_TOKEN');
  if (envToken) {
    return { kind: 'token', value: envToken };
  }
  const envPassword =
    env?.OPENCLAW_GATEWAY_PASSWORD ||
    getEnvString('OPENCLAW_GATEWAY_PASSWORD') ||
    env?.CLAWDBOT_GATEWAY_PASSWORD ||
    getEnvString('CLAWDBOT_GATEWAY_PASSWORD');
  if (envPassword) {
    return { kind: 'password', value: envPassword };
  }

  // 3. Auto-detect from the active OpenClaw config file
  const openclawConfig = readOpenClawConfig(env);
  // The config file carries an auth mode, so prefer the secret that matches that mode when it is
  // explicit. In remote mode, prefer gateway.remote credentials before local gateway.auth values.
  return resolveAuthSecretFromConfig(openclawConfig);
}

/**
 * Auto-detect the OpenClaw gateway bearer secret from config, env overrides, or the active
 * config file. OpenClaw accepts either a token or password as the HTTP bearer secret.
 */
export function resolveAuthToken(
  config?: { auth_password?: string; auth_token?: string },
  env?: Record<string, string | undefined>,
): string | undefined {
  return resolveAuthSecret(config, env)?.value;
}

/**
 * Build the canonical OpenClaw model id for OpenAI-compatible endpoints.
 */
export function buildOpenClawModelName(agentId: string): string {
  const trimmedAgentId = agentId.trim();
  if (!trimmedAgentId || trimmedAgentId === 'default' || trimmedAgentId === 'openclaw') {
    return 'openclaw/default';
  }
  if (trimmedAgentId.startsWith('openclaw/')) {
    const targetAgentId = trimmedAgentId.slice('openclaw/'.length).trim();
    return targetAgentId ? `openclaw/${targetAgentId}` : 'openclaw/default';
  }
  if (trimmedAgentId.startsWith('openclaw:')) {
    const targetAgentId = trimmedAgentId.slice('openclaw:'.length).trim();
    return targetAgentId ? `openclaw/${targetAgentId}` : 'openclaw/default';
  }
  if (trimmedAgentId.startsWith('agent:')) {
    const targetAgentId = trimmedAgentId.slice('agent:'.length).trim();
    return targetAgentId ? `openclaw/${targetAgentId}` : 'openclaw/default';
  }
  return `openclaw/${trimmedAgentId}`;
}

function normalizeHeaderValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

/**
 * Build OpenClaw request context headers shared by HTTP-compatible endpoints.
 */
export function buildOpenClawContextHeaders(config?: OpenClawConfig): Record<string, string> {
  const headers: Record<string, string> = {};
  const backendModel = normalizeHeaderValue(config?.backend_model || config?.model_override);
  const messageChannel = normalizeHeaderValue(config?.message_channel);
  const accountId = normalizeHeaderValue(config?.account_id);
  const scopes = config?.scopes
    ?.map((scope) => scope.trim())
    .filter(Boolean)
    .join(',');

  if (backendModel) {
    headers['x-openclaw-model'] = backendModel;
  }
  if (messageChannel) {
    headers['x-openclaw-message-channel'] = messageChannel;
  }
  if (accountId) {
    headers['x-openclaw-account-id'] = accountId;
  }
  if (scopes) {
    headers['x-openclaw-scopes'] = scopes;
  }

  return headers;
}

/**
 * Build common OpenClaw headers for agent-id, session-key, and request context.
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
  return {
    ...headers,
    ...buildOpenClawContextHeaders(config),
  };
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
  const authToken = resolveAuthToken(
    config as { auth_password?: string; auth_token?: string },
    env,
  );

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
