import { createRequire } from 'node:module';
import fs from 'fs';
import fsPromises from 'fs/promises';
import os from 'os';
import path from 'path';

import dedent from 'dedent';
import cliState from '../cliState';
import { getEnvString, getProcessEnv } from '../envars';
import { importModule } from '../esm';
import logger, { getLogLevel } from '../logger';
import {
  cacheResponse,
  generateCacheKey,
  getCachedResponse,
  initializeAgenticCache,
  resolveAgenticWorkingDir,
} from './agentic-utils';
import { classifyProviderSdkRateLimit } from './fetch';
import {
  getHeaderCredentialForms,
  getHeadersCredentialForms,
  isCredentialName,
  redactDiagnosticText,
} from './providerLogging';
import { providerRegistry } from './providerRegistry';

import type { EnvOverrides } from '../types/env';
import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
  SkillCallEntry,
} from '../types/index';

/**
 * OpenCode SDK Provider
 *
 * This provider requires the @opencode-ai/sdk package, which is not installed by default.
 * Users must install it separately:
 *   npm install @opencode-ai/sdk
 *
 * OpenCode is an open-source AI coding agent for the terminal with support for 75+ LLM providers.
 *
 * Key features:
 * - Client-server architecture with local server management
 * - Support for 75+ LLM providers (Anthropic, OpenAI, Google, Ollama, etc.)
 * - Built-in tools (bash, read, write, edit, grep, glob, etc.)
 * - Session-based conversations with persistence
 * - MCP server integration
 * - Custom agent definitions
 *
 * Default configurations:
 * - No working_dir: Runs in temp directory with no tools (chat-only mode)
 * - With working_dir: Runs in specified directory with read-only tools (read, grep, glob, list)
 *
 * For side effects (file writes, bash commands), configure tools and permissions explicitly.
 */

// Default read-only tools when working_dir is specified (alphabetically sorted)
export const FS_READONLY_TOOLS = ['glob', 'grep', 'list', 'read'];

const EDIT_TOOL_ALIASES = new Set(['edit', 'write', 'patch', 'apply_patch']);

/**
 * Tool configuration for OpenCode SDK
 */
export interface OpenCodeToolConfig {
  bash?: boolean;
  edit?: boolean;
  write?: boolean;
  read?: boolean;
  grep?: boolean;
  glob?: boolean;
  list?: boolean;
  patch?: boolean;
  todowrite?: boolean;
  todoread?: boolean;
  webfetch?: boolean;
  /** Prompt user for input during execution */
  question?: boolean;
  /** Load SKILL.md files into conversation */
  skill?: boolean;
  /** Code intelligence queries (experimental - requires OPENCODE_EXPERIMENTAL_LSP_TOOL=true) */
  lsp?: boolean;
  [key: string]: boolean | undefined; // Plugin/MCP tools, e.g. <server>_<tool>
}

/**
 * Permission value type - simple or pattern-based
 * Pattern-based permissions use glob patterns as keys (e.g., "*.ts": "allow")
 */
export type OpenCodePermissionValue =
  | 'ask'
  | 'allow'
  | 'deny'
  | Record<string, 'ask' | 'allow' | 'deny'>;

/**
 * Permission configuration for specific tools
 *
 * Supports both simple values ('ask', 'allow', 'deny') and pattern-based
 * configuration using glob patterns for granular control.
 *
 * @example
 * ```yaml
 * permission:
 *   bash: allow  # Simple: allow all bash commands
 *   edit:
 *     "*.md": allow      # Pattern: allow editing markdown files
 *     "src/**": ask      # Pattern: ask for src directory
 *   external_directory: deny  # Deny access outside working dir
 * ```
 */
export interface OpenCodePermissionConfig {
  /** Shell command execution permission */
  bash?: OpenCodePermissionValue;
  /** File editing permission */
  edit?: OpenCodePermissionValue;
  /** File read permission */
  read?: OpenCodePermissionValue;
  /** File glob permission */
  glob?: OpenCodePermissionValue;
  /** File grep permission */
  grep?: OpenCodePermissionValue;
  /** File list permission */
  list?: OpenCodePermissionValue;
  /** Subtask execution permission */
  task?: OpenCodePermissionValue;
  /** LSP code intelligence permission */
  lsp?: OpenCodePermissionValue;
  /** SKILL.md loading permission */
  skill?: OpenCodePermissionValue;
  /** Web fetching permission */
  webfetch?: OpenCodePermissionValue;
  /** Web search permission */
  websearch?: OpenCodePermissionValue;
  /** Codebase search permission */
  codesearch?: OpenCodePermissionValue;
  /** Todo list write permission */
  todowrite?: OpenCodePermissionValue;
  /** Interactive question permission */
  question?: OpenCodePermissionValue;
  /** Prevents infinite agent loops (added in v1.1.1) */
  doom_loop?: OpenCodePermissionValue;
  /** Access to directories outside the working directory (added in v1.1.1) */
  external_directory?: OpenCodePermissionValue;
  /** Forward-compatible escape hatch for tools added upstream */
  [key: string]: OpenCodePermissionValue | undefined;
}

/**
 * Single permission rule passed to OpenCode v2 `session.create`.
 *
 * The v2 SDK types permission as `PermissionRuleset = Array<PermissionRule>`,
 * so promptfoo converts the user-facing `OpenCodePermissionConfig` object
 * shape into this rule-array shape before calling the server.
 */
export interface OpenCodePermissionRule {
  permission: string;
  pattern: string;
  action: 'ask' | 'allow' | 'deny';
}

/**
 * Custom agent configuration
 *
 * Defines a specialized agent with specific capabilities, model settings,
 * and tool access controls.
 */
export interface OpenCodeAgentConfig {
  /** Required description explaining the agent's purpose */
  description: string;
  /** Agent mode: 'primary' for main assistants, 'subagent' for specialized tasks, 'all' for both */
  mode?: 'primary' | 'subagent' | 'all';
  /** Full OpenCode provider/model-id for this agent (e.g., 'anthropic/claude-sonnet-4-6') */
  model?: string;
  /** Temperature for response randomness (0.0-1.0) */
  temperature?: number;
  /** Nucleus sampling parameter (0.0-1.0) */
  top_p?: number;
  /** Tool configuration for this agent */
  tools?: OpenCodeToolConfig;
  /** Permission configuration for this agent */
  permission?: OpenCodePermissionConfig;
  /** Custom system prompt for the agent */
  prompt?: string;
  /**
   * Maximum agentic iterations before forcing text-only response
   * @deprecated Use `steps` instead (deprecated in v1.1.1)
   */
  maxSteps?: number;
  /** Maximum agentic iterations before forcing text-only response (replaces maxSteps) */
  steps?: number;
  /** Hex color code for visual identification (e.g., "#ff5500") */
  color?: string;
  /** Disable this agent */
  disable?: boolean;
  /** Hide this agent from @ autocomplete (subagents only) */
  hidden?: boolean;
}

/**
 * MCP local server configuration
 */
export interface OpenCodeMCPLocalConfig {
  type: 'local';
  command: string[];
  environment?: Record<string, string>;
  enabled?: boolean;
  timeout?: number;
}

/**
 * OAuth configuration for MCP remote servers
 */
export interface OpenCodeMCPOAuthConfig {
  /** OAuth client ID */
  clientId: string;
  /** OAuth client secret */
  clientSecret?: string;
  /** OAuth scope(s) to request */
  scope?: string;
}

/**
 * MCP remote server configuration
 */
export interface OpenCodeMCPRemoteConfig {
  type: 'remote';
  url: string;
  headers?: Record<string, string>;
  /** OAuth configuration for authenticated MCP servers */
  oauth?: OpenCodeMCPOAuthConfig;
  enabled?: boolean;
  timeout?: number;
}

/**
 * MCP server configuration (local or remote)
 */
export type OpenCodeMCPServerConfig = OpenCodeMCPLocalConfig | OpenCodeMCPRemoteConfig;

export interface OpenCodeOutputFormatText {
  type: 'text';
}

export interface OpenCodeOutputFormatJsonSchema {
  type: 'json_schema';
  schema: Record<string, unknown>;
  retryCount?: number;
}

export type OpenCodeOutputFormat = OpenCodeOutputFormatText | OpenCodeOutputFormatJsonSchema;

/**
 * OpenCode SDK Provider Configuration
 */
export interface OpenCodeSDKConfig {
  /**
   * API key for the underlying LLM provider (e.g., Anthropic, OpenAI)
   * Falls back to provider-specific environment variables
   */
  apiKey?: string;

  /**
   * LLM provider ID (e.g., 'anthropic', 'openai', 'google', 'ollama')
   * Used for model selection and API key resolution
   */
  provider_id?: string;

  /**
   * Model ID within provider_id (e.g., 'claude-sonnet-4-6', 'gpt-4o').
   * Set provider_id separately; custom_agent.model uses the full provider/model-id instead.
   */
  model?: string;

  /**
   * Base URL for connecting to an existing OpenCode server
   * If not specified, the provider will start its own server
   */
  baseUrl?: string;

  /**
   * Hostname for the OpenCode server (when starting a new server)
   * @default '127.0.0.1'
   */
  hostname?: string;

  /**
   * Port for the OpenCode server (when starting a new server)
   * @default 0 (random available port)
   */
  port?: number;

  /**
   * Timeout for server startup in milliseconds
   * @default 30000
   */
  timeout?: number;

  /**
   * Working directory for OpenCode to operate in
   * If not specified, uses a temporary directory
   */
  working_dir?: string;

  /**
   * Workspace identifier for OpenCode v2 workspace-aware APIs
   * Requires either working_dir or baseUrl
   */
  workspace?: string;

  /**
   * Tool configuration - enable/disable specific tools
   * When working_dir is set, defaults to read-only tools
   */
  tools?: OpenCodeToolConfig;

  /**
   * Permission configuration for tools
   * Controls whether tools require confirmation
   */
  permission?: OpenCodePermissionConfig;

  /**
   * Built-in agent to use ('build', 'plan', etc.)
   */
  agent?: string;

  /**
   * Output format for model responses
   * Supports plain text and JSON Schema-constrained responses
   */
  format?: OpenCodeOutputFormat;

  /**
   * Provider/model variant to use when OpenCode provider config defines variants
   */
  variant?: string;

  /**
   * Custom agent configuration
   */
  custom_agent?: OpenCodeAgentConfig;

  /**
   * Session ID to resume an existing session
   */
  session_id?: string;

  /**
   * Parent session ID for forked sessions (v2 only).
   * When set, the new session is created as a child fork of the given parent,
   * inheriting its compacted history. Ignored on the v1 SDK and when
   * `session_id` is provided (resumed sessions never fork on create).
   *
   * Tied to the upstream fix in opencode 1.14.30 that keeps compacted history
   * intact for forked sessions.
   */
  parent_session_id?: string;

  /**
   * Keep sessions alive between calls
   */
  persist_sessions?: boolean;

  /**
   * MCP server configuration
   */
  mcp?: Record<string, OpenCodeMCPServerConfig>;

  /**
   * When true, enables caching even when MCP servers are configured.
   * Use this when your MCP tools are deterministic (e.g., code search, static knowledge bases).
   * Different MCP configurations will produce different cache keys.
   * @default false
   */
  cache_mcp?: boolean;

  /**
   * Maximum retries for API calls
   * @default 2
   */
  max_retries?: number;

  /**
   * Log level for the SDK
   * @default 'warn'
   */
  log_level?: 'debug' | 'info' | 'warn' | 'error' | 'off';

  /**
   * Reserved for future SSE-based streaming support.
   * Currently a no-op for the OpenCode SDK provider; setting it logs a warning.
   * Use the `openai:codex-sdk` provider if you need streaming today.
   * @default false
   */
  enable_streaming?: boolean;
}

/**
 * Check if promptfoo is in debug mode
 */
function isDebugMode(): boolean {
  return getLogLevel() === 'debug';
}

/**
 * Maximum number of sessions to keep in memory to prevent unbounded growth
 */
const MAX_SESSIONS = 100;
const SESSION_ABORT_TIMEOUT_MS = 1_000;

/**
 * OpenCode SDK client interface
 */
interface OpenCodeClient {
  session: {
    create: (
      parameters: Record<string, unknown>,
    ) => Promise<OpenCodeSdkResult<Record<string, unknown>>>;
    prompt: (
      parameters: Record<string, unknown>,
      options?: Record<string, unknown>,
    ) => Promise<OpenCodeSdkResult<OpenCodePromptResponse>>;
    messages: (
      parameters: Record<string, unknown>,
      options?: Record<string, unknown>,
    ) => Promise<OpenCodeSdkResult<OpenCodeSessionMessage[]>>;
    delete: (parameters: Record<string, unknown>) => Promise<unknown>;
    abort?: (
      parameters: Record<string, unknown>,
      options?: Record<string, unknown>,
    ) => Promise<unknown>;
  };
}

/**
 * OpenCode SDK server interface
 */
interface OpenCodeServer {
  url: string;
  close(): void;
}

/**
 * OpenCode SDK module interface
 */
interface OpenCodeSDKModule {
  createOpencode: (options: {
    hostname?: string;
    port?: number;
    timeout?: number;
    signal?: AbortSignal;
    config?: Record<string, unknown>;
    env?: Record<string, string>;
  }) => Promise<{ client: OpenCodeClient; server: OpenCodeServer }>;
  createOpencodeClient: (options: { baseUrl: string }) => OpenCodeClient;
}

interface LoadedOpenCodeSDKModule extends OpenCodeSDKModule {
  apiVersion: 'v1' | 'v2';
}

interface OpenCodeSessionQuery {
  directory?: string;
  workspace?: string;
}

interface OpenCodeSessionPath {
  id: string;
  sessionID: string;
}

interface OpenCodeSessionHandle {
  id: string;
  query?: OpenCodeSessionQuery;
}

interface OpenCodePreparedCall {
  config: OpenCodeSDKConfig;
  isTempDir: boolean;
  workingDir?: string;
}

interface OpenCodeSessionContext {
  sessionId: string;
  sessionQuery?: OpenCodeSessionQuery;
  ephemeralSession?: OpenCodeSessionHandle;
}

type OpenCodeTokenCache =
  | number
  | {
      read?: number;
      write?: number;
    };

interface OpenCodeAssistantMessage {
  id?: string;
  parentID?: string;
  error?: unknown;
  tokens?: {
    total?: number;
    input?: number;
    output?: number;
    reasoning?: number;
    cache?: OpenCodeTokenCache;
  };
  cost?: number;
  structured?: unknown;
}

interface OpenCodeSessionMessage {
  info?: { id?: string };
  parts?: OpenCodePromptPart[];
}

interface OpenCodePromptPart {
  type: string;
  text?: string;
  tool?: string;
  state?: {
    status?: string;
    input?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  };
}

interface OpenCodePromptResponse {
  info?: OpenCodeAssistantMessage;
  parts?: OpenCodePromptPart[];
}

type OpenCodeSdkResult<T> =
  | T
  | {
      data?: T;
      error?: unknown;
      response?: { status?: number; headers?: unknown };
    };

interface OpenCodePromptError {
  error: unknown;
  status?: number;
  headers?: unknown;
  assistant?: boolean;
}

/**
 * The generated SDK resolves HTTP failures as `{ error, response }` instead of throwing, and a
 * completed prompt reports model-provider failures on the assistant message rather than its parts.
 */
function getOpenCodePromptError(
  response: OpenCodeSdkResult<OpenCodePromptResponse>,
): OpenCodePromptError | undefined {
  if (response && typeof response === 'object' && ('error' in response || 'response' in response)) {
    const { error, response: transport } = response;
    const status = transport?.status;
    if (error != null || (typeof status === 'number' && (status < 200 || status >= 300))) {
      return { error, status, headers: transport?.headers };
    }
  }
  const error = unwrapOpenCodeResult(response)?.info?.error;
  return error == null ? undefined : { error, assistant: true };
}

function isOpenCodeContentFilterRefusal(promptError: OpenCodePromptError | undefined): boolean {
  return (
    promptError?.assistant === true &&
    parseOpenCodeError(promptError.error).name === 'ContentFilterError'
  );
}

/** OpenCode `NamedError` tags. Any other upstream-controlled name is left out of diagnostics. */
const OPEN_CODE_ERROR_NAMES = new Set([
  'APIError',
  'BadRequest',
  'ContentFilterError',
  'ContextOverflowError',
  'InternalServerError',
  'InvalidRequestError',
  'MessageAbortedError',
  'MessageOutputLengthError',
  'NotFoundError',
  'ProviderAuthError',
  'StructuredOutputError',
  'UnknownError',
]);

interface OpenCodeErrorDetails {
  name?: string;
  status?: number;
  message?: string;
  data?: Record<string, unknown>;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
}

function toHttpStatus(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 100 && value <= 599
    ? value
    : undefined;
}

function getOpenCodeDiagnosticMessage(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  if (value.length > 4_096) {
    return 'Upstream diagnostic omitted because it is too large';
  }
  return value.trim() ? value : undefined;
}

/**
 * Read an OpenCode `NamedError` (`{ name, data: { message, statusCode } }`), an untagged gateway
 * body, a thrown `Error`, or a string. Response bodies, headers, and causes are never rendered.
 * The SDK's sibling HTTP status is authoritative, since a gateway body can imitate an SDK tag.
 */
function parseOpenCodeError(error: unknown, transportStatus?: number): OpenCodeErrorDetails {
  if (typeof error === 'string') {
    return { status: toHttpStatus(transportStatus), message: getOpenCodeDiagnosticMessage(error) };
  }
  const item = asRecord(error);
  const data = asRecord(item?.data);
  const tag = typeof item?.name === 'string' ? item.name : item?._tag;
  const name = typeof tag === 'string' && OPEN_CODE_ERROR_NAMES.has(tag) ? tag : undefined;
  const status =
    toHttpStatus(transportStatus) ??
    toHttpStatus(item?.statusCode) ??
    toHttpStatus(data?.statusCode);
  const message =
    getOpenCodeDiagnosticMessage(item?.message) ?? getOpenCodeDiagnosticMessage(data?.message);
  return { name, status, message, data };
}

function describeOpenCodeError({ name, status, message }: OpenCodeErrorDetails): string {
  return (
    [name, status === undefined ? undefined : `HTTP ${status}`, message]
      .filter(Boolean)
      .join(': ') || 'Unknown OpenCode error'
  );
}

type OpenCodeRateLimit = ReturnType<typeof classifyProviderSdkRateLimit>;

/**
 * Classify an HTTP 429 with the shared fetch contract. `APIError` nests the upstream body and
 * headers; an untagged gateway body is the error itself.
 */
function getOpenCodeRateLimit(
  error: unknown,
  { status, message, data }: OpenCodeErrorDetails,
  transportHeaders?: unknown,
): OpenCodeRateLimit | undefined {
  if (status !== 429) {
    return undefined;
  }
  let body = data?.responseBody;
  if (typeof body === 'string') {
    if (body.length > 32_768) {
      body = undefined;
    } else {
      try {
        body = JSON.parse(body);
      } catch {
        // Plain-text and truncated bodies are scanned for codes as text.
      }
    }
  }
  const headers: Record<string, string> = {};
  // The SDK's transport headers may come from a gateway, so upstream values take precedence.
  for (const source of [transportHeaders, data?.responseHeaders]) {
    const entries =
      source instanceof Headers ? source.entries() : Object.entries(asRecord(source) ?? {});
    for (const [name, value] of entries) {
      if (typeof value === 'string') {
        headers[name.toLowerCase()] = value;
      }
    }
  }
  return classifyProviderSdkRateLimit({
    records: [body, data, error],
    texts: [typeof body === 'string' ? body : undefined, message],
    headers,
  });
}

/** Longest upstream retry hint passed to the scheduler, whose shared queue state honors it. */
const OPEN_CODE_MAX_RETRY_AFTER_MS = 60_000;

function getOpenCodeRateLimitMetadata(rateLimit: OpenCodeRateLimit): Record<string, unknown> {
  const retryAfterMs =
    rateLimit.kind === 'rate_limit'
      ? (rateLimit.retryAfterMs ??
        (rateLimit.resetAt === undefined ? undefined : Math.max(0, rateLimit.resetAt - Date.now())))
      : undefined;
  return {
    rateLimitKind: rateLimit.kind,
    http: {
      status: rateLimit.status,
      statusText: rateLimit.statusText,
      // Longer hints still decide the classification above but would stall every queued call.
      ...(retryAfterMs === undefined || retryAfterMs > OPEN_CODE_MAX_RETRY_AFTER_MS
        ? {}
        : { headers: { 'retry-after-ms': String(Math.ceil(retryAfterMs)) } }),
    },
  };
}

function getOpenCodeAccounting(
  message: OpenCodeAssistantMessage | undefined,
): Pick<ProviderResponse, 'tokenUsage' | 'cost'> {
  const isCount = (value: unknown): value is number =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
  const source = asRecord(message?.tokens);
  const tokens: NonNullable<OpenCodeAssistantMessage['tokens']> = {};
  for (const key of ['total', 'input', 'output', 'reasoning'] as const) {
    const value = source?.[key];
    if (isCount(value)) {
      tokens[key] = value;
    }
  }
  const cache = source?.cache;
  if (isCount(cache)) {
    tokens.cache = cache;
  } else {
    const raw = asRecord(cache);
    const read = raw?.read;
    const write = raw?.write;
    if (isCount(read) || isCount(write)) {
      tokens.cache = {
        ...(isCount(read) ? { read } : {}),
        ...(isCount(write) ? { write } : {}),
      };
    }
  }
  const tokenUsage = Object.keys(tokens).length ? buildOpenCodeTokenUsage(tokens) : undefined;
  if (tokenUsage && !isCount(tokenUsage.total)) {
    delete tokenUsage.total;
  }
  const cost = message?.cost;
  return {
    ...(tokenUsage ? { tokenUsage } : {}),
    ...(typeof cost === 'number' && Number.isFinite(cost) && cost >= 0 ? { cost } : {}),
  };
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Endpoint words carry useful diagnostic context; other configured path segments may be tokens. */
const OPEN_CODE_PUBLIC_PATH_SEGMENT =
  /^(?:api|connect|events|healthz?|http|https|mcp|openapi|prompts|ready|resources|sessions?|sse|stream|tools|v\d+(?:\.\d+)*|webhook)$/i;

/**
 * Add a configured URL's userinfo, private path segments, and query and fragment values (split on
 * `&` and `;`), raw and decoded. A URL that does not parse is split by hand, since OpenCode may
 * still echo its parts.
 */
function addOpenCodeUrlCredentials(value: unknown, add: (value: unknown) => void): void {
  if (typeof value !== 'string' || !value.includes('://')) {
    return;
  }
  let userinfo: string[];
  let path: string;
  let parameters: string;
  try {
    const url = new URL(value.replace(/^jdbc:/i, ''));
    [userinfo, path, parameters] = [
      [url.username, url.password],
      url.pathname,
      url.search + url.hash,
    ];
  } catch {
    const [, rawUserinfo = '', rawPath = '', rawParameters = ''] =
      value.slice(value.indexOf('://') + 3).match(/^(?:([^@/?#]*)@)?[^/?#]*([^?#]*)(.*)$/s) ?? [];
    [userinfo, path, parameters] = [rawUserinfo.split(':'), rawPath, rawParameters];
    add(value);
  }
  const pathSegments = path
    .split('/')
    .filter((segment) => !OPEN_CODE_PUBLIC_PATH_SEGMENT.test(segment));
  for (const part of [...userinfo, ...pathSegments]) {
    add(part);
    add(safeDecodeURIComponent(part));
  }
  for (const parameter of parameters.split(/[?#&;]/).filter((item) => item.includes('='))) {
    const parameterValue = parameter.slice(parameter.indexOf('=') + 1);
    add(parameterValue);
    add(safeDecodeURIComponent(parameterValue.replace(/\+/g, ' ')));
  }
}

/**
 * Add the values an MCP server definition hands to OpenCode. Local environment names are
 * user-defined and command arguments can embed credentials in shell strings (`sh -c "TOKEN=x"`),
 * so every value, `name=value` part, and URL credential is treated as secret.
 */
function addOpenCodeMcpCredentials(server: unknown, add: (value: unknown) => void): void {
  const mcp = asRecord(server);
  if (mcp?.type === 'remote') {
    addOpenCodeUrlCredentials(mcp.url, add);
    add(asRecord(mcp.oauth)?.clientSecret);
    getHeadersCredentialForms(mcp.headers).forEach(add);
  } else if (mcp?.type === 'local') {
    const values = [
      ...Object.values(asRecord(mcp.environment) ?? {}),
      ...(Array.isArray(mcp.command) ? mcp.command.slice(1) : []),
    ];
    for (const value of values.filter((item): item is string => typeof item === 'string')) {
      add(value);
      // Flags and shell strings: `--key=x`, `-H "X-Key: x"`, `sh -c "exec mcp --token x"`.
      for (const part of value.split(/[\s"'`;&|()<>=]+/)) {
        add(part);
        if (part.includes('://')) {
          addOpenCodeUrlCredentials(part, add);
        } else {
          part.split(/[:,]/).forEach(add);
        }
      }
    }
  }
}

function hasDynamicOpenCodeMcpCommand(server: unknown): boolean {
  const mcp = asRecord(server);
  return (
    mcp?.type === 'local' &&
    Array.isArray(mcp.command) &&
    mcp.command
      .slice(1)
      .some(
        (argument) =>
          typeof argument === 'string' &&
          /\$(?:[\w{(])|\x60|\b(?:process\.env|(?:Deno|Bun)\.env|os\.environ|ENV\s*[\[.]|\w+\.join\s*\(|\w+\.toString\s*\()|(?:^|\s)(?:\||(?:printf|base64)\b)/.test(
            argument,
          ),
      )
  );
}

/**
 * Resolve ESM-only package entry point by reading package.json exports
 * Handles packages that only have "import" condition (no "require" condition)
 *
 * @param packageName - The package name (e.g., '@opencode-ai/sdk')
 * @param basePath - Base path for resolution
 * @returns Absolute path to the ESM entry point
 */
function resolveEsmPackage(
  packageName: string,
  exportPath: '.' | './v2',
  basePath: string,
): string {
  const require = createRequire(path.join(basePath, 'package.json'));

  // Try to find package.json using require.resolve with package.json subpath
  // This handles monorepos, workspaces, pnpm, etc.
  let packageJsonPath: string;
  try {
    packageJsonPath = require.resolve(`${packageName}/package.json`);
  } catch {
    // Fallback: construct direct path for simple node_modules structure
    packageJsonPath = path.join(
      basePath,
      'node_modules',
      ...packageName.split('/'),
      'package.json',
    );
    if (!fs.existsSync(packageJsonPath)) {
      throw new Error(`Cannot find ${packageName}/package.json`);
    }
  }

  const packageDir = path.dirname(packageJsonPath);
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

  // Extract ESM entry point from exports field
  let esmEntry: string | undefined;

  if (packageJson.exports) {
    const mainExport =
      packageJson.exports[exportPath] ||
      (exportPath === '.' ? packageJson.exports['.'] || packageJson.exports : undefined);
    if (typeof mainExport === 'string') {
      esmEntry = mainExport;
    } else if (typeof mainExport === 'object') {
      // Prefer "import" condition for ESM
      esmEntry = mainExport.import || mainExport.default;
    }
  }

  // Fallback to module or main field
  if (!esmEntry) {
    esmEntry = packageJson.module || packageJson.main;
  }

  if (!esmEntry) {
    throw new Error(`Cannot find ESM entry point in ${packageName}/package.json`);
  }

  return path.join(packageDir, esmEntry);
}

function unwrapOpenCodeResult<T>(result: OpenCodeSdkResult<T> | undefined): T | undefined {
  if (result === undefined || result === null) {
    return undefined;
  }
  if (typeof result === 'object' && 'data' in result) {
    return result.data as T | undefined;
  }
  return result as T;
}

function getOpenCodeCacheDetails(cache: OpenCodeTokenCache | undefined): {
  read: number;
  write: number;
} {
  if (typeof cache === 'number') {
    return { read: cache, write: 0 };
  }
  if (!cache || typeof cache !== 'object') {
    return { read: 0, write: 0 };
  }
  return {
    read: cache.read ?? 0,
    write: cache.write ?? 0,
  };
}

function buildOpenCodeTokenUsage(
  tokens: OpenCodeAssistantMessage['tokens'],
): ProviderResponse['tokenUsage'] {
  if (!tokens) {
    return undefined;
  }

  const prompt = tokens.input ?? 0;
  const completion = tokens.output ?? 0;
  const cache = getOpenCodeCacheDetails(tokens.cache);
  const completionDetails: NonNullable<ProviderResponse['tokenUsage']>['completionDetails'] = {};

  if (typeof tokens.reasoning === 'number') {
    completionDetails.reasoning = tokens.reasoning;
  }
  if (tokens.cache !== undefined) {
    completionDetails.cacheReadInputTokens = cache.read;
    completionDetails.cacheCreationInputTokens = cache.write;
  }

  return {
    prompt,
    completion,
    total: tokens.total ?? prompt + completion,
    ...(tokens.cache === undefined ? {} : { cached: cache.read }),
    ...(Object.keys(completionDetails).length > 0 ? { completionDetails } : {}),
  };
}

function getSessionPath(sessionId: string): OpenCodeSessionPath {
  return {
    id: sessionId,
    sessionID: sessionId,
  };
}

/**
 * Convert the user-facing object-shaped permission config into the
 * rule-array shape required by the v2 `session.create.permission` API.
 *
 * - `{ bash: 'allow' }` → `[{ permission: 'bash', pattern: '*', action: 'allow' }]`
 * - `{ bash: { '*': 'ask', 'git *': 'allow' } }` → two rules with the
 *   corresponding glob pattern preserved per entry.
 *
 * Returns `undefined` when the config has no usable entries so callers can
 * omit the field entirely.
 */
export function convertPermissionConfigToRuleset(
  config: OpenCodePermissionConfig | undefined,
): OpenCodePermissionRule[] | undefined {
  if (config === undefined) {
    return undefined;
  }
  if (
    !config ||
    typeof config !== 'object' ||
    Array.isArray(config) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(config))
  ) {
    throw new Error('OpenCode permission must be an object mapping tools to permission rules');
  }

  const rules: OpenCodePermissionRule[] = [];
  for (const [tool, value] of Object.entries(config)) {
    if (value === undefined) {
      continue;
    }
    if (isOpenCodePermissionAction(value)) {
      rules.push({ permission: tool, pattern: '*', action: value });
      continue;
    }

    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    ) {
      throw new Error(`OpenCode permission.${tool} must be ask, allow, deny, or a pattern mapping`);
    }

    for (const [pattern, action] of Object.entries(value)) {
      if (!isOpenCodePermissionAction(action)) {
        throw new Error(`OpenCode permission.${tool}.${pattern} must be ask, allow, or deny`);
      }
      rules.push({ permission: tool, pattern, action });
    }
  }
  return rules.length > 0 ? rules : undefined;
}

function isOpenCodePermissionAction(value: unknown): value is 'ask' | 'allow' | 'deny' {
  return value === 'ask' || value === 'allow' || value === 'deny';
}

function convertToolsConfigToRuleset(config: OpenCodeToolConfig): OpenCodePermissionRule[] {
  return Object.entries(config).map(([permission, enabled]) => ({
    permission,
    pattern: '*',
    action: enabled ? 'allow' : 'deny',
  }));
}

function openCodeMcpContainsCacheSensitiveData(
  config: Record<string, OpenCodeMCPServerConfig> | undefined,
): boolean {
  return Object.values(config ?? {}).some((server) => {
    if (
      (server.type === 'local' &&
        (Object.keys(server.environment ?? {}).length > 0 || server.command.length > 1)) ||
      (server.type === 'remote' &&
        (Object.keys(server.headers ?? {}).length > 0 || server.oauth !== undefined))
    ) {
      return true;
    }
    if (server.type !== 'remote') {
      return false;
    }
    try {
      const url = new URL(server.url);
      return Boolean(url.username || url.password || url.search);
    } catch {
      return server.url.includes('?') || server.url.includes('@');
    }
  });
}

function openCodeBaseUrlContainsCacheSensitiveData(baseUrl: string | undefined): boolean {
  if (!baseUrl) {
    return false;
  }
  try {
    const url = new URL(baseUrl);
    return Boolean(url.username || url.password || url.search);
  } catch {
    return baseUrl.includes('?') || baseUrl.includes('@');
  }
}

function getCacheSafeOpenCodeBaseUrl(baseUrl: string | undefined): string | undefined {
  if (!baseUrl || !openCodeBaseUrlContainsCacheSensitiveData(baseUrl)) {
    return baseUrl;
  }
  try {
    const url = new URL(baseUrl);
    url.username = '';
    url.password = '';
    url.search = '';
    return url.toString();
  } catch {
    return undefined;
  }
}

function tryParseJson(value: string): string | undefined {
  try {
    return JSON.stringify(JSON.parse(value));
  } catch {
    return undefined;
  }
}

function normalizeStructuredText(value: string): string | undefined {
  const trimmedValue = value.trim();
  const directJson = tryParseJson(trimmedValue);
  if (directJson) {
    return directJson;
  }

  const fencedJsonMatch = trimmedValue.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (!fencedJsonMatch?.[1]) {
    return undefined;
  }

  return tryParseJson(fencedJsonMatch[1]);
}

/**
 * Helper to load the OpenCode SDK ESM module
 *
 * Uses a two-phase approach:
 * 1. Try simple dynamic import - works when SDK is in same node_modules tree
 * 2. Fall back to smart ESM resolution for edge cases (pnpm, global installs, monorepos)
 */
async function loadOpenCodeSDK(): Promise<LoadedOpenCodeSDKModule> {
  const directImports = [
    { specifier: '@opencode-ai/sdk/v2', exportPath: './v2' as const, apiVersion: 'v2' as const },
    { specifier: '@opencode-ai/sdk', exportPath: '.' as const, apiVersion: 'v1' as const },
  ];

  for (const candidate of directImports) {
    try {
      logger.debug(`Attempting dynamic import of ${candidate.specifier}`);
      const module = (await import(candidate.specifier)) as unknown as OpenCodeSDKModule;
      return { ...module, apiVersion: candidate.apiVersion };
    } catch (error) {
      logger.debug(`Dynamic import failed for ${candidate.specifier}`, { error });
    }
  }

  const basePath =
    cliState.basePath && path.isAbsolute(cliState.basePath) ? cliState.basePath : process.cwd();

  for (const candidate of directImports) {
    try {
      const modulePath = resolveEsmPackage('@opencode-ai/sdk', candidate.exportPath, basePath);
      logger.debug(`Resolved OpenCode SDK path (${candidate.apiVersion}): ${modulePath}`);
      const module = (await importModule(modulePath)) as OpenCodeSDKModule;
      return { ...module, apiVersion: candidate.apiVersion };
    } catch (error) {
      logger.debug(`Smart resolution failed for ${candidate.specifier}`, { error });
    }
  }

  const err = new Error('Failed to resolve @opencode-ai/sdk');
  logger.error(`Failed to load OpenCode SDK: ${err}`);
  throw new Error(
    dedent`The @opencode-ai/sdk package is required but not installed.

    To use the OpenCode SDK provider, install it with:
      npm install @opencode-ai/sdk

    For more information, see: https://www.promptfoo.dev/docs/providers/opencode-sdk/`,
  );
}

export class OpenCodeSDKProvider implements ApiProvider {
  config: OpenCodeSDKConfig;
  env?: EnvOverrides;

  private providerId = 'opencode:sdk';
  private opencodeModule?: LoadedOpenCodeSDKModule;
  private client?: OpenCodeClient;
  private clientConfig?: OpenCodeSDKConfig;
  private clientInitialization?: Promise<void>;
  private server?: OpenCodeServer;
  // Every configured value an OpenCode diagnostic could echo. Kept for the provider's lifetime:
  // a reused server keeps the configuration of the call that started it.
  private readonly knownCredentials = new Set<string>();
  private readonly shortCredentials = new Set<string>();
  private withholdMcpDiagnostics = false;
  private sessions = new Map<string, OpenCodeSessionHandle>(); // cacheKey -> session, oldest first
  private sessionQueues = new Map<string, Promise<void>>();
  private activeRemoteCalls = 0;
  private readonly remoteSessionAborts = new Set<() => Promise<void>>();
  private readonly processTermination = new AbortController();
  private processShutdown?: Promise<void>;
  // Temp workspaces a running local server kept open; removal is retried once it stops.
  private readonly pendingTempDirs = new Set<string>();
  private readonly credentialCacheScope = crypto.randomUUID();
  private streamingWarningEmitted = false;

  constructor(
    options: {
      id?: string;
      config?: OpenCodeSDKConfig;
      env?: EnvOverrides;
    } = {},
  ) {
    const { config, env, id } = options;
    this.config = config ?? {};
    this.env = env;
    this.providerId = id ?? this.providerId;
  }

  id(): string {
    return this.providerId;
  }

  /**
   * Get API key based on provider_id or common environment variables
   */
  getApiKey(config: OpenCodeSDKConfig = this.config): string | undefined {
    if (config?.apiKey) {
      return config.apiKey;
    }

    // Check provider-specific env vars based on provider_id
    const providerId =
      typeof config?.provider_id === 'string' ? config.provider_id.toLowerCase() : undefined;
    if (providerId === 'anthropic') {
      return this.env?.ANTHROPIC_API_KEY || getEnvString('ANTHROPIC_API_KEY');
    }
    if (providerId === 'openai') {
      return this.env?.OPENAI_API_KEY || getEnvString('OPENAI_API_KEY');
    }
    if (providerId === 'google') {
      return this.env?.GOOGLE_API_KEY || getEnvString('GOOGLE_API_KEY');
    }

    // Fall back to common env vars
    return (
      this.env?.ANTHROPIC_API_KEY ||
      getEnvString('ANTHROPIC_API_KEY') ||
      this.env?.OPENAI_API_KEY ||
      getEnvString('OPENAI_API_KEY')
    );
  }

  private getCredentialCacheScope(config: OpenCodeSDKConfig): string | undefined {
    return config.baseUrl ? undefined : this.credentialCacheScope;
  }

  toString(): string {
    return '[OpenCode SDK Provider]';
  }

  /**
   * Explicit cleanup also deletes the persistent sessions tracked on the current connection.
   * Otherwise they stay resumable by ID after a shutdown, as documented for `persist_sessions`.
   */
  async cleanup(): Promise<void> {
    await this.clientInitialization?.catch(() => undefined);
    try {
      if (this.sessions.size && !this.client) {
        await this.ensureClient(this.clientConfig ?? this.config);
      }
      const client = this.client;
      await Promise.all(
        [...this.sessions].map(async ([key, session]) => {
          try {
            await this.deleteSession(session, client);
            if (this.sessions.get(key) === session) {
              this.sessions.delete(key);
            }
          } catch (error) {
            logger.debug(`Failed to delete persistent session ${session.id}`, {
              error: this.formatCallError(error, this.config),
            });
          }
        }),
      );
    } catch (error) {
      logger.debug('Failed to reconnect for OpenCode session cleanup', {
        error: this.formatCallError(error, this.config),
      });
    } finally {
      await this.shutdown();
    }
  }

  /** Evaluation completion stops the local server but keeps persistent sessions resumable. */
  cleanupAfterEvaluation(): Promise<void> {
    return this.shutdown();
  }

  shutdownForProcess(): Promise<void> {
    if (!this.processShutdown) {
      const remoteAborts = [...this.remoteSessionAborts].map((abort) => abort());
      this.processTermination.abort();
      const shutdown = Promise.allSettled([this.shutdown(), ...remoteAborts])
        .then(async () => {
          this.remoteSessionAborts.clear();
          if (this.server || this.pendingTempDirs.size) {
            await this.shutdown();
          }
        })
        .finally(() => {
          if (this.processShutdown === shutdown && (this.server || this.pendingTempDirs.size)) {
            this.processShutdown = undefined;
          }
        });
      this.processShutdown = shutdown;
    }
    return this.processShutdown;
  }

  /** Stop the local server (after evaluations or on process exit) and keep the sessions. */
  async shutdown(): Promise<void> {
    await this.clientInitialization?.catch(() => undefined);
    this.closeLocalServer();
    if (!this.server) {
      this.client = undefined;
    }
    await Promise.all([...this.pendingTempDirs].map((dir) => this.removeTempDir(dir)));
    this.updateRegistry();
  }

  private updateRegistry(): void {
    if (
      !this.processTermination.signal.aborted &&
      (this.server || this.pendingTempDirs.size || this.activeRemoteCalls > 0)
    ) {
      providerRegistry.register(this);
    } else {
      providerRegistry.unregister(this);
    }
  }

  private closeLocalServer(): void {
    if (this.server) {
      try {
        this.server.close();
        this.server = undefined;
        this.client = undefined;
      } catch (err) {
        logger.debug('Failed to close OpenCode server', {
          error: this.formatCallError(err, this.config),
        });
      }
    }
  }

  private async abortRemoteSession(
    client: OpenCodeClient,
    parameters: Record<string, unknown>,
  ): Promise<void> {
    if (!client.session.abort) {
      throw new Error('OpenCode SDK does not expose session cancellation');
    }
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<void>((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve();
      }, SESSION_ABORT_TIMEOUT_MS);
    });
    try {
      const request =
        this.opencodeModule?.apiVersion === 'v2'
          ? client.session.abort(parameters, { signal: controller.signal })
          : client.session.abort({ ...parameters, signal: controller.signal });
      await Promise.race([
        request.then((result) => {
          const envelope = asRecord(result);
          if (
            result !== true &&
            (envelope?.data !== true || envelope.error || asRecord(envelope.response)?.ok === false)
          ) {
            throw new Error('OpenCode did not acknowledge session cancellation');
          }
        }),
        deadline,
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  private setupSessionCancellation(
    client: OpenCodeClient,
    session: OpenCodeSessionContext,
    config: OpenCodeSDKConfig,
    abortSignal: AbortSignal | undefined,
    tracksRemote: boolean,
  ): { listener?: () => void; releaseRemote?: () => void } {
    if ((!client.session.abort || !abortSignal) && !tracksRemote) {
      return {};
    }
    const abortParams = this.buildAbortSessionParameters(session.sessionId, session.sessionQuery);
    const logAbortError = (error: unknown) => {
      logger.debug(`[OpenCode SDK] Failed to abort session ${session.sessionId}`, {
        error: this.formatCallError(error, config),
      });
    };
    let remoteAbort: Promise<void> | undefined;
    const abortRemote = () =>
      (remoteAbort ??= this.abortRemoteSession(client, abortParams).catch(logAbortError));
    let releaseRemote: (() => void) | undefined;
    if (tracksRemote) {
      this.remoteSessionAborts.add(abortRemote);
      releaseRemote = () => {
        this.remoteSessionAborts.delete(abortRemote);
      };
    }
    let listener: (() => void) | undefined;
    if (abortSignal && client.session.abort) {
      listener = () => {
        if (tracksRemote) {
          void abortRemote();
          return;
        }
        try {
          client.session.abort?.(abortParams).catch(logAbortError);
        } catch (error) {
          logAbortError(error);
        }
      };
      abortSignal.addEventListener('abort', listener, { once: true });
    }
    return { listener, releaseRemote };
  }

  private async removeTempDir(workingDir: string): Promise<void> {
    try {
      await fsPromises.rm(workingDir, { recursive: true, force: true });
      this.pendingTempDirs.delete(workingDir);
    } catch (error) {
      this.pendingTempDirs.add(workingDir);
      logger.debug('Failed to remove temp directory for OpenCode', { workingDir, error });
    }
  }

  /**
   * Remember the values an OpenCode diagnostic could echo: the provider credentials, the MCP
   * configuration, and the environment the spawned server inherits. Each value is also kept in its
   * URL-, form-, and JSON-encoded forms.
   */
  private rememberCredentials(config: OpenCodeSDKConfig): void {
    const add = (value: unknown) => {
      if (typeof value !== 'string' || !value.trim()) {
        return;
      }
      for (const form of new Set([value, value.trim()])) {
        this.knownCredentials.add(form);
        this.knownCredentials.add(JSON.stringify(form).slice(1, -1));
        this.knownCredentials.add(new URLSearchParams({ form }).toString().slice('form='.length));
        try {
          this.knownCredentials.add(encodeURIComponent(form));
        } catch {
          // Lone surrogates cannot be URI-encoded; the raw and JSON forms are still covered.
        }
      }
    };
    const addStrong = (value: unknown) => {
      add(value);
      if (typeof value === 'string' && value.length >= 4 && value.length < 8) {
        this.shortCredentials.add(value);
      }
    };
    addStrong(config.apiKey);
    addStrong(this.getApiKey(config));
    addOpenCodeUrlCredentials(config.baseUrl, add);
    for (const server of Object.values(asRecord(config.mcp) ?? {})) {
      addOpenCodeMcpCredentials(server, add);
      this.withholdMcpDiagnostics ||= hasDynamicOpenCodeMcpCommand(server);
      const mcp = asRecord(server);
      if (mcp?.type === 'local') {
        Object.values(asRecord(mcp.environment) ?? {}).forEach(addStrong);
      } else if (mcp?.type === 'remote') {
        getHeadersCredentialForms(mcp.headers).forEach(addStrong);
        addStrong(asRecord(mcp.oauth)?.clientSecret);
      }
    }
    // The SDK client runs in-process; a spawned server also receives invocation env-file values.
    for (const env of new Set([process.env, getProcessEnv(), this.env ?? {}])) {
      for (const [name, value] of Object.entries(env)) {
        if (typeof value === 'string' && isCredentialName(name)) {
          getHeaderCredentialForms(value).forEach(addStrong);
        }
        addOpenCodeUrlCredentials(value, add);
      }
    }
  }

  private formatCallError(
    error: unknown,
    config: OpenCodeSDKConfig,
    transportStatus?: number,
  ): string {
    this.rememberCredentials(config);
    const details = parseOpenCodeError(error, transportStatus);
    if (this.withholdMcpDiagnostics && details.message) {
      details.message =
        'Upstream diagnostic withheld because a local MCP command may transform credentials';
    }
    let text = describeOpenCodeError(details);
    for (const credential of this.shortCredentials) {
      text = text.split(credential).join('[REDACTED]');
    }
    return redactDiagnosticText(text, this.knownCredentials)
      .replace(/[\r\n]+/g, ' ')
      .slice(0, 500);
  }

  /**
   * Build the tools configuration based on config and defaults
   */
  private buildToolsConfig(config: OpenCodeSDKConfig, includeDefaults = true): OpenCodeToolConfig {
    const configuredTools = config.tools;
    if (
      configuredTools !== undefined &&
      (!configuredTools ||
        typeof configuredTools !== 'object' ||
        Array.isArray(configuredTools) ||
        ![Object.prototype, null].includes(Object.getPrototypeOf(configuredTools)))
    ) {
      throw new Error('OpenCode tools must be an object mapping tool names to booleans');
    }

    const entries = new Map<string, boolean>();
    if (includeDefaults) {
      // OpenCode permissions use last-match-wins. A wildcard deny keeps future,
      // plugin, and MCP tools disabled unless the user explicitly enables them.
      entries.set('*', false);
      if (config.working_dir) {
        for (const tool of FS_READONLY_TOOLS) {
          entries.set(tool, true);
        }
      }
    }

    let editPermission: boolean | undefined;
    for (const [tool, enabled] of Object.entries(configuredTools ?? {})) {
      if (enabled === undefined) {
        continue;
      }
      if (typeof enabled !== 'boolean') {
        throw new Error(`OpenCode tools.${tool} must be a boolean`);
      }
      if (!tool.trim()) {
        throw new Error('OpenCode tool names must not be empty');
      }
      if (EDIT_TOOL_ALIASES.has(tool)) {
        if (editPermission !== undefined && editPermission !== enabled) {
          throw new Error(
            'OpenCode tools edit, write, patch, and apply_patch share one permission and cannot conflict',
          );
        }
        editPermission = enabled;
        continue;
      }
      entries.set(tool, enabled);
    }
    if (editPermission !== undefined) {
      entries.set('edit', editPermission);
    }

    return Object.fromEntries(entries);
  }

  private buildEffectiveToolsConfig(config: OpenCodeSDKConfig): OpenCodeToolConfig {
    const customAgent = config.agent ? undefined : config.custom_agent;
    const tools = new Map<string, boolean>();
    for (const [tool, enabled] of Object.entries(this.buildToolsConfig(config))) {
      if (enabled !== undefined) {
        tools.set(tool, enabled);
      }
    }
    for (const [tool, enabled] of Object.entries(
      this.buildToolsConfig({ ...config, tools: customAgent?.tools }, false),
    )) {
      if (enabled !== undefined) {
        tools.delete(tool);
        tools.set(tool, enabled);
      }
    }
    return Object.fromEntries(tools);
  }

  private buildConfiguredPermissionRules(config: OpenCodeSDKConfig): OpenCodePermissionRule[] {
    const customAgent = config.agent ? undefined : config.custom_agent;
    return [
      ...(convertPermissionConfigToRuleset(config.permission) ?? []),
      ...(convertPermissionConfigToRuleset(customAgent?.permission) ?? []),
    ];
  }

  private buildQuery(
    config: OpenCodeSDKConfig,
    workingDir: string | undefined,
  ): OpenCodeSessionQuery | undefined {
    const query: OpenCodeSessionQuery = {};

    if (config.working_dir && workingDir) {
      query.directory = workingDir;
    }
    if (config.workspace) {
      query.workspace = config.workspace;
    }

    return Object.keys(query).length > 0 ? query : undefined;
  }

  // Shared by buildSessionKey and the response cache key so they cannot drift.
  // Includes anything that changes which conversation history or model behavior
  // the server applies for a prompt.
  private historyAffectingInputs(config: OpenCodeSDKConfig): Record<string, unknown> {
    return {
      provider_id: config.provider_id,
      model: config.model,
      baseUrl: getCacheSafeOpenCodeBaseUrl(config.baseUrl),
      tools: this.buildToolsConfig(config),
      permission: config.permission,
      agent: config.agent,
      custom_agent: config.custom_agent,
      workspace: config.workspace,
      format: config.format,
      variant: config.variant,
      session_id: config.session_id,
      toolPolicyContractVersion: 2,
      parent_session_id: config.parent_session_id,
      credentialScope: this.getCredentialCacheScope(config),
      apiVersion: this.opencodeModule?.apiVersion,
    };
  }

  private buildSessionKey(config: OpenCodeSDKConfig, workingDir: string | undefined): string {
    return generateCacheKey('opencode:sdk:session', {
      ...this.historyAffectingInputs(config),
      workingDir: config.working_dir ? workingDir : undefined,
      mcp: config.mcp,
    });
  }

  private buildServerEnv(config: OpenCodeSDKConfig): Record<string, string> {
    const serverEnv: Record<string, string> = {};

    for (const [key, value] of Object.entries(getProcessEnv())) {
      if (value !== undefined) {
        serverEnv[key] = value;
      }
    }

    if (this.env) {
      for (const key of Object.keys(this.env).sort()) {
        const value = this.env[key];
        if (value !== undefined) {
          serverEnv[key] = value;
        }
      }
    }

    if (config.log_level === 'debug' || isDebugMode()) {
      serverEnv.DEBUG = serverEnv.DEBUG || 'opencode:*';
      logger.debug('[OpenCode SDK] Debug mode enabled, synced from promptfoo log level');
    }

    const homeDir = os.homedir();
    const opencodeBinPath = path.join(homeDir, '.opencode', 'bin');
    if (!serverEnv.PATH?.includes(opencodeBinPath)) {
      serverEnv.PATH = `${opencodeBinPath}:${serverEnv.PATH ?? ''}`;
      logger.debug(`Added ${opencodeBinPath} to PATH for OpenCode CLI`);
    }

    return serverEnv;
  }

  private buildServerConfig(config: OpenCodeSDKConfig): Record<string, unknown> {
    const serverConfig: Record<string, unknown> = {};

    if (config.log_level) {
      serverConfig.logLevel = config.log_level;
    }

    if (config.mcp && Object.keys(config.mcp).length > 0) {
      serverConfig.mcp = config.mcp;
      logger.debug(`[OpenCode SDK] Configuring MCP servers: ${Object.keys(config.mcp).join(', ')}`);
    }

    if (config.custom_agent) {
      serverConfig.agent = {
        custom: {
          description: config.custom_agent.description,
          model: config.custom_agent.model,
          temperature: config.custom_agent.temperature,
          top_p: config.custom_agent.top_p,
          tools:
            config.custom_agent.tools === undefined
              ? undefined
              : this.buildToolsConfig({ ...config, tools: config.custom_agent.tools }, false),
          permission: config.custom_agent.permission,
          prompt: config.custom_agent.prompt,
          mode: config.custom_agent.mode ?? 'primary',
          maxSteps: config.custom_agent.steps ?? config.custom_agent.maxSteps,
          color: config.custom_agent.color,
          disable: config.custom_agent.disable,
          hidden: config.custom_agent.hidden,
        },
      };
      logger.debug(`[OpenCode SDK] Configuring custom agent: ${config.custom_agent.description}`);
    }

    if (config.permission) {
      serverConfig.permission = config.permission;
      logger.debug('[OpenCode SDK] Configuring global permissions');
    }

    const toolsConfig = this.buildToolsConfig(config);
    if (toolsConfig) {
      serverConfig.tools = toolsConfig;
    }

    if (config.provider_id && config.apiKey) {
      serverConfig.provider = {
        [config.provider_id]: {
          options: {
            apiKey: config.apiKey,
          },
        },
      };
      logger.debug(`[OpenCode SDK] Injecting provider apiKey for ${config.provider_id}`);
    }

    return serverConfig;
  }

  private warnOnIgnoredBaseUrlConfig(config: OpenCodeSDKConfig): void {
    if (!config.baseUrl) {
      return;
    }

    const ignoredSettings = [
      config.hostname === undefined ? undefined : 'hostname',
      config.port === undefined ? undefined : 'port',
      config.timeout === undefined ? undefined : 'timeout',
      config.log_level === undefined ? undefined : 'log_level',
      config.mcp ? 'mcp' : undefined,
      config.custom_agent ? 'custom_agent' : undefined,
      config.apiKey ? 'apiKey' : undefined,
    ].filter(Boolean);

    if (ignoredSettings.length > 0) {
      logger.warn(
        `[OpenCode SDK] baseUrl uses an existing OpenCode server. These config keys are ignored unless that server is preconfigured: ${ignoredSettings.join(', ')}`,
      );
    }
  }

  private buildDeleteSessionParameters(session: OpenCodeSessionHandle): Record<string, unknown> {
    if (!this.opencodeModule) {
      throw new Error('OpenCode SDK module is not loaded');
    }

    if (this.opencodeModule.apiVersion === 'v2') {
      return {
        sessionID: session.id,
        ...session.query,
      };
    }

    return {
      path: getSessionPath(session.id),
      query: session.query,
    };
  }

  private async deleteSession(
    session: OpenCodeSessionHandle,
    client: OpenCodeClient | undefined,
  ): Promise<void> {
    if (!client?.session?.delete) {
      throw new Error('OpenCode SDK does not expose session deletion');
    }
    const result = await client.session.delete(this.buildDeleteSessionParameters(session));
    const envelope = asRecord(result);
    if (
      result === false ||
      envelope?.data === false ||
      envelope?.error ||
      asRecord(envelope?.response)?.ok === false
    ) {
      throw envelope?.error ?? new Error('OpenCode session deletion failed');
    }
  }

  private buildAbortSessionParameters(
    sessionId: string,
    sessionQuery: OpenCodeSessionQuery | undefined,
  ): Record<string, unknown> {
    return this.opencodeModule?.apiVersion === 'v2'
      ? { sessionID: sessionId, ...sessionQuery }
      : { path: getSessionPath(sessionId), query: sessionQuery };
  }

  /**
   * Remember a persistent session, most recently used last. Eviction only forgets the oldest
   * lookup: the session may still be running a queued call, and stays resumable by its ID.
   */
  private addSession(cacheKey: string, session: OpenCodeSessionHandle): void {
    this.sessions.delete(cacheKey);
    this.sessions.set(cacheKey, session);
    if (this.sessions.size > MAX_SESSIONS) {
      this.sessions.delete(this.sessions.keys().next().value!);
    }
  }

  private prepareCall(context?: CallApiContextParams): OpenCodePreparedCall {
    const config: OpenCodeSDKConfig = {
      ...this.config,
      ...context?.prompt?.config,
    };

    if (config.apiKey !== this.config.apiKey) {
      throw new Error(
        'OpenCode SDK apiKey is provider-level configuration and cannot be overridden per prompt',
      );
    }
    if (config.baseUrl !== this.config.baseUrl) {
      throw new Error(
        'OpenCode SDK baseUrl is provider-level configuration and cannot be overridden per prompt',
      );
    }

    if (config.workspace && !config.baseUrl && !config.working_dir) {
      throw new Error('OpenCode SDK workspace support requires either baseUrl or working_dir');
    }

    if (config.apiKey && !config.provider_id && !config.baseUrl) {
      logger.warn(
        '[OpenCode SDK] apiKey is set without provider_id. Prefer setting provider_id so promptfoo can wire the credential into the spawned OpenCode server.',
      );
    }

    this.warnOnIgnoredBaseUrlConfig(config);

    if (config.working_dir) {
      const workingDir =
        resolveAgenticWorkingDir(config.working_dir, cliState.basePath) ?? process.cwd();

      let stats: fs.Stats;
      try {
        stats = fs.statSync(workingDir);
      } catch (err: any) {
        throw new Error(
          `Working directory ${config.working_dir} (resolved to ${workingDir}) does not exist or isn't accessible: ${err.message}`,
        );
      }

      if (!stats.isDirectory()) {
        throw new Error(
          `Working directory ${config.working_dir} (resolved to ${workingDir}) is not a directory`,
        );
      }

      return {
        config,
        isTempDir: false,
        workingDir,
      };
    }

    return {
      config,
      isTempDir: true,
      workingDir: fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-opencode-sdk-')),
    };
  }

  private async ensureOpenCodeModule(): Promise<LoadedOpenCodeSDKModule> {
    if (!this.opencodeModule) {
      this.opencodeModule = await loadOpenCodeSDK();
    }
    return this.opencodeModule;
  }

  private async ensureClient(config: OpenCodeSDKConfig): Promise<void> {
    const opencodeModule = await this.ensureOpenCodeModule();

    this.validateSessionPolicyConfiguration(config);

    if (this.client) {
      return;
    }
    if (this.clientInitialization !== undefined) {
      return this.clientInitialization;
    }

    const { createOpencode, createOpencodeClient } = opencodeModule;
    let initialization: Promise<void>;
    initialization = (async () => {
      if (config.baseUrl) {
        this.client = createOpencodeClient({
          baseUrl: config.baseUrl,
        });
        this.clientConfig = config;
        return;
      }

      const serverOptions: {
        hostname: string;
        port: number;
        timeout: number;
        signal: AbortSignal;
        config?: Record<string, unknown>;
        env?: Record<string, string>;
      } = {
        hostname: config.hostname ?? '127.0.0.1',
        port: config.port ?? 0,
        timeout: config.timeout ?? 30000,
        signal: this.processTermination.signal,
        env: this.buildServerEnv(config),
      };

      const serverConfig = this.buildServerConfig(config);
      if (Object.keys(serverConfig).length > 0) {
        serverOptions.config = serverConfig;
      }

      const { signal } = serverOptions;
      signal.throwIfAborted();
      let onAbort!: () => void;
      const aborted = new Promise<never>((_, reject) => {
        onAbort = () => reject(signal.reason);
        signal.addEventListener('abort', onAbort, { once: true });
      });
      try {
        providerRegistry.register(this);
        const started = createOpencode(serverOptions).then((opencode) => {
          this.client = opencode.client;
          this.clientConfig = config;
          this.server = opencode.server;
          if (signal.aborted) {
            this.closeLocalServer();
            if (this.server) {
              this.processShutdown = undefined;
              providerRegistry.register(this);
            }
            signal.throwIfAborted();
          }
          logger.debug(`OpenCode server started at ${opencode.server.url}`);
        });
        await Promise.race([started, aborted]);
      } catch (error) {
        if (!this.server && !this.pendingTempDirs.size) {
          providerRegistry.unregister(this);
        }
        throw error;
      } finally {
        signal.removeEventListener('abort', onAbort);
      }
    })();
    this.clientInitialization = initialization;
    try {
      await initialization;
    } finally {
      if (this.clientInitialization === initialization) {
        this.clientInitialization = undefined;
      }
    }
  }

  private validateSessionPolicyConfiguration(config: OpenCodeSDKConfig): void {
    if (!this.opencodeModule) {
      return;
    }

    const hasPermissionRules = this.buildConfiguredPermissionRules(config).length > 0;
    if (this.opencodeModule.apiVersion === 'v2' && config.session_id && hasPermissionRules) {
      throw new Error(
        'OpenCode SDK v2 explicit session_id resumes cannot safely rebind permission rules; create a new session to change permission.',
      );
    }

    if (this.opencodeModule.apiVersion !== 'v1' || !hasPermissionRules) {
      return;
    }
    const staticPolicyMatches =
      JSON.stringify(this.buildEffectivePermissionRules(config)) ===
      JSON.stringify(this.buildEffectivePermissionRules(this.config));
    if (config.baseUrl || config.session_id || !staticPolicyMatches) {
      throw new Error(
        'OpenCode SDK v1 supports permission rules only for provider-level configuration on sessions started by Promptfoo; use tools for remote, resumed, or per-prompt policies.',
      );
    }
  }

  private async getOrCreateSession(
    config: OpenCodeSDKConfig,
    workingDir: string | undefined,
  ): Promise<OpenCodeSessionContext> {
    if (!this.client || !this.opencodeModule) {
      throw new Error('OpenCode SDK client is not initialized');
    }

    const sessionQuery = this.buildQuery(config, workingDir);
    if (config.session_id) {
      return {
        sessionId: config.session_id,
        sessionQuery,
      };
    }

    const sessionCacheKey = this.buildSessionKey(config, workingDir);
    const cachedSession = config.persist_sessions ? this.sessions.get(sessionCacheKey) : undefined;
    if (cachedSession) {
      this.addSession(sessionCacheKey, cachedSession);
      return { sessionId: cachedSession.id, sessionQuery };
    }

    const createResult = await this.client.session.create(
      this.buildCreateSessionParameters(config, sessionQuery),
    );
    const createData = unwrapOpenCodeResult(createResult);
    const sessionId =
      (createData as { id?: string } | undefined)?.id ??
      (createResult as { id?: string } | undefined)?.id;

    if (!sessionId) {
      throw new Error('Failed to get session ID from OpenCode SDK response');
    }

    const session = {
      id: sessionId,
      query: sessionQuery,
    };

    if (config.persist_sessions) {
      this.addSession(sessionCacheKey, session);
      return {
        sessionId,
        sessionQuery,
      };
    }

    return {
      sessionId,
      sessionQuery,
      ephemeralSession: session,
    };
  }

  private buildPromptBody(config: OpenCodeSDKConfig, prompt: string): Record<string, unknown> {
    if (!this.opencodeModule) {
      throw new Error('OpenCode SDK module is not loaded');
    }

    const promptBody: Record<string, unknown> = {
      parts: [{ type: 'text', text: prompt }],
    };

    if (config.provider_id || config.model) {
      promptBody.model = {
        providerID: config.provider_id ?? '',
        modelID: config.model ?? '',
      };
    }

    if (config.agent) {
      promptBody.agent = config.agent;
    } else if (config.custom_agent) {
      promptBody.agent = 'custom';
    }

    if (config.custom_agent?.prompt) {
      promptBody.system = config.custom_agent.prompt;
    }
    if (config.format) {
      promptBody.format = config.format;
    }
    if (config.variant) {
      promptBody.variant = config.variant;
    }
    // The prompt API atomically replaces boolean tool rules. V1 uses it for
    // every supported call; v2 uses it for explicit resumes because new v2
    // sessions receive the full permission ruleset when they are created.
    if (
      (this.opencodeModule.apiVersion === 'v1' || Boolean(config.session_id)) &&
      this.buildConfiguredPermissionRules(config).length === 0
    ) {
      promptBody.tools = this.buildEffectiveToolsConfig(config);
    }
    return promptBody;
  }

  private buildEffectivePermissionRules(config: OpenCodeSDKConfig): OpenCodePermissionRule[] {
    const customAgent = config.agent ? undefined : config.custom_agent;
    return [
      ...convertToolsConfigToRuleset(this.buildToolsConfig(config)),
      ...(convertPermissionConfigToRuleset(config.permission) ?? []),
      ...convertToolsConfigToRuleset(
        this.buildToolsConfig({ ...config, tools: customAgent?.tools }, false),
      ),
      ...(convertPermissionConfigToRuleset(customAgent?.permission) ?? []),
    ];
  }

  private buildCreateSessionParameters(
    config: OpenCodeSDKConfig,
    sessionQuery: OpenCodeSessionQuery | undefined,
  ): Record<string, unknown> {
    if (!this.opencodeModule) {
      throw new Error('OpenCode SDK module is not loaded');
    }

    const createBody: {
      title?: string;
      permission?: OpenCodePermissionRule[];
      parentID?: string;
    } = {
      title: `promptfoo-${Date.now()}`,
    };
    // OpenCode treats legacy `tools` as permission sugar, then merges explicit
    // permissions over it. Mirror that ordering in the v2 rule-array contract.
    if (this.opencodeModule.apiVersion === 'v2') {
      createBody.permission = this.buildEffectivePermissionRules(config);
    }

    // parentID is only honored by the v2 session.create body. v1 has no fork
    // primitive, so silently dropping it there keeps configs portable.
    if (config.parent_session_id && this.opencodeModule.apiVersion === 'v2') {
      createBody.parentID = config.parent_session_id;
    }

    if (this.opencodeModule.apiVersion === 'v2') {
      return {
        ...sessionQuery,
        ...createBody,
      };
    }

    return {
      body: createBody,
      query: sessionQuery,
    };
  }

  private buildPromptParameters(
    config: OpenCodeSDKConfig,
    prompt: string,
    sessionId: string,
    sessionQuery: OpenCodeSessionQuery | undefined,
  ): Record<string, unknown> {
    if (!this.opencodeModule) {
      throw new Error('OpenCode SDK module is not loaded');
    }

    const promptBody = this.buildPromptBody(config, prompt);
    if (this.opencodeModule.apiVersion === 'v2') {
      return {
        sessionID: sessionId,
        ...sessionQuery,
        ...promptBody,
      };
    }

    return {
      path: getSessionPath(sessionId),
      body: promptBody,
      query: sessionQuery,
    };
  }

  /**
   * Whether the skill tool can run for this config, so the session-history
   * round trip used for skill tracking can be skipped when it cannot.
   *
   * OpenCode permission rules are last-match-wins for each matching pattern.
   * Since the prospective skill name is unknown here, any non-deny rule means
   * a skill may run and its intermediate history must be inspected.
   */
  private isSkillToolEnabled(config: OpenCodeSDKConfig): boolean {
    const rules = this.buildEffectivePermissionRules(config);
    // OpenCode applies the last matching rule. We do not know which skill the model may invoke,
    // so walk backwards: a later non-deny rule may allow some skill, a wildcard deny overrides
    // every earlier rule, and a pattern-specific deny only blocks some names (e.g.
    // { '*': 'allow', 'blocked-skill': 'deny' } still allows other skills).
    for (let index = rules.length - 1; index >= 0; index--) {
      const { permission, pattern, action } = rules[index];
      if (permission !== 'skill' && permission !== '*') {
        continue;
      }
      if (action !== 'deny') {
        return true;
      }
      if (pattern === '*') {
        return false;
      }
    }
    return false;
  }

  /**
   * Fetches the session message history and returns only the parts that belong
   * to the current prompt, bounded by parentID (start) and assistantMessage.id
   * (end) to prevent skill calls from other prompts bleeding in.
   *
   * Returns an empty array — which makes the caller fall back to the
   * final-message parts — whenever the current prompt cannot be located in the
   * history (a start/end anchor is absent from the response or fetched page).
   * Over-attributing skill calls from earlier or concurrent prompts in a
   * shared session would be worse than missing intermediate-turn calls.
   */
  private async fetchCurrentPromptParts(
    client: OpenCodeClient,
    session: OpenCodeSessionContext,
    response: OpenCodeSdkResult<OpenCodePromptResponse>,
    abortSignal?: AbortSignal,
  ): Promise<OpenCodePromptPart[]> {
    const assistantMessage = unwrapOpenCodeResult(response)?.info;
    const parentId = assistantMessage?.parentID;
    const assistantId = assistantMessage?.id;
    if (!parentId || !assistantId) {
      logger.debug(
        '[OpenCode SDK] Assistant message is missing a history anchor; skipping session history fetch for skill tracking',
      );
      return [];
    }
    const messagesResult =
      this.opencodeModule?.apiVersion === 'v2'
        ? await client.session.messages(
            { sessionID: session.sessionId, ...session.sessionQuery },
            abortSignal ? { signal: abortSignal } : undefined,
          )
        : await client.session.messages({
            path: getSessionPath(session.sessionId),
            query: session.sessionQuery,
            ...(abortSignal ? { signal: abortSignal } : {}),
          });
    const messages = unwrapOpenCodeResult(messagesResult) ?? [];
    // Bound the slice with both a start anchor (parentID → user message that
    // triggered this prompt) and an end anchor (assistantMessage.id → the
    // response we just received). Without the end anchor, messages from a
    // concurrent prompt on the same shared session could be included and
    // cause skill-used to pass for the wrong evaluation row.
    const startIndex = messages.findIndex((m) => m.info?.id === parentId);
    // The anchors are server-controlled, so they go through the same redaction as errors.
    const redactId = (id: string) =>
      this.withholdMcpDiagnostics || id.length > 4_096
        ? '[REDACTED]'
        : redactDiagnosticText(id, this.knownCredentials);
    if (startIndex === -1) {
      logger.debug(
        `[OpenCode SDK] Parent message ${redactId(parentId)} not found in ${messages.length} fetched messages; falling back to final-message parts for skill tracking`,
      );
      return [];
    }
    const endIndex = messages.findIndex((m) => m.info?.id === assistantId);
    if (endIndex < startIndex) {
      logger.debug(
        `[OpenCode SDK] Assistant message ${redactId(assistantId)} not found after its parent in ${messages.length} fetched messages; falling back to final-message parts for skill tracking`,
      );
      return [];
    }
    const relevantMessages = messages.slice(startIndex, endIndex + 1);
    logger.debug(
      `[OpenCode SDK] Fetched ${messages.length} messages, using ${relevantMessages.length} (start=${startIndex} end=${endIndex}) for skill tracking`,
    );
    return relevantMessages.flatMap((m) => m.parts ?? []);
  }

  private getSessionQueueKey(
    config: OpenCodeSDKConfig,
    workingDir: string | undefined,
  ): string | undefined {
    if (config.session_id) {
      return generateCacheKey('opencode:sdk:explicit-session', { sessionId: config.session_id });
    }
    return config.persist_sessions ? this.buildSessionKey(config, workingDir) : undefined;
  }

  private async runSerializedSessionCall<T>(
    queueKey: string | undefined,
    abortSignal: AbortSignal | undefined,
    run: () => Promise<T>,
  ): Promise<T> {
    if (!queueKey) {
      return run();
    }

    const previous = this.sessionQueues.get(queueKey) ?? Promise.resolve();
    let release: () => void = () => {};
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queued = previous.catch(() => undefined).then(() => current);
    this.sessionQueues.set(queueKey, queued);
    void queued.finally(() => {
      if (this.sessionQueues.get(queueKey) === queued) {
        this.sessionQueues.delete(queueKey);
      }
    });

    try {
      await this.waitForPreviousSessionCall(previous, abortSignal);
      return await run();
    } finally {
      release();
    }
  }

  private async waitForPreviousSessionCall(
    previous: Promise<void>,
    abortSignal: AbortSignal | undefined,
  ): Promise<void> {
    const previousDone = previous.catch(() => undefined);
    if (!abortSignal) {
      await previousDone;
      return;
    }
    if (abortSignal.aborted) {
      const error = new Error('OpenCode SDK session wait aborted');
      error.name = 'AbortError';
      throw error;
    }

    let onAbort: (() => void) | undefined;
    const abortPromise = new Promise<void>((_, reject) => {
      onAbort = () => {
        const error = new Error('OpenCode SDK session wait aborted');
        error.name = 'AbortError';
        reject(error);
      };
      abortSignal.addEventListener('abort', onAbort, { once: true });
    });
    try {
      await Promise.race([previousDone, abortPromise]);
    } finally {
      if (onAbort) {
        abortSignal.removeEventListener('abort', onAbort);
      }
    }
  }

  private buildProviderResponse(
    config: OpenCodeSDKConfig,
    response: OpenCodeSdkResult<OpenCodePromptResponse>,
    sessionId: string,
    allSessionParts: OpenCodePromptPart[],
  ): ProviderResponse {
    const responseData = unwrapOpenCodeResult(response);
    const assistantMessage = responseData?.info;
    const parts = responseData?.parts ?? [];

    let output = '';
    for (const part of parts) {
      if (part.type === 'text' && part.text) {
        output += (output ? '\n' : '') + part.text;
      }
    }

    if (config.format?.type === 'json_schema') {
      if (assistantMessage?.structured === undefined) {
        output = normalizeStructuredText(output) ?? output;
      } else {
        output = JSON.stringify(assistantMessage.structured);
      }
    }

    const tokens = assistantMessage?.tokens;
    // Prefer full session history when available so skill calls from intermediate
    // turns are captured. OpenCode is multi-turn: the skill tool is typically
    // invoked before the final response, so its tool part is absent from `parts`.
    const skillCalls = this.deriveSkillCalls(allSessionParts.length > 0 ? allSessionParts : parts);

    return {
      output,
      tokenUsage: buildOpenCodeTokenUsage(tokens),
      ...(assistantMessage?.cost === undefined ? {} : { cost: assistantMessage.cost }),
      raw: JSON.stringify(response),
      sessionId,
      ...(skillCalls.length === 0 ? {} : { metadata: { skillCalls } }),
    };
  }

  private deriveSkillCalls(parts: OpenCodePromptPart[]): SkillCallEntry[] {
    return parts.flatMap((part) => {
      if (part.type !== 'tool' || part.tool !== 'skill') {
        return [];
      }

      const skillName =
        typeof part.state?.input?.name === 'string' ? part.state.input.name.trim() : '';
      if (!skillName) {
        return [];
      }

      const skillDir =
        typeof part.state?.metadata?.dir === 'string' ? part.state.metadata.dir.trim() : '';

      return [
        {
          name: skillName,
          input: part.state?.input,
          ...(skillDir ? { path: path.join(skillDir, 'SKILL.md') } : {}),
          source: 'tool',
          ...(part.state?.status === 'error' ? { is_error: true } : {}),
        },
      ];
    });
  }

  /**
   * Grade an assistant content-filter failure as a refusal. Filtered text, structured output,
   * and tool metadata stay private.
   */
  private buildRefusalResponse(
    response: OpenCodeSdkResult<OpenCodePromptResponse>,
    sessionId: string,
  ): ProviderResponse {
    return {
      output: 'I cannot assist with this request because it was blocked by a content filter.',
      isRefusal: true,
      guardrails: { flagged: true, flaggedOutput: true },
      ...getOpenCodeAccounting(unwrapOpenCodeResult(response)?.info),
      sessionId,
    };
  }

  private buildPromptErrorResponse(
    config: OpenCodeSDKConfig,
    response: OpenCodeSdkResult<OpenCodePromptResponse>,
    { error, status, headers, assistant }: OpenCodePromptError,
    sessionId: string,
  ): ProviderResponse {
    return {
      ...this.handleCallError(error, config, undefined, { status, headers }),
      // An assistant failure still used (and billed) the session.
      ...(assistant
        ? { ...getOpenCodeAccounting(unwrapOpenCodeResult(response)?.info), sessionId }
        : {}),
    };
  }

  private handleCallError(
    error: unknown,
    config: OpenCodeSDKConfig,
    callOptions?: CallApiOptionsParams,
    promptError?: { status?: number; headers?: unknown },
  ): ProviderResponse {
    const isAbort =
      !promptError &&
      ((error instanceof Error && error.name === 'AbortError') ||
        callOptions?.abortSignal?.aborted);

    if (isAbort) {
      logger.warn('OpenCode SDK call aborted');
      return { error: 'OpenCode SDK call aborted' };
    }

    if (
      !promptError &&
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT' &&
      'message' in error &&
      typeof error.message === 'string' &&
      error.message.includes('opencode')
    ) {
      const cliError = dedent`The OpenCode CLI is required but not installed.

        The OpenCode SDK requires the 'opencode' CLI to be installed and available in your PATH.

        Install it with:
          curl -fsSL https://opencode.ai/install | bash

        Or see: https://opencode.ai for other installation methods.`;
      logger.error(cliError);
      return { error: cliError };
    }

    const details = parseOpenCodeError(error, promptError?.status);
    const description = this.formatCallError(error, config, promptError?.status);
    const errorMessage = promptError ? `OpenCode SDK prompt error: ${description}` : description;
    const rateLimit = getOpenCodeRateLimit(error, details, promptError?.headers);
    logger.error('Error calling OpenCode SDK', { error: errorMessage });
    return {
      error: `Error calling OpenCode SDK: ${errorMessage}`,
      ...(rateLimit
        ? { metadata: getOpenCodeRateLimitMetadata(rateLimit) }
        : details.status === undefined
          ? {}
          : { metadata: { http: { status: details.status } } }),
    };
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    if (this.processTermination.signal.aborted) {
      return { error: 'OpenCode SDK call aborted before it started' };
    }
    const { config, isTempDir, workingDir } = this.prepareCall(context);
    // A server started by this call keeps its configuration after later calls replace it.
    this.rememberCredentials(config);
    const remoteStateful = Boolean(
      config.baseUrl && (config.session_id || config.persist_sessions),
    );
    if (remoteStateful) {
      this.activeRemoteCalls++;
      providerRegistry.register(this);
    }
    let ephemeralSession: OpenCodeSessionHandle | undefined;
    let sessionClient: OpenCodeClient | undefined;
    let abortListener: (() => void) | undefined;
    let releaseRemoteSession: (() => void) | undefined;

    try {
      this.buildEffectivePermissionRules(config);
      await this.ensureOpenCodeModule();
      this.validateSessionPolicyConfiguration(config);

      if (config.enable_streaming && !this.streamingWarningEmitted) {
        this.streamingWarningEmitted = true;
        logger.warn(
          '[OpenCode SDK] enable_streaming is currently a no-op for this provider; the prompt will run to completion before returning.',
        );
      }

      const mcpConfig = config.mcp && Object.keys(config.mcp).length > 0 ? config.mcp : undefined;
      const statefulSession = Boolean(config.session_id || config.persist_sessions);
      const hasPermissionRules = this.buildConfiguredPermissionRules(config).length > 0;
      const sensitiveMcpConfig = openCodeMcpContainsCacheSensitiveData(mcpConfig);
      const sensitiveBaseUrl = openCodeBaseUrlContainsCacheSensitiveData(config.baseUrl);
      const cacheResult =
        statefulSession || hasPermissionRules || sensitiveMcpConfig || sensitiveBaseUrl
          ? { shouldCache: false, shouldReadCache: false, shouldWriteCache: false }
          : await initializeAgenticCache(
              {
                // The unversioned cache can contain assistant errors or filtered text as successes.
                cacheKeyPrefix: 'opencode:sdk:response:v2',
                workingDir: config.working_dir ? workingDir : undefined,
                bustCache: context?.bustCache,
                mcp: mcpConfig,
                cacheMcp: config.cache_mcp,
              },
              {
                prompt,
                ...this.historyAffectingInputs(config),
              },
            );

      const cachedResponse = await getCachedResponse(cacheResult, 'OpenCode SDK');
      if (cachedResponse) {
        return cachedResponse;
      }

      if (callOptions?.abortSignal?.aborted || this.processTermination.signal.aborted) {
        return { error: 'OpenCode SDK call aborted before it started' };
      }

      await this.ensureClient(config);
      const sessionQueueKey = this.getSessionQueueKey(config, workingDir);
      return await this.runSerializedSessionCall(
        sessionQueueKey,
        callOptions?.abortSignal,
        async () => {
          // The session belongs to this client even if a concurrent shutdown replaces it.
          const client = this.client;
          sessionClient = client;
          const session = await this.getOrCreateSession(config, workingDir);
          ephemeralSession = session.ephemeralSession;
          if (callOptions?.abortSignal?.aborted || this.processTermination.signal.aborted) {
            return { error: 'OpenCode SDK call aborted before it started' };
          }

          const promptOptions = this.buildPromptParameters(
            config,
            prompt,
            session.sessionId,
            session.sessionQuery,
          );
          logger.debug(`OpenCode SDK prompt options:`, promptOptions);

          if (!client) {
            throw new Error('OpenCode SDK client is not initialized');
          }

          // If the caller's abortSignal fires mid-prompt, ask the server to stop rather than
          // letting it run to completion while we discard the result. The prompt itself is
          // awaited, so a queued call cannot reuse the session while it is still running.
          const abortSignal = callOptions?.abortSignal;
          const cancellation = this.setupSessionCancellation(
            client,
            session,
            config,
            abortSignal,
            remoteStateful,
          );
          abortListener = cancellation.listener;
          releaseRemoteSession = cancellation.releaseRemote;

          const processSignal = this.processTermination.signal;
          const response = remoteStateful
            ? await (this.opencodeModule?.apiVersion === 'v2'
                ? client.session.prompt(promptOptions, { signal: processSignal })
                : client.session.prompt({ ...promptOptions, signal: processSignal }))
            : await client.session.prompt(promptOptions);
          // The prompt has returned, so an abort from here on must not ask the
          // server to kill the session it already answered.
          if (abortListener && abortSignal) {
            abortSignal.removeEventListener('abort', abortListener);
            abortListener = undefined;
          }

          if (abortSignal?.aborted || processSignal.aborted) {
            return { error: 'OpenCode SDK call aborted' };
          }
          const promptError = getOpenCodePromptError(response);
          if (promptError) {
            return isOpenCodeContentFilterRefusal(promptError)
              ? this.buildRefusalResponse(response, session.sessionId)
              : this.buildPromptErrorResponse(config, response, promptError, session.sessionId);
          }
          logger.debug('OpenCode SDK response received');

          // Fetch only the parts that belong to the current prompt from the session
          // history so that deriveSkillCalls captures skill calls from intermediate
          // turns. Gated on the effective tool policy, so the extra round trip is
          // skipped whenever the skill tool is denied and no skill parts can exist.
          let allSessionParts: OpenCodePromptPart[] = [];
          if (this.isSkillToolEnabled(config)) {
            try {
              allSessionParts = await this.fetchCurrentPromptParts(
                client,
                session,
                response,
                abortSignal,
              );
            } catch (error) {
              logger.debug('[OpenCode SDK] Could not fetch session history for skill tracking', {
                error: this.formatCallError(error, config),
              });
            }
            if (abortSignal?.aborted) {
              return { error: 'OpenCode SDK call aborted' };
            }
          }

          const providerResponse = this.buildProviderResponse(
            config,
            response,
            session.sessionId,
            allSessionParts,
          );
          await cacheResponse(cacheResult, providerResponse, 'OpenCode SDK');
          logger.debug(`OpenCode SDK response: ${providerResponse.output.slice(0, 100)}...`);
          return providerResponse;
        },
      );
    } catch (error) {
      return this.handleCallError(error, config, callOptions);
    } finally {
      if (abortListener && callOptions?.abortSignal) {
        callOptions.abortSignal.removeEventListener('abort', abortListener);
      }
      releaseRemoteSession?.();
      if (ephemeralSession) {
        try {
          await this.deleteSession(ephemeralSession, sessionClient);
        } catch (err) {
          logger.debug(`Failed to delete non-persistent session ${ephemeralSession.id}`, {
            error: this.formatCallError(err, config),
          });
        }
      }

      // Clean up temp directory without masking the call result on cleanup failure.
      if (isTempDir && workingDir) {
        await this.removeTempDir(workingDir);
      }
      if (remoteStateful && --this.activeRemoteCalls === 0) {
        this.updateRegistry();
      }
    }
  }
}
