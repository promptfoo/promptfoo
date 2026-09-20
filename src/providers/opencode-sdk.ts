import { createRequire } from 'node:module';
import fs from 'fs';
import fsPromises from 'fs/promises';
import os from 'os';
import path from 'path';

import dedent from 'dedent';
import cliState from '../cliState';
import { getEnvString } from '../envars';
import { importModule } from '../esm';
import logger, { getLogLevel } from '../logger';
import { rateLimitTimingFromHeaders } from '../util/fetch';
import {
  extractRateLimitErrorType,
  HttpRateLimitError,
  isDefinitiveBillingCode,
  isHardQuotaCode,
  isTransientRateLimitCode,
} from '../util/fetch/errors';
import { REDACTED } from '../util/sanitizer';
import { escapeRegExp } from '../util/text';
import {
  cacheResponse,
  generateCacheKey,
  getCachedResponse,
  initializeAgenticCache,
  resolveAgenticWorkingDir,
} from './agentic-utils';
import { providerRegistry } from './providerRegistry';

import type { EnvOverrides } from '../types/env';
import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
  SkillCallEntry,
} from '../types/index';
import type { ProviderShutdownReason } from './providerRegistry';

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
const SESSION_SHUTDOWN_TIMEOUT_MS = 1_000;

/**
 * OpenCode SDK client interface
 */
interface OpenCodeClient {
  session: {
    create: (
      parameters: Record<string, unknown>,
      options?: Record<string, unknown>,
    ) => Promise<OpenCodeSdkResult<Record<string, unknown>>>;
    prompt: (
      parameters: Record<string, unknown>,
      options?: Record<string, unknown>,
    ) => Promise<OpenCodeSdkResult<OpenCodePromptResponse>>;
    messages: (
      parameters: Record<string, unknown>,
      options?: Record<string, unknown>,
    ) => Promise<OpenCodeSdkResult<OpenCodeSessionMessage[]>>;
    delete: (
      parameters: Record<string, unknown>,
      options?: Record<string, unknown>,
    ) => Promise<unknown>;
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

function getOpenCodePromptError(
  response: OpenCodeSdkResult<OpenCodePromptResponse>,
): OpenCodePromptError | undefined {
  if (response && typeof response === 'object' && 'error' in response && response.error != null) {
    return {
      error: response.error,
      status: response.response?.status,
      headers: response.response?.headers,
    };
  }
  const error = unwrapOpenCodeResult(response)?.info?.error;
  return error == null ? undefined : { error, assistant: true };
}

function isOpenCodeContentFilterRefusal(promptError: OpenCodePromptError | undefined): boolean {
  if (!promptError?.assistant || !promptError.error || typeof promptError.error !== 'object') {
    return false;
  }
  const item = promptError.error as Record<string, unknown>;
  return (typeof item.name === 'string' ? item.name : item._tag) === 'ContentFilterError';
}

function describeOpenCodeError(
  error: unknown,
  fallbackStatus?: number,
  withholdUntrustedMessage = false,
): string {
  const withheld =
    'Upstream diagnostic withheld because a local MCP command may contain credentials';
  const formatStatus = (status: unknown) =>
    typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599
      ? 'HTTP ' + status
      : undefined;
  if (typeof error === 'string' && error.trim()) {
    return [formatStatus(fallbackStatus), withholdUntrustedMessage ? withheld : error]
      .filter(Boolean)
      .join(': ');
  }
  if (!error || typeof error !== 'object') {
    return formatStatus(fallbackStatus) || 'Unknown OpenCode error';
  }
  const item = error as Record<string, unknown>;
  const data =
    item.data && typeof item.data === 'object' ? (item.data as Record<string, unknown>) : undefined;
  const message = typeof item.message === 'string' ? item.message : data?.message;
  const candidateName = typeof item.name === 'string' ? item.name : item._tag;
  const name =
    typeof candidateName === 'string' &&
    [
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
    ].includes(candidateName)
      ? candidateName
      : undefined;
  const safeStatus =
    formatStatus(item.statusCode) || formatStatus(data?.statusCode) || formatStatus(fallbackStatus);
  return (
    [
      name,
      safeStatus,
      typeof message === 'string' && message.trim()
        ? withholdUntrustedMessage
          ? withheld
          : message
        : undefined,
    ]
      .filter(Boolean)
      .join(': ') || 'Unknown OpenCode error'
  );
}

function openCodeCredentialPattern(credential: string): string {
  const caseInsensitiveHex = (hex: string) =>
    hex.replace(/[a-f]/gi, (letter) => `[${letter.toLowerCase()}${letter.toUpperCase()}]`);
  const caseInsensitiveWord = (word: string) =>
    word.replace(/[a-z]/gi, (letter) => `[${letter.toLowerCase()}${letter.toUpperCase()}]`);
  return credential
    .split(/(%(?:25)*[0-9a-f]{2}|\\u[0-9a-f]{4}|&(?:#(?:x[0-9a-f]+|\d+)|amp|lt|gt|quot|apos);)/i)
    .map((part) => {
      if (/^%(?:25)*[0-9a-f]{2}$/i.test(part)) {
        return caseInsensitiveHex(part);
      }
      if (/^\\u[0-9a-f]{4}$/i.test(part)) {
        return '\\\\[uU]' + caseInsensitiveHex(part.slice(2));
      }
      if (/^&#x[0-9a-f]+;$/i.test(part)) {
        const digits = part.slice(3, -1).replace(/^0+(?=.)/, '');
        return '&#[xX]0*' + caseInsensitiveHex(digits) + ';';
      }
      if (/^&#\d+;$/.test(part)) {
        const digits = part.slice(2, -1).replace(/^0+(?=.)/, '');
        return '&#0*' + digits + ';';
      }
      if (/^&(?:amp|lt|gt|quot|apos);$/i.test(part)) {
        return '&' + caseInsensitiveWord(part.slice(1, -1)) + ';';
      }
      return escapeRegExp(part);
    })
    .join('');
}

function addOpenCodeCredentialEncodings(value: string, credentials: Set<string>): void {
  const representations = new Set([value]);
  const formEncode = (part: string) => new URLSearchParams([['', part]]).toString().slice(1);
  try {
    const encoded = encodeURIComponent(value);
    representations.add(encoded);
    representations.add(encodeURIComponent(encoded));
  } catch {
    // JSON can represent lone surrogates that URI encoding rejects; raw values stay covered too.
  }
  const formEncoded = formEncode(value);
  representations.add(formEncoded);
  representations.add(formEncode(formEncoded));
  const asUnicodeEscape = (character: string) =>
    '\\u' + character.charCodeAt(0).toString(16).padStart(4, '0');
  const htmlNamed: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  const addHtmlEncodings = (representation: string) => {
    const htmlCharacters = /[&<>"']/g;
    for (const apostrophe of ['&#39;', '&#x27;', '&apos;']) {
      representations.add(
        representation.replace(htmlCharacters, (character) =>
          character === "'" ? apostrophe : htmlNamed[character],
        ),
      );
    }
    representations.add(
      representation.replace(htmlCharacters, (character) => '&#' + character.charCodeAt(0) + ';'),
    );
    representations.add(
      representation.replace(
        htmlCharacters,
        (character) => '&#x' + character.charCodeAt(0).toString(16) + ';',
      ),
    );
  };
  for (let depth = 0; depth < 2; depth++) {
    for (const representation of [...representations]) {
      const json = JSON.stringify(representation).slice(1, -1);
      representations.add(json);
      representations.add(json.replace(/\//g, '\\/'));
      const scriptSafe = json.replace(/<\//g, '<\\/');
      representations.add(scriptSafe);
      representations.add(scriptSafe.replace(/[\u2028\u2029]/g, asUnicodeEscape));
      representations.add(json.replace(/[\u2028\u2029]/g, asUnicodeEscape));
      // HTML-safe JSON encoders such as Go's escape only these characters, leaving normal
      // accented characters and unrelated slashes untouched.
      representations.add(json.replace(/[<>&\u2028\u2029]/g, asUnicodeEscape));
      addHtmlEncodings(representation);
      addHtmlEncodings(json);
      representations.add(
        representation.replace(/["\\\u0000-\u001f\u007f-\uffff]/g, asUnicodeEscape),
      );
      representations.add(
        representation.replace(/["\\/\u0000-\u001f\u007f-\uffff]/g, asUnicodeEscape),
      );
    }
  }
  for (const representation of representations) {
    credentials.add(representation);
  }
}

function redactOpenCodeError(
  message: string,
  credentials: readonly string[],
  unboundedCredentials: ReadonlySet<string>,
): string {
  let result = message;
  for (const credential of credentials) {
    const unbounded = credential.length >= 8 || unboundedCredentials.has(credential);
    if (
      unbounded &&
      !/%|\\u[0-9a-f]{4}|&(?:#(?:x[0-9a-f]+|\d+)|amp|lt|gt|quot|apos);/i.test(credential)
    ) {
      result = result.split(credential).join(REDACTED);
      continue;
    }
    const pattern = openCodeCredentialPattern(credential);
    result = result.replace(
      new RegExp(unbounded ? pattern : '(?<![\\w.~+-])' + pattern + '(?![\\w.~+=-])', 'g'),
      REDACTED,
    );
  }
  return result
    .replace(
      /((?:["']?)(?:api[_ -]?key|access[_ -]?token|refresh[_ -]?token|client[_ -]?secret|pass(?:word|wd|phrase)|pwd|sign(?:ature|ing[_ -]?key)|authorization)(?:["']?)\s*[:=]\s*["']?)(?:(?:Bearer|Basic)\s+)?[^\s,"';&}]+/gi,
      (_match, prefix: string) => prefix + REDACTED,
    )
    .replace(
      /\b(Bearer|Basic)\s+[\w.~+/=-]+/gi,
      (_match, scheme: string) => scheme + ' ' + REDACTED,
    )
    .replace(/\bsk-[\w-]{12,}/gi, REDACTED)
    .replace(/[\r\n]+/g, ' ')
    .slice(0, 500);
}

function addOpenCodeUrlPathCredentials(
  pathname: string,
  remember: (value: string) => void,
): boolean {
  let hasPrivatePath = false;
  for (const segment of pathname.split('/')) {
    // Endpoint words carry useful diagnostic context; other configured path components may
    // be tenant-specific IDs or opaque authentication tokens, even without a query string.
    if (
      !segment ||
      /^(?:api|connect|events|healthz?|http|https|mcp|openapi|prompts|ready|resources|sessions?|sse|stream|tools|v\d+(?:\.\d+)*|webhook)$/i.test(
        segment,
      )
    ) {
      continue;
    }
    hasPrivatePath = true;
    remember(segment);
    for (const field of segment.split(';')) {
      const equals = field.indexOf('=');
      if (equals !== -1) {
        remember(field.slice(equals + 1));
      }
    }
  }
  return hasPrivatePath;
}

function addOpenCodeUrlCredentials(url: unknown, remember: (value: unknown) => void) {
  if (typeof url !== 'string' || !url) {
    return;
  }
  const rememberEncoded = (value: string, formEncoded = false) => {
    remember(value);
    try {
      remember(decodeURIComponent(formEncoded ? value.replace(/\+/g, ' ') : value));
    } catch {
      // The raw value is still covered when the URL contains malformed encoding.
    }
  };
  const rememberParameters = (value: string) => {
    for (const parameter of value.split(/[&;]/)) {
      const equals = parameter.indexOf('=');
      if (equals !== -1) {
        rememberEncoded(parameter.slice(equals + 1), true);
      }
    }
  };
  const fragmentStart = url.indexOf('#');
  const fragment = fragmentStart === -1 ? '' : url.slice(fragmentStart + 1);
  try {
    const parsed = new URL(url);
    rememberEncoded(parsed.username);
    rememberEncoded(parsed.password);
    parsed.searchParams.forEach((value) => remember(value));
    const privatePath = addOpenCodeUrlPathCredentials(parsed.pathname, rememberEncoded);
    const hash = parsed.hash.slice(1);
    if (hash.includes('=')) {
      new URLSearchParams(hash).forEach((value) => remember(value));
    }
    if (parsed.username || parsed.password || parsed.search || privatePath || hash.includes('=')) {
      remember(url);
    }
  } catch {
    // Collect raw userinfo and query fields even if OpenCode rejects the malformed URL.
    const userInfo = url.match(/^(?:[a-z][\w+.-]*:\/\/)?([^/?#]*)@/i)?.[1];
    for (const value of userInfo?.split(':') ?? []) {
      rememberEncoded(value);
    }
    const path = url.match(/^[a-z][\w+.-]*:\/\/[^/?#]*(\/[^?#]*)/i)?.[1];
    const privatePath = path && addOpenCodeUrlPathCredentials(path, rememberEncoded);
    if (userInfo || url.includes('?') || privatePath || fragment.includes('=')) {
      remember(url);
    }
  }
  const queryStart = url.indexOf('?');
  if (queryStart !== -1 && (fragmentStart === -1 || queryStart < fragmentStart)) {
    rememberParameters(url.slice(queryStart + 1, fragmentStart === -1 ? undefined : fragmentStart));
  }
  if (fragment.includes('=')) {
    rememberParameters(fragment);
  }
}

function addOpenCodeHeaderCredentials(value: unknown, remember: (value: unknown) => void) {
  if (typeof value !== 'string') {
    return;
  }
  remember(value);
  const scheme = value.match(/^\s*([a-z][\w+.-]*)\s+([^\s,;]+)\s*$/i);
  if (scheme) {
    const [, name, credential] = scheme;
    remember(credential);
    if (name.toLowerCase() === 'basic' && /^[A-Za-z0-9+/]+={0,2}$/.test(credential)) {
      const decoded = Buffer.from(credential, 'base64').toString('utf8');
      remember(decoded);
      const separator = decoded.indexOf(':');
      if (separator !== -1) {
        remember(decoded.slice(0, separator));
        remember(decoded.slice(separator + 1));
      }
    }
  }
  for (const field of value.matchAll(
    /(?:^|[;,\s])[\w.-]+\s*=\s*(?:"([^"]*)"|'([^']*)'|([^;,\s]+))/g,
  )) {
    remember(field[1] ?? field[2] ?? field[3]);
  }
}

const OPEN_CODE_CREDENTIAL_NAME =
  /api.?key|access.?key|private.?key|client.?key|token|secret|pass(?:word|wd|phrase)|(?:^|[_-])pwd(?:$|[_-])|sign(?:ature|ing.?key)|(?:^|[_-])sig(?:$|[_-])|authorization|credential|cookie/i;

function addOpenCodeEnvironmentValue(
  key: string,
  value: unknown,
  remember: (value: unknown) => void,
  includeRaw = false,
) {
  if (includeRaw || OPEN_CODE_CREDENTIAL_NAME.test(key)) {
    remember(value);
  }
  if (typeof value !== 'string') {
    return;
  }
  if (
    /authorization|cookie|header|auth$|connection|dsn/i.test(key) ||
    /^\s*(?:Bearer|Basic|Token|API[-_]?Key|OAuth|DPoP|Negotiate)\s+\S/i.test(value)
  ) {
    addOpenCodeHeaderCredentials(value, remember);
  }
  if (/url|uri|dsn|proxy|connection/i.test(key) || /^[a-z][\w+.-]*:\/\//i.test(value)) {
    addOpenCodeUrlCredentials(value, remember);
  }
}

function addOpenCodeConfigCredentials(
  config: OpenCodeSDKConfig,
  remember: (value: unknown) => void,
) {
  if (!config || typeof config !== 'object') {
    return;
  }
  remember(config.apiKey);
  addOpenCodeUrlCredentials(config.baseUrl, remember);
  const servers = config.mcp;
  if (!servers || typeof servers !== 'object' || Array.isArray(servers)) {
    return;
  }
  for (const server of Object.values(servers)) {
    addOpenCodeServerCredentials(server, remember);
  }
}

function addStrongOpenCodeUrlCredentials(
  url: unknown,
  remember: (value: unknown) => void,
  includePrivatePath = true,
): void {
  if (typeof url !== 'string' || !url) {
    return;
  }
  const rememberEncoded = (value: string, form = false) => {
    remember(value);
    try {
      remember(decodeURIComponent(form ? value.replace(/\+/g, ' ') : value));
    } catch {
      // Raw values are still covered when the URL is malformed.
    }
  };
  const oraclePassword = url.match(
    /^jdbc:oracle:(?:thin|oci(?:8)?):[^/@]+\/(?:(?:"((?:""|[^"])*)")|([^@]*))@/i,
  );
  if (oraclePassword) {
    const password = oraclePassword[1] ?? oraclePassword[2];
    rememberEncoded(password);
    if (oraclePassword[1] !== undefined) {
      rememberEncoded(password.replace(/""/g, '"'));
    }
  }
  const connectionUrl = url.replace(/^jdbc:/i, '');
  try {
    const parsed = new URL(connectionUrl);
    rememberEncoded(parsed.password);
    if (includePrivatePath) {
      addOpenCodeUrlPathCredentials(parsed.pathname, rememberEncoded);
    }
  } catch {
    const password = connectionUrl.match(/^[a-z][\w+.-]*:\/\/[^/?#@:]*:([^/?#@]*)@/i)?.[1];
    if (password) {
      rememberEncoded(password);
    }
  }
  for (const section of url.split(/[?#]/).slice(1)) {
    for (const parameter of section.split(/[&;]/)) {
      const equals = parameter.indexOf('=');
      if (equals === -1) {
        continue;
      }
      let key = parameter.slice(0, equals);
      try {
        key = decodeURIComponent(key);
      } catch {
        // Checking the raw parameter name is still useful for malformed URLs.
      }
      if (OPEN_CODE_CREDENTIAL_NAME.test(key) || /^(?:opaque|session(?:id)?|code)$/i.test(key)) {
        rememberEncoded(parameter.slice(equals + 1), true);
      }
    }
  }
}

function addStrongOpenCodeEnvironmentCredentials(
  key: string,
  value: unknown,
  remember: (value: unknown) => void,
  includePrivateUrlPath = false,
): void {
  if (OPEN_CODE_CREDENTIAL_NAME.test(key)) {
    addOpenCodeEnvironmentValue(key, value, remember, true);
  }
  if (typeof value !== 'string') {
    return;
  }
  if (/url|uri|dsn|proxy|connection/i.test(key) || /^(?:jdbc:|[a-z][\w+.-]*:\/\/)/i.test(value)) {
    addStrongOpenCodeUrlCredentials(value, remember, includePrivateUrlPath);
  }
  const authorization = value.match(/^\s*(?:proxy-)?authorization\s*:\s*(.+)$/i)?.[1];
  if (authorization) {
    addOpenCodeHeaderCredentials(authorization, remember);
  }
  if (/dsn|connection/i.test(key) || /(?:^|[;,\s])[\w.-]+\s*=/.test(value)) {
    for (const field of value.matchAll(
      /(?:^|[;,\s])([\w.-]+)\s*=\s*(?:"((?:""|[^"])*)"|'((?:''|[^'])*)'|\{((?:}}|[^}])*)\}|([^;,\s]+))/g,
    )) {
      if (OPEN_CODE_CREDENTIAL_NAME.test(field[1])) {
        const credential = field[2] ?? field[3] ?? field[4] ?? field[5];
        remember(credential);
        if (field[2] !== undefined) {
          remember(credential.replace(/""/g, '"'));
        } else if (field[3] !== undefined) {
          remember(credential.replace(/''/g, "'"));
        } else if (field[4] !== undefined) {
          remember(credential.replace(/}}/g, '}'));
        }
      }
    }
  }
}

function addStrongOpenCodeConfigCredentials(
  config: OpenCodeSDKConfig,
  remember: (value: unknown) => void,
): void {
  if (!config || typeof config !== 'object') {
    return;
  }
  remember(config.apiKey);
  addStrongOpenCodeUrlCredentials(config.baseUrl, remember);
  if (!config.mcp || typeof config.mcp !== 'object' || Array.isArray(config.mcp)) {
    return;
  }
  for (const server of Object.values(config.mcp)) {
    addStrongOpenCodeServerCredentials(server, remember);
  }
}

function addStrongOpenCodeServerCredentials(
  server: OpenCodeMCPServerConfig,
  remember: (value: unknown) => void,
): void {
  if (server?.type === 'remote') {
    addStrongOpenCodeUrlCredentials(server.url, remember);
    remember(server.oauth?.clientSecret);
    for (const [key, value] of Object.entries(server.headers ?? {})) {
      if (
        !/^(?:accept(?:-.+)?|content-(?:type|length|encoding)|user-agent|host|connection|cache-control|pragma|origin|referer|referrer|x-request-id|traceparent|tracestate)$/i.test(
          key,
        )
      ) {
        addOpenCodeHeaderCredentials(value, remember);
      }
    }
  } else if (server?.type === 'local') {
    for (const [key, value] of Object.entries(server.environment ?? {})) {
      addStrongOpenCodeEnvironmentCredentials(key, value, remember, true);
    }
    addStrongOpenCodeCommandCredentials(server.command, remember);
  }
}

function addStrongOpenCodeCommandCredentials(
  command: string[],
  remember: (value: unknown) => void,
): void {
  let credentialFollows = false;
  for (const argument of Array.isArray(command) ? command.slice(1) : []) {
    if (typeof argument !== 'string') {
      continue;
    }
    if (credentialFollows) {
      addOpenCodeEnvironmentValue('', argument, remember, true);
    }
    addStrongOpenCodeEnvironmentCredentials('', argument, remember, true);
    credentialFollows = false;
    const equals = argument.indexOf('=');
    const key = (equals === -1 ? argument : argument.slice(0, equals)).replace(/^-+/, '');
    if (equals !== -1) {
      addStrongOpenCodeEnvironmentCredentials(key, argument.slice(equals + 1), remember, true);
    }
    if (!OPEN_CODE_CREDENTIAL_NAME.test(key)) {
      continue;
    }
    if (equals === -1) {
      credentialFollows = argument.startsWith('-');
    } else {
      addOpenCodeEnvironmentValue(key, argument.slice(equals + 1), remember, true);
    }
  }
}

function openCodeConfigHasCompoundMcpCommand(config: OpenCodeSDKConfig): boolean {
  if (!config?.mcp || typeof config.mcp !== 'object' || Array.isArray(config.mcp)) {
    return false;
  }
  return Object.values(config.mcp).some((server) => {
    if (server?.type !== 'local' || !Array.isArray(server.command)) {
      return false;
    }
    const words = server.command.filter((word): word is string => typeof word === 'string');
    if (
      words
        .slice(1)
        .some(
          (word) =>
            /^(?:--(?:eval|execute|exec|command|script|code|expression)(?:$|=)|-e(?:$|[^-]))/i.test(
              word,
            ) ||
            /(?:[([{][\s\S]*[)\]}]|=>|\$\(|`)/.test(word) ||
            /\s(?:--?[\w.-]*(?:token|secret|pass(?:word|wd|phrase)|credential|api.?key|authorization|cookie)[\w.-]*|(?:authorization|cookie)\s*:)\s*(?:=|\s)\s*\S/i.test(
              word,
            ),
        )
    ) {
      return true;
    }
    return words.some((word, index) => {
      const pathSegments = word.split(/[/\\]/);
      const executable = pathSegments[pathSegments.length - 1]
        ?.toLowerCase()
        .replace(/\.(?:exe|cmd|bat)$/, '');
      if (!executable) {
        return false;
      }
      if (
        index > 0 &&
        /^(?:-p|--package)$/.test(words[index - 1]) &&
        words
          .slice(0, index - 1)
          .some((earlier) =>
            /(?:^|[/\\])(?:npx|npm|pnpm|yarn)(?:\.(?:exe|cmd|bat))?$/i.test(earlier),
          )
      ) {
        return false;
      }
      const options = words.slice(index + 1);
      if (executable === 'env') {
        return options.some((option) => /^--split-string(?:$|=)|^-[^-\s]*S/.test(option));
      }
      if (/^(?:ba|da|z|k|mk|a|fi|c|tc)?sh$/.test(executable) || executable === 'nu') {
        return options.some(
          (option) => /^--command(?:$|=)/i.test(option) || /^-[^-\s]*c[^-\s]*$/i.test(option),
        );
      }
      if (executable === 'cmd') {
        return options.some((option) => /^\/[ck](?:$|\s)/i.test(option));
      }
      if (/^(?:pwsh|powershell)$/.test(executable)) {
        return options.some((option) =>
          /^-(?:c|command|e|enc|encodedcommand)(?:$|[=:])/i.test(option),
        );
      }
      if (/^(?:npx|npm|pnpm|yarn)$/.test(executable)) {
        // For package runners -p selects a package (or an npm output mode), not inline code.
        // Actual shells and interpreters nested after a runner are classified independently.
        return options.some((option) =>
          /^(?:--(?:eval|execute|command|call|shell(?:-mode)?|script-shell)(?:$|=)|-[yqn]*c(?:$|[^-]))/i.test(
            option,
          ),
        );
      }
      if (
        /^(?:node(?:js)?|tsx|ts-node|jiti|babel-node|esno|coffee|deno|bun|python(?:\d+(?:\.\d+)*)?|pypy(?:\d+)?|ruby|perl|php|lua(?:\d+(?:\.\d+)*)?)$/.test(
          executable,
        )
      ) {
        return options.some(
          (option) =>
            /^(?:--(?:eval|print|execute|command|call)(?:$|=)|-[^-\s]*[cep][^-\s]*)/i.test(
              option,
            ) ||
            (executable === 'deno' && option === 'eval'),
        );
      }
      return false;
    });
  });
}

function addOpenCodeServerCredentials(
  server: OpenCodeMCPServerConfig,
  remember: (value: unknown) => void,
) {
  if (!server || typeof server !== 'object') {
    return;
  }
  if (server.type === 'remote') {
    addOpenCodeUrlCredentials(server.url, remember);
    if (server.headers && typeof server.headers === 'object' && !Array.isArray(server.headers)) {
      for (const value of Object.values(server.headers)) {
        addOpenCodeHeaderCredentials(value, remember);
      }
    }
    remember(server.oauth?.clientId);
    remember(server.oauth?.clientSecret);
  } else if (server.type === 'local') {
    if (
      server.environment &&
      typeof server.environment === 'object' &&
      !Array.isArray(server.environment)
    ) {
      for (const [key, value] of Object.entries(server.environment)) {
        addOpenCodeEnvironmentValue(key, value, remember, true);
      }
    }
    for (const argument of Array.isArray(server.command) ? server.command.slice(1) : []) {
      if (typeof argument !== 'string') {
        continue;
      }
      const equals = argument.indexOf('=');
      if (equals === -1) {
        addOpenCodeEnvironmentValue('', argument, remember, true);
      } else {
        remember(argument);
        addOpenCodeEnvironmentValue(
          argument.slice(0, equals),
          argument.slice(equals + 1),
          remember,
          true,
        );
      }
    }
  }
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

// Only code-authored, public diagnostic text may use this class. In particular,
// arbitrary configuration keys and SDK error messages must never be interpolated.
class OpenCodeLocalDiagnosticError extends Error {}

const OPEN_CODE_PUBLIC_POLICY_NAMES = new Set([
  '*',
  'apply_patch',
  'bash',
  'codesearch',
  'doom_loop',
  'edit',
  'external_directory',
  'glob',
  'grep',
  'list',
  'lsp',
  'patch',
  'question',
  'read',
  'skill',
  'task',
  'todoread',
  'todowrite',
  'webfetch',
  'websearch',
  'write',
]);

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
    throw new OpenCodeLocalDiagnosticError(
      'OpenCode permission must be an object mapping tools to permission rules',
    );
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
      const field = OPEN_CODE_PUBLIC_POLICY_NAMES.has(tool)
        ? `OpenCode permission.${tool}`
        : 'OpenCode permission entries';
      throw new OpenCodeLocalDiagnosticError(
        `${field} must be ask, allow, deny, or a pattern mapping`,
      );
    }

    for (const [pattern, action] of Object.entries(value)) {
      if (!isOpenCodePermissionAction(action)) {
        const field = OPEN_CODE_PUBLIC_POLICY_NAMES.has(tool)
          ? `OpenCode permission.${tool}${pattern === '*' ? '.*' : ' patterns'}`
          : 'OpenCode permission patterns';
        throw new OpenCodeLocalDiagnosticError(`${field} must be ask, allow, or deny`);
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
  throw new OpenCodeLocalDiagnosticError(
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
  private clientInitialization?: Promise<void>;
  private server?: OpenCodeServer;
  private activeClientCredentials = new Set<string>();
  private activeStrongClientCredentials = new Set<string>();
  private activeClientHasCompoundMcpCommand = false;
  private hasUnclosedCredentialSource = false;
  private activeCallCount = 0;
  private clearClientCredentialsAfterCalls = false;
  private shutdownRequested?: Exclude<ProviderShutdownReason, 'process'>;
  private deferredShutdown?: NodeJS.Immediate;
  private automaticCleanup?: Promise<void>;
  private automaticCleanupReason?: Exclude<ProviderShutdownReason, 'process'>;
  private explicitCleanup?: Promise<void>;
  private readonly processTermination = new AbortController();
  private terminationCleanup?: Promise<void>;
  private sessions: Map<string, OpenCodeSessionHandle> = new Map(); // cacheKey -> session info
  private sessionOrder: string[] = []; // Track insertion order for LRU eviction
  private sessionQueues = new Map<string, Promise<void>>();
  private pendingTempDirectories = new Set<string>();
  private tempDirectoryRemovals = new Map<string, Promise<void>>();
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

  cleanup(): Promise<void> {
    if (this.explicitCleanup) {
      return this.explicitCleanup;
    }
    const cleanup = Promise.resolve(this.automaticCleanup)
      .catch(() => undefined)
      .then(() => this.cleanupResources('explicit'))
      .finally(() => {
        if (this.explicitCleanup === cleanup) {
          this.explicitCleanup = undefined;
        }
      });
    this.explicitCleanup = cleanup;
    return cleanup;
  }

  private async cleanupResources(reason: ProviderShutdownReason | 'explicit'): Promise<void> {
    if (reason !== 'process') {
      await this.clientInitialization?.catch(() => undefined);
    }
    this.clientInitialization = undefined;
    // An existing server owns its persistent sessions; callers can resume their IDs after
    // normal evaluation/process teardown. Only explicit manual cleanup deletes them.
    const preserveRemoteSessions =
      Boolean(this.config.baseUrl) && (reason === 'evaluation' || reason === 'process');
    if (!preserveRemoteSessions) {
      if (this.config.baseUrl && this.sessions.size > 0 && !this.client) {
        await this.ensureClient(this.config);
      }
      await this.deletePersistentSessions(reason !== 'explicit');
      this.sessions.clear();
      this.sessionOrder = [];
    }
    this.sessionQueues.clear();

    this.closeServer();
    this.client = undefined;
    if (!this.hasUnclosedCredentialSource) {
      if (this.activeCallCount === 0) {
        this.activeClientCredentials.clear();
        this.activeStrongClientCredentials.clear();
        this.activeClientHasCompoundMcpCommand = false;
        this.clearClientCredentialsAfterCalls = false;
      } else {
        this.clearClientCredentialsAfterCalls = true;
      }
    }
    await Promise.all(
      [...this.pendingTempDirectories].map((workingDir) => this.removeTempDirectory(workingDir)),
    );
    if (
      reason === 'process' ||
      (this.pendingTempDirectories.size === 0 && this.activeCallCount === 0)
    ) {
      providerRegistry.unregister(this);
    } else {
      providerRegistry.register(this);
    }
  }

  private closeServer(): void {
    if (this.server) {
      try {
        this.server.close();
      } catch (err) {
        // If closing could not be verified, do not forget values that the old server may
        // still return, even if another client is later initialized on this instance.
        this.hasUnclosedCredentialSource = true;
        logger.debug('Failed to close OpenCode server', {
          error: this.formatCallError(err, this.config),
        });
      }
      this.server = undefined;
    }
  }

  async shutdown(reason: ProviderShutdownReason = 'manual'): Promise<void> {
    if (reason === 'process') {
      return this.terminate();
    }
    if (this.processTermination.signal.aborted) {
      return this.terminationCleanup;
    }
    if (this.activeCallCount > 0) {
      // Normal cleanup must not interrupt another active consumer or wait for its call.
      if (!this.shutdownRequested || reason === 'manual') {
        this.shutdownRequested = reason;
      }
      providerRegistry.register(this);
      return;
    }
    return this.startAutomaticCleanup(reason);
  }

  private terminate(): Promise<void> {
    if (this.terminationCleanup) {
      return this.terminationCleanup;
    }
    if (this.deferredShutdown) {
      clearImmediate(this.deferredShutdown);
      this.deferredShutdown = undefined;
    }
    this.shutdownRequested = undefined;
    this.processTermination.abort();
    // Start best-effort reclamation while the client is present, but close the owned process
    // immediately even when a request, startup or explicit cleanup does not settle.
    const cleanup = this.cleanupResources('process');
    this.closeServer();
    this.terminationCleanup = cleanup;
    return cleanup;
  }

  private startAutomaticCleanup(reason: Exclude<ProviderShutdownReason, 'process'>): Promise<void> {
    if (this.automaticCleanup) {
      if (reason === 'manual' && this.automaticCleanupReason === 'evaluation') {
        return this.automaticCleanup.then(() => this.startAutomaticCleanup(reason));
      }
      return this.automaticCleanup;
    }
    if (this.deferredShutdown) {
      clearImmediate(this.deferredShutdown);
      this.deferredShutdown = undefined;
    }
    this.shutdownRequested = undefined;
    this.automaticCleanupReason = reason;
    const cleanup = Promise.resolve(this.explicitCleanup)
      .catch(() => undefined)
      .then(() => this.cleanupResources(reason))
      .finally(() => {
        if (this.automaticCleanup === cleanup) {
          this.automaticCleanup = undefined;
          this.automaticCleanupReason = undefined;
          this.scheduleShutdownAfterCalls();
        }
      });
    this.automaticCleanup = cleanup;
    return cleanup;
  }

  private scheduleShutdownAfterCalls(): void {
    if (
      !this.shutdownRequested ||
      this.activeCallCount > 0 ||
      this.automaticCleanup ||
      this.deferredShutdown
    ) {
      return;
    }
    // Let callers start the next queued row before deciding whether the provider is idle.
    this.deferredShutdown = setImmediate(() => {
      this.deferredShutdown = undefined;
      if (!this.shutdownRequested || this.activeCallCount > 0) {
        return;
      }
      const formatError = this.getErrorFormatter(this.config);
      void this.startAutomaticCleanup(this.shutdownRequested).catch((error) => {
        logger.debug('Failed to clean up idle OpenCode provider', { error: formatError(error) });
      });
    });
  }

  private async waitForProcessTermination<T>(operation: Promise<T>): Promise<T> {
    const signal = this.processTermination.signal;
    let onAbort: (() => void) | undefined;
    const terminated = new Promise<never>((_, reject) => {
      onAbort = () => reject(new DOMException('OpenCode SDK call aborted', 'AbortError'));
      if (signal.aborted) {
        onAbort();
      } else {
        signal.addEventListener('abort', onAbort, { once: true });
      }
    });
    try {
      return await Promise.race([operation, terminated]);
    } finally {
      if (onAbort) {
        signal.removeEventListener('abort', onAbort);
      }
    }
  }

  private async deletePersistentSessions(automatic: boolean): Promise<void> {
    if (this.sessions.size === 0) {
      return;
    }
    const formatError = this.getErrorFormatter(this.config);
    const remove = async (session: OpenCodeSessionHandle, signal?: AbortSignal) => {
      try {
        await this.deleteSession(session, signal);
      } catch (err) {
        logger.debug('Failed to delete persistent OpenCode session', {
          sessionId: formatError(session.id),
          error: formatError(err),
        });
      }
    };
    if (!automatic) {
      for (const session of this.sessions.values()) {
        await remove(session);
      }
      return;
    }

    // Try every session within one deadline, including when an SDK transport ignores abort.
    await this.runBoundedCleanup((signal) =>
      Promise.all([...this.sessions.values()].map((session) => remove(session, signal))),
    );
  }

  private async runBoundedCleanup(run: (signal: AbortSignal) => Promise<unknown>): Promise<void> {
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<void>((resolve) => {
      timeout = setTimeout(() => {
        controller.abort();
        resolve();
      }, SESSION_SHUTDOWN_TIMEOUT_MS);
    });
    try {
      await Promise.race([run(controller.signal), deadline]);
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }

  private removeTempDirectory(workingDir: string): Promise<void> {
    this.pendingTempDirectories.add(workingDir);
    const current = this.tempDirectoryRemovals.get(workingDir);
    if (current) {
      return current;
    }
    const removal = Promise.resolve()
      .then(() => fsPromises.rm(workingDir, { recursive: true, force: true }))
      .then(
        () => {
          this.pendingTempDirectories.delete(workingDir);
        },
        (error: unknown) => {
          logger.debug('Failed to remove temp directory for OpenCode', { workingDir, error });
        },
      )
      .finally(() => {
        if (this.tempDirectoryRemovals.get(workingDir) === removal) {
          this.tempDirectoryRemovals.delete(workingDir);
        }
      });
    this.tempDirectoryRemovals.set(workingDir, removal);
    return removal;
  }

  private collectCurrentCredentials(
    config: OpenCodeSDKConfig,
    remember: (value: unknown) => void,
  ): void {
    addOpenCodeConfigCredentials(this.config, remember);
    if (config !== this.config) {
      addOpenCodeConfigCredentials(config, remember);
    }
    remember(this.getApiKey(config));
    for (const key of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_API_KEY'] as const) {
      remember(getEnvString(key));
    }
    for (const environment of [process.env, this.env ?? {}]) {
      for (const [key, value] of Object.entries(environment)) {
        addOpenCodeEnvironmentValue(key, value, remember);
      }
    }
  }

  private collectStrongCredentials(
    config: OpenCodeSDKConfig,
    remember: (value: unknown) => void,
  ): void {
    addStrongOpenCodeConfigCredentials(this.config, remember);
    if (config !== this.config) {
      addStrongOpenCodeConfigCredentials(config, remember);
    }
    remember(this.getApiKey(config));
    for (const [environment, includePrivateUrlPath] of [
      [process.env, false],
      [this.env ?? {}, true],
    ] as const) {
      for (const [key, value] of Object.entries(environment)) {
        addStrongOpenCodeEnvironmentCredentials(key, value, remember, includePrivateUrlPath);
      }
    }
  }

  private formatCallError(
    error: unknown,
    config: OpenCodeSDKConfig,
    status?: number,
    retainedCredentials?: ReadonlySet<string>,
    retainedHasCompoundMcpCommand = false,
    redactOnly = false,
    retainedStrongCredentials?: ReadonlySet<string>,
  ): string {
    const credentials = new Set<string>();
    const unboundedCredentials = new Set<string>();
    const encodings = new Map<string, Set<string>>();
    const encodingsFor = (value: string) => {
      let known = encodings.get(value);
      if (!known) {
        known = new Set<string>();
        addOpenCodeCredentialEncodings(value, known);
        encodings.set(value, known);
      }
      return known;
    };
    const remember = (value: unknown) => {
      if (typeof value === 'string' && value) {
        for (const encoding of encodingsFor(value)) {
          credentials.add(encoding);
        }
      }
    };
    for (const value of this.activeClientCredentials) {
      remember(value);
    }
    for (const value of retainedCredentials ?? []) {
      remember(value);
    }
    this.collectCurrentCredentials(config, remember);
    const rememberStrong = (value: unknown) => {
      if (typeof value === 'string' && value) {
        for (const encoding of encodingsFor(value)) {
          unboundedCredentials.add(encoding);
        }
      }
    };
    for (const value of this.activeStrongClientCredentials) {
      rememberStrong(value);
    }
    for (const value of retainedStrongCredentials ?? []) {
      rememberStrong(value);
    }
    this.collectStrongCredentials(config, rememberStrong);
    for (const value of unboundedCredentials) {
      credentials.add(value);
    }
    const withholdUntrustedMessage =
      !redactOnly &&
      (retainedHasCompoundMcpCommand ||
        this.activeClientHasCompoundMcpCommand ||
        openCodeConfigHasCompoundMcpCommand(this.config) ||
        (config !== this.config && openCodeConfigHasCompoundMcpCommand(config)));
    return redactOpenCodeError(
      describeOpenCodeError(error, status, withholdUntrustedMessage),
      [...credentials].sort((left, right) => right.length - left.length),
      unboundedCredentials,
    );
  }

  private getErrorFormatter(
    config: OpenCodeSDKConfig,
    redactOnly = false,
  ): (error: unknown) => string {
    // Detached SDK operations can reject after cleanup clears the active client's credentials.
    const retainedCredentials = new Set(this.activeClientCredentials);
    const retainedStrongCredentials = new Set(this.activeStrongClientCredentials);
    const retainedHasCompoundMcpCommand =
      this.activeClientHasCompoundMcpCommand ||
      openCodeConfigHasCompoundMcpCommand(this.config) ||
      (config !== this.config && openCodeConfigHasCompoundMcpCommand(config));
    this.collectCurrentCredentials(config, (value) => {
      if (typeof value === 'string' && value) {
        retainedCredentials.add(value);
      }
    });
    this.collectStrongCredentials(config, (value) => {
      if (typeof value === 'string' && value) {
        retainedStrongCredentials.add(value);
      }
    });
    return (error) =>
      this.formatCallError(
        error,
        config,
        undefined,
        retainedCredentials,
        retainedHasCompoundMcpCommand,
        redactOnly,
        retainedStrongCredentials,
      );
  }

  private captureClientCredentials(config: OpenCodeSDKConfig): void {
    // A new client now owns this credential set. If old requests are still finishing,
    // their credentials can remain until this new client is also closed safely.
    this.clearClientCredentialsAfterCalls = false;
    this.activeClientHasCompoundMcpCommand ||= openCodeConfigHasCompoundMcpCommand(config);
    this.collectCurrentCredentials(config, (value) => {
      if (typeof value === 'string' && value) {
        this.activeClientCredentials.add(value);
      }
    });
    this.collectStrongCredentials(config, (value) => {
      if (typeof value === 'string' && value) {
        this.activeStrongClientCredentials.add(value);
      }
    });
  }

  private completeCall(): void {
    this.activeCallCount--;
    if (
      this.activeCallCount === 0 &&
      this.clearClientCredentialsAfterCalls &&
      !this.client &&
      !this.hasUnclosedCredentialSource
    ) {
      this.activeClientCredentials.clear();
      this.activeStrongClientCredentials.clear();
      this.activeClientHasCompoundMcpCommand = false;
      this.clearClientCredentialsAfterCalls = false;
    }
    this.scheduleShutdownAfterCalls();
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
      throw new OpenCodeLocalDiagnosticError(
        'OpenCode tools must be an object mapping tool names to booleans',
      );
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
        throw new OpenCodeLocalDiagnosticError(
          OPEN_CODE_PUBLIC_POLICY_NAMES.has(tool)
            ? `OpenCode tools.${tool} must be a boolean`
            : 'OpenCode tools entries must be boolean',
        );
      }
      if (!tool.trim()) {
        throw new OpenCodeLocalDiagnosticError('OpenCode tool names must not be empty');
      }
      if (EDIT_TOOL_ALIASES.has(tool)) {
        if (editPermission !== undefined && editPermission !== enabled) {
          throw new OpenCodeLocalDiagnosticError(
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

    for (const [key, value] of Object.entries(process.env)) {
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
    session: OpenCodeSessionHandle | undefined,
    signal?: AbortSignal,
    client = this.client,
  ): Promise<void> {
    if (!session) {
      return;
    }
    const parameters = this.buildDeleteSessionParameters(session);
    if (!signal) {
      await client?.session?.delete?.(parameters);
    } else if (this.opencodeModule?.apiVersion === 'v2') {
      await client?.session?.delete?.(parameters, { signal });
    } else {
      await client?.session?.delete?.({ ...parameters, signal });
    }
  }

  private buildAbortSessionParameters(
    sessionId: string,
    sessionQuery: OpenCodeSessionQuery | undefined,
  ): Record<string, unknown> {
    // The v2 abort endpoint uses flattened parameters; forced v1 cleanup uses nested options.
    return {
      sessionID: sessionId,
      ...sessionQuery,
    };
  }

  /**
   * Add a session to the cache with LRU eviction
   */
  private addSession(
    cacheKey: string,
    session: OpenCodeSessionHandle,
    config: OpenCodeSDKConfig,
  ): void {
    // Remove oldest sessions if we've hit the limit
    while (this.sessions.size >= MAX_SESSIONS && this.sessionOrder.length > 0) {
      const oldestKey = this.sessionOrder.shift();
      if (oldestKey) {
        const oldSession = this.sessions.get(oldestKey);
        this.sessions.delete(oldestKey);
        // Release owned local sessions. An evicted remote persistent session can still be
        // resumed by its returned ID, so eviction only forgets our local lookup for it.
        if (oldSession && !config.baseUrl) {
          const formatError = this.getErrorFormatter(config);
          this.deleteSession(oldSession).catch((err) => {
            logger.debug('Failed to delete evicted OpenCode session', {
              sessionId: formatError(oldSession.id),
              error: formatError(err),
            });
          });
        }
      }
    }
    this.sessions.set(cacheKey, session);
    this.sessionOrder.push(cacheKey);
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

    // The first prompt chooses the configuration for the reused client/server. Later
    // prompts may omit or replace it, but errors can still echo its original values.
    this.captureClientCredentials(config);
    const { createOpencode, createOpencodeClient } = opencodeModule;
    let initialization: Promise<void>;
    initialization = (async () => {
      if (config.baseUrl) {
        this.client = createOpencodeClient({
          baseUrl: config.baseUrl,
        });
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

      const opencode = await createOpencode(serverOptions);
      this.client = opencode.client;
      this.server = opencode.server;
      if (this.processTermination.signal.aborted) {
        this.closeServer();
        this.client = undefined;
        return;
      }
      logger.debug(`OpenCode server started at ${opencode.server.url}`);
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
      throw new OpenCodeLocalDiagnosticError(
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
      throw new OpenCodeLocalDiagnosticError(
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
    if (config.persist_sessions && this.sessions.has(sessionCacheKey)) {
      const existingIndex = this.sessionOrder.indexOf(sessionCacheKey);
      if (existingIndex !== -1) {
        this.sessionOrder.splice(existingIndex, 1);
      }
      this.sessionOrder.push(sessionCacheKey);

      return {
        sessionId: this.sessions.get(sessionCacheKey)!.id,
        sessionQuery,
      };
    }

    const parameters = this.buildCreateSessionParameters(config, sessionQuery);
    const signal = this.processTermination.signal;
    const createResult = await this.waitForProcessTermination(
      this.opencodeModule.apiVersion === 'v2'
        ? this.client.session.create(parameters, { signal })
        : this.client.session.create({ ...parameters, signal }),
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
      this.addSession(sessionCacheKey, session, config);
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
    // A pattern-specific rule only overrides earlier rules for matching skill names.
    // We do not know which skill the model may invoke until after the call, so skip the
    // history fetch only when every rule that could cover `skill` is a denial. Treating
    // the final patterned rule as global loses allowed calls for policies such as
    // { '*': 'allow', 'blocked-skill': 'deny' }.
    return rules.some(
      (rule) => (rule.permission === 'skill' || rule.permission === '*') && rule.action !== 'deny',
    );
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
    formatError: (error: unknown) => string,
    abortSignal?: AbortSignal,
    includeFinalMessage = true,
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
    if (startIndex === -1) {
      logger.debug(
        '[OpenCode SDK] Parent message not found in fetched messages; falling back to final-message parts for skill tracking',
        { parentId: formatError(parentId), messageCount: messages.length },
      );
      return [];
    }
    const endIndex = messages.findIndex((m) => m.info?.id === assistantId);
    if (endIndex < startIndex) {
      logger.debug(
        '[OpenCode SDK] Assistant message not found after its parent in fetched messages; falling back to final-message parts for skill tracking',
        { assistantId: formatError(assistantId), messageCount: messages.length },
      );
      return [];
    }
    const relevantMessages = messages.slice(
      startIndex,
      includeFinalMessage ? endIndex + 1 : endIndex,
    );
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

  private deriveSkillCalls(
    parts: OpenCodePromptPart[],
    completedNamesOnly = false,
  ): SkillCallEntry[] {
    return parts.flatMap((part) => {
      if (
        part.type !== 'tool' ||
        part.tool !== 'skill' ||
        (completedNamesOnly && part.state?.status !== 'completed')
      ) {
        return [];
      }

      const skillName =
        typeof part.state?.input?.name === 'string' ? part.state.input.name.trim() : '';
      if (!skillName) {
        return [];
      }
      if (completedNamesOnly) {
        return [{ name: skillName, input: { name: skillName }, source: 'tool' }];
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

  private getAssistantErrorAccounting(
    message: OpenCodeAssistantMessage | undefined,
  ): Pick<ProviderResponse, 'tokenUsage' | 'cost'> {
    const isTokenCount = (value: unknown): value is number =>
      typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
    const source = message?.tokens;
    let tokens: OpenCodeAssistantMessage['tokens'];
    if (source && typeof source === 'object') {
      const cache = source.cache;
      const cacheCounts =
        typeof cache === 'object' && cache !== null
          ? {
              ...(isTokenCount(cache.read) ? { read: cache.read } : {}),
              ...(isTokenCount(cache.write) ? { write: cache.write } : {}),
            }
          : undefined;
      const validCounts = {
        ...(isTokenCount(source.input) ? { input: source.input } : {}),
        ...(isTokenCount(source.output) ? { output: source.output } : {}),
        ...(isTokenCount(source.total) ? { total: source.total } : {}),
        ...(isTokenCount(source.reasoning) ? { reasoning: source.reasoning } : {}),
        ...(isTokenCount(cache)
          ? { cache }
          : cacheCounts && Object.keys(cacheCounts).length > 0
            ? { cache: cacheCounts }
            : {}),
      };
      if (Object.keys(validCounts).length > 0) {
        tokens = validCounts;
      }
    }
    const tokenUsage = buildOpenCodeTokenUsage(tokens);
    const cost = message?.cost;
    return {
      ...(tokenUsage ? { tokenUsage } : {}),
      ...(typeof cost === 'number' && Number.isFinite(cost) && cost >= 0 ? { cost } : {}),
    };
  }

  private getErrorRateLimitKind(
    error: unknown,
    fallbackStatus?: number,
    headers?: Record<string, string>,
  ): 'quota' | 'rate_limit' | undefined {
    if (!error || typeof error !== 'object') {
      return undefined;
    }
    const item = error as Record<string, unknown>;
    if ((typeof item.name === 'string' ? item.name : item._tag) !== 'APIError') {
      return undefined;
    }
    const data =
      item.data && typeof item.data === 'object'
        ? (item.data as Record<string, unknown>)
        : undefined;
    const status = [item.statusCode, data?.statusCode, fallbackStatus].find(
      (value) =>
        typeof value === 'number' && Number.isInteger(value) && value >= 100 && value <= 599,
    );
    if (status !== 429) {
      return undefined;
    }
    const isRetryable =
      typeof data?.isRetryable === 'boolean' ? data.isRetryable : item.isRetryable;
    const asRecord = (value: unknown): Record<string, unknown> | undefined =>
      value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
    const normalized = (value: unknown): string | undefined =>
      typeof value === 'string' && value.length <= 256 && value.trim()
        ? value.trim().toLowerCase()
        : undefined;

    let body: unknown = data?.responseBody ?? item.responseBody;
    let textBody: string | undefined;
    if (typeof body === 'string') {
      if (body.length > 32_768) {
        body = undefined;
      } else if (body.trimStart().startsWith('{')) {
        try {
          body = JSON.parse(body);
        } catch {
          body = undefined;
        }
      } else {
        textBody = body;
        body = undefined;
      }
    }
    const records = [asRecord(body), data, item].filter(
      (record): record is Record<string, unknown> => Boolean(record),
    );
    // Preserve code and type as separate signals. The actual upstream code wins
    // over wrapper codes and type aliases; HttpRateLimitError resolves the latter
    // against transient codes and near-term recovery hints consistently with fetch.
    const codes = records.flatMap((record) => {
      const code = normalized(asRecord(record.error)?.code) ?? normalized(record.code);
      return code ? [code] : [];
    });
    const types = records.flatMap((record) => {
      const type = normalized(extractRateLimitErrorType(record));
      return type ? [type] : [];
    });
    const messages = [
      ...records.flatMap((record) => [asRecord(record.error)?.message, record.message]),
      textBody,
    ].filter((message): message is string => typeof message === 'string');
    const known = (code: string) => isHardQuotaCode(code) || isTransientRateLimitCode(code);
    const messageCodes = messages.flatMap((message) =>
      (
        message
          .slice(0, 32_768)
          .toLowerCase()
          .match(/\b[a-z]+(?:_[a-z]+)+\b/g) ?? []
      ).filter(known),
    );
    const definiteCode = [...codes, ...types, ...messageCodes].find(isDefinitiveBillingCode);
    let inferredType: string | undefined;
    if (isRetryable === false && ![...codes, ...types, ...messageCodes].some(known)) {
      const patterns = [
        [
          'credit_balance_exhausted',
          /\bcredit balance (?:is (?:(?:too )?low|exhausted|depleted|insufficient)|(?:has been )?(?:exhausted|depleted))\b/,
        ],
        [
          'billing_hard_limit_reached',
          /\bbilling (?:hard )?limit (?:has been |was |is )?(?:exceeded|exhausted|reached)\b/,
        ],
        ['billing_not_active', /\bbilling (?:is )?(?:not active|inactive)\b/],
        ['access_terminated', /\baccess (?:has been |was |is )?terminated\b/],
        [
          'quota_exceeded',
          /\b(?:(?:current |account |daily )?quota (?:has been |was |is )?(?:exceeded|exhausted|reached)|exceeded (?:your |the )?(?:current |account |daily )?quota)\b/,
        ],
      ] as const;
      inferredType = patterns.find(([, pattern]) =>
        messages.some((message) => pattern.test(message.slice(0, 32_768).toLowerCase())),
      )?.[0];
    }
    const timing = headers ? rateLimitTimingFromHeaders(headers) : undefined;
    return new HttpRateLimitError({
      status,
      code: codes[0] ?? messageCodes[0],
      type: definiteCode ?? types[0] ?? inferredType,
      retryAfterMs: timing?.retryAfterMs,
      resetAt: timing?.resetAt,
    }).kind;
  }

  private getErrorRateLimitHeaders(
    error: unknown,
    config: OpenCodeSDKConfig,
    fallbackHeaders: unknown,
  ): Record<string, string> | undefined {
    const item =
      error && typeof error === 'object' ? (error as Record<string, unknown>) : undefined;
    const data =
      item?.data && typeof item.data === 'object'
        ? (item.data as Record<string, unknown>)
        : undefined;
    const headers: Record<string, string> = {};
    let formatHeader: ((error: unknown) => string) | undefined;
    const isHttpDate = (value: string) =>
      /^(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} [A-Za-z]{3} \d{4} \d{2}:\d{2}:\d{2} GMT|(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), \d{2}-[A-Za-z]{3}-\d{2} \d{2}:\d{2}:\d{2} GMT|(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) [A-Za-z]{3} {1,2}\d{1,2} \d{2}:\d{2}:\d{2} \d{4})$/i.test(
        value,
      ) && Number.isFinite(Date.parse(value));
    const isIsoDate = (value: string) =>
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/i.test(value) &&
      Number.isFinite(Date.parse(value));
    const isInteger = (value: string) => /^\d{1,15}$/.test(value);
    const isReset = (value: string) =>
      /^\d{1,15}(?:\.\d{1,9})?$/.test(value) ||
      /^(?=\d)(?:(?:\d{1,10})h)?(?:(?:\d{1,10})m(?!s))?(?:\d{1,10}(?:\.\d{1,9})?(?:ms|s))?$/.test(
        value,
      ) ||
      isHttpDate(value) ||
      isIsoDate(value);
    const isSafeTimingHeader = (name: string, value: string) => {
      if (name === 'retry-after') {
        return isInteger(value) || isHttpDate(value);
      }
      if (
        /^(?:retry-after-ms|x-ratelimit-(?:remaining|limit)(?:-(?:requests|tokens))?|anthropic-ratelimit-(?:requests|tokens)-(?:remaining|limit)|ratelimit-(?:remaining|limit))$/.test(
          name,
        )
      ) {
        return isInteger(value);
      }
      return (
        /^(?:x-ratelimit-reset(?:-(?:requests|tokens))?|anthropic-ratelimit-(?:requests|tokens)-reset|ratelimit-reset)$/.test(
          name,
        ) && isReset(value)
      );
    };

    // Outer headers may be from the OpenCode gateway. Prefer the nested upstream
    // values when the SDK provides both; arbitrary headers and invalid values
    // never enter the provider result or the scheduler.
    for (const source of [fallbackHeaders, item?.responseHeaders, data?.responseHeaders]) {
      if (!source || typeof source !== 'object' || Array.isArray(source)) {
        continue;
      }
      const entries = source instanceof Headers ? source.entries() : Object.entries(source);
      for (const [name, rawValue] of entries) {
        if (typeof rawValue !== 'string' || rawValue.length > 128) {
          continue;
        }
        const key = name.toLowerCase();
        const value = rawValue.trim();
        if (
          isSafeTimingHeader(key, value) &&
          (formatHeader ??= this.getErrorFormatter(config, true))(value) === value
        ) {
          headers[key] = value;
        }
      }
    }
    return Object.keys(headers).length > 0 ? headers : undefined;
  }

  private buildPromptErrorResponse(
    config: OpenCodeSDKConfig,
    response: OpenCodeSdkResult<OpenCodePromptResponse>,
    promptError: OpenCodePromptError,
    sessionId: string,
    intermediateParts: OpenCodePromptPart[] = [],
  ): ProviderResponse {
    const { error, status, headers, assistant } = promptError;
    const responseData = unwrapOpenCodeResult(response);
    const assistantDetails = assistant
      ? { ...this.getAssistantErrorAccounting(responseData?.info), sessionId }
      : {};
    if (isOpenCodeContentFilterRefusal(promptError)) {
      // Retain only the names of skills that completed before filtering. Full
      // tool inputs, metadata, text and structured output may contain filtered content.
      const skillCalls = this.deriveSkillCalls(
        [...intermediateParts, ...(responseData?.parts ?? [])],
        true,
      );
      return {
        ...assistantDetails,
        output: 'I cannot assist with this request because it was blocked by a content filter.',
        isRefusal: true,
        guardrails: { flagged: true, flaggedOutput: true },
        ...(skillCalls.length === 0 ? {} : { metadata: { skillCalls } }),
      };
    }
    return {
      ...this.handleCallError(error, config, undefined, { status, headers }),
      ...assistantDetails,
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

    const formattedError =
      !promptError && error instanceof OpenCodeLocalDiagnosticError
        ? error.message.replace(/[\r\n]+/g, ' ').slice(0, 500)
        : this.formatCallError(error, config, promptError?.status);
    const errorMessage = promptError
      ? 'OpenCode SDK prompt error: ' + formattedError
      : formattedError;
    const timingHeaders = this.getErrorRateLimitHeaders(error, config, promptError?.headers);
    const rateLimitKind = this.getErrorRateLimitKind(error, promptError?.status, timingHeaders);
    const headers =
      rateLimitKind === 'rate_limit' || (!rateLimitKind && promptError?.status === 429)
        ? timingHeaders
        : undefined;
    logger.error('Error calling OpenCode SDK', { error: errorMessage });
    return {
      error: `Error calling OpenCode SDK: ${errorMessage}`,
      ...(rateLimitKind || headers
        ? {
            metadata: {
              ...(rateLimitKind ? { rateLimitKind } : {}),
              ...(headers ? { headers } : {}),
            },
          }
        : {}),
    };
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    if (this.processTermination.signal.aborted || providerRegistry.isProcessTerminating()) {
      return { error: 'OpenCode SDK call aborted before it started' };
    }
    const { config, isTempDir, workingDir } = this.prepareCall(context);
    providerRegistry.registerScoped(this);
    this.activeCallCount++;
    const processSignal = this.processTermination.signal;
    const abortSignal = callOptions?.abortSignal
      ? AbortSignal.any([callOptions.abortSignal, processSignal])
      : processSignal;
    let callClient: OpenCodeClient | undefined;
    let ephemeralSession: OpenCodeSessionHandle | undefined;
    let abortListener: (() => void) | undefined;

    try {
      if (processSignal.aborted) {
        return { error: 'OpenCode SDK call aborted before it started' };
      }
      const cleanup = this.automaticCleanup ?? this.explicitCleanup;
      if (cleanup) {
        await this.waitForProcessTermination(cleanup.catch(() => undefined));
      }
      this.buildEffectivePermissionRules(config);
      await this.waitForProcessTermination(this.ensureOpenCodeModule());
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

      if (abortSignal.aborted) {
        return { error: 'OpenCode SDK call aborted before it started' };
      }

      await this.waitForProcessTermination(this.ensureClient(config));
      callClient = this.client;
      const sessionQueueKey = this.getSessionQueueKey(config, workingDir);
      return await this.runSerializedSessionCall(sessionQueueKey, abortSignal, async () => {
        const session = await this.getOrCreateSession(config, workingDir);
        ephemeralSession = session.ephemeralSession;
        if (abortSignal.aborted) {
          return { error: 'OpenCode SDK call aborted before it started' };
        }

        const promptOptions = this.buildPromptParameters(
          config,
          prompt,
          session.sessionId,
          session.sessionQuery,
        );
        logger.debug(`OpenCode SDK prompt options:`, promptOptions);

        const client = this.client;
        if (!client) {
          throw new Error('OpenCode SDK client is not initialized');
        }

        // Ask the server to stop on cancellation. A process signal also cancels the SDK
        // transport and bounds this separate best-effort abort request.
        const v2 = this.opencodeModule?.apiVersion === 'v2';
        if (client.session.abort) {
          const formatError = this.getErrorFormatter(config);
          const abortParams = v2
            ? this.buildAbortSessionParameters(session.sessionId, session.sessionQuery)
            : { path: getSessionPath(session.sessionId), query: session.sessionQuery };
          const logAbortError = (error: unknown) => {
            logger.debug('[OpenCode SDK] Failed to abort session', {
              sessionId: formatError(session.sessionId),
              error: formatError(error),
            });
          };
          abortListener = () => {
            try {
              if (processSignal.aborted) {
                void this.runBoundedCleanup((signal) =>
                  v2
                    ? client.session.abort!(abortParams, { signal })
                    : client.session.abort!({ ...abortParams, signal }),
                ).catch(logAbortError);
              } else if (v2) {
                client.session.abort?.(abortParams).catch(logAbortError);
              }
            } catch (error) {
              logAbortError(error);
            }
          };
          abortSignal.addEventListener('abort', abortListener, { once: true });
        }

        const response = await this.waitForProcessTermination(
          v2
            ? client.session.prompt(promptOptions, { signal: abortSignal })
            : client.session.prompt({ ...promptOptions, signal: abortSignal }),
        );
        // The prompt has returned, so an abort from here on must not ask the
        // server to kill the session it already answered.
        if (abortListener) {
          abortSignal.removeEventListener('abort', abortListener);
          abortListener = undefined;
        }

        if (abortSignal.aborted) {
          return { error: 'OpenCode SDK call aborted' };
        }
        const promptError = getOpenCodePromptError(response);
        const isContentFilterRefusal = isOpenCodeContentFilterRefusal(promptError);
        if (promptError && !isContentFilterRefusal) {
          return this.buildPromptErrorResponse(config, response, promptError, session.sessionId);
        }
        logger.debug('OpenCode SDK response received');

        // Fetch only the parts that belong to the current prompt from the session
        // history so that deriveSkillCalls captures skill calls from intermediate
        // turns. Gated on the effective tool policy, so the extra round trip is
        // skipped whenever the skill tool is denied and no skill parts can exist.
        let allSessionParts: OpenCodePromptPart[] = [];
        if (this.isSkillToolEnabled(config)) {
          const formatError = this.getErrorFormatter(config);
          try {
            allSessionParts = await this.waitForProcessTermination(
              this.fetchCurrentPromptParts(
                client,
                session,
                response,
                formatError,
                abortSignal,
                !isContentFilterRefusal,
              ),
            );
          } catch (error) {
            logger.debug('[OpenCode SDK] Could not fetch session history for skill tracking', {
              error: formatError(error),
            });
          }
          if (abortSignal.aborted) {
            return { error: 'OpenCode SDK call aborted' };
          }
        }

        if (promptError) {
          return this.buildPromptErrorResponse(
            config,
            response,
            promptError,
            session.sessionId,
            allSessionParts,
          );
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
      });
    } catch (error) {
      return this.handleCallError(error, config, callOptions);
    } finally {
      try {
        if (abortListener) {
          abortSignal.removeEventListener('abort', abortListener);
        }
        if (ephemeralSession) {
          try {
            if (processSignal.aborted) {
              await this.runBoundedCleanup((signal) =>
                this.deleteSession(ephemeralSession, signal, callClient),
              );
            } else {
              await this.deleteSession(ephemeralSession);
            }
          } catch (err) {
            logger.debug('Failed to delete non-persistent OpenCode session', {
              sessionId: this.formatCallError(ephemeralSession.id, config),
              error: this.formatCallError(err, config),
            });
          }
        }

        // Clean up temp directory without masking the call result on cleanup failure.
        if (isTempDir && workingDir) {
          await this.removeTempDirectory(workingDir);
        }
      } finally {
        this.completeCall();
      }
    }
  }
}
