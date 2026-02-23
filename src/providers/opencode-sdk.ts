import { createRequire } from 'node:module';
import fs from 'fs';
import os from 'os';
import path from 'path';

import dedent from 'dedent';
import cliState from '../cliState';
import { getEnvString } from '../envars';
import { importModule } from '../esm';
import logger, { getLogLevel } from '../logger';
import { cacheResponse, getCachedResponse, initializeAgenticCache } from './agentic-utils';

import type { EnvOverrides } from '../types/env';
import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
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
  [key: string]: boolean | undefined; // MCP tools: mcp_*
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
  /** Web fetching permission */
  webfetch?: OpenCodePermissionValue;
  /** Prevents infinite agent loops (added in v1.1.1) */
  doom_loop?: OpenCodePermissionValue;
  /** Access to directories outside the working directory (added in v1.1.1) */
  external_directory?: OpenCodePermissionValue;
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
  /** Model ID to use for this agent (overrides global model) */
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
   * Model ID to use (e.g., 'claude-sonnet-4-20250514', 'gpt-4o')
   * Combined with provider_id to specify the exact model
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
   * @default 4096
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
   * Custom agent configuration
   */
  custom_agent?: OpenCodeAgentConfig;

  /**
   * Session ID to resume an existing session
   */
  session_id?: string;

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
   * Enable streaming responses via SSE
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

/**
 * OpenCode SDK client interface
 */
interface OpenCodeClient {
  session: {
    create: (options: {
      body: { title: string };
    }) => Promise<{ data?: { id: string }; id?: string }>;
    prompt: (options: {
      path: { id: string };
      body: Record<string, unknown>;
      query?: { directory?: string };
    }) => Promise<{
      data?: {
        info?: {
          tokens?: { input?: number; output?: number };
          cost?: number;
        };
        parts?: Array<{ type: string; text?: string }>;
      };
    }>;
    delete: (options: { path: { id: string } }) => Promise<void>;
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
    config?: Record<string, unknown>;
    env?: Record<string, string>;
  }) => Promise<{ client: OpenCodeClient; server: OpenCodeServer }>;
  createOpencodeClient: (options: { baseUrl: string }) => OpenCodeClient;
}

/**
 * Resolve ESM-only package entry point by reading package.json exports
 * Handles packages that only have "import" condition (no "require" condition)
 *
 * @param packageName - The package name (e.g., '@opencode-ai/sdk')
 * @param basePath - Base path for resolution
 * @returns Absolute path to the ESM entry point
 */
function resolveEsmPackage(packageName: string, basePath: string): string {
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
  // Handle: exports["."].import, exports["."], or exports (string)
  let esmEntry: string | undefined;

  if (packageJson.exports) {
    const mainExport = packageJson.exports['.'] || packageJson.exports;
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

/**
 * Helper to load the OpenCode SDK ESM module
 *
 * Uses a two-phase approach:
 * 1. Try simple dynamic import - works when SDK is in same node_modules tree
 * 2. Fall back to smart ESM resolution for edge cases (pnpm, global installs, monorepos)
 */
async function loadOpenCodeSDK(): Promise<OpenCodeSDKModule> {
  // Phase 1: Try simple dynamic import (works in most cases)
  try {
    logger.debug('Attempting simple dynamic import of @opencode-ai/sdk');
    // Cast to unknown first to handle type mismatch between actual SDK exports and our interface
    return (await import('@opencode-ai/sdk')) as unknown as OpenCodeSDKModule;
  } catch {
    logger.debug('Simple import failed, falling back to smart ESM resolution');
  }

  // Phase 2: Smart ESM resolution for edge cases
  try {
    const basePath =
      cliState.basePath && path.isAbsolute(cliState.basePath) ? cliState.basePath : process.cwd();

    const modulePath = resolveEsmPackage('@opencode-ai/sdk', basePath);
    logger.debug(`Resolved OpenCode SDK path: ${modulePath}`);

    return await importModule(modulePath);
  } catch (err) {
    logger.error(`Failed to load OpenCode SDK: ${err}`);
    const stack = (err as Error).stack;
    if (stack) {
      logger.error(stack);
    }
    throw new Error(
      dedent`The @opencode-ai/sdk package is required but not installed.

      To use the OpenCode SDK provider, install it with:
        npm install @opencode-ai/sdk

      For more information, see: https://www.promptfoo.dev/docs/providers/opencode-sdk/`,
    );
  }
}

export class OpenCodeSDKProvider implements ApiProvider {
  config: OpenCodeSDKConfig;
  env?: EnvOverrides;

  private providerId = 'opencode:sdk';
  private opencodeModule?: OpenCodeSDKModule;
  private client?: OpenCodeClient;
  private server?: OpenCodeServer;
  private sessions: Map<string, string> = new Map(); // cacheKey -> sessionId
  private sessionOrder: string[] = []; // Track insertion order for LRU eviction

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
  getApiKey(): string | undefined {
    if (this.config?.apiKey) {
      return this.config.apiKey;
    }

    // Check provider-specific env vars based on provider_id
    const providerId = this.config?.provider_id?.toLowerCase();
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

  toString(): string {
    return '[OpenCode SDK Provider]';
  }

  async cleanup(): Promise<void> {
    // Clean up sessions if not persisting
    if (!this.config.persist_sessions) {
      for (const sessionId of this.sessions.values()) {
        try {
          await this.client?.session?.delete({ path: { id: sessionId } });
        } catch (err) {
          logger.debug(`Failed to delete session ${sessionId}: ${err}`);
        }
      }
    }
    this.sessions.clear();
    this.sessionOrder = [];

    // Close server if we started one
    if (this.server) {
      try {
        this.server.close();
      } catch (err) {
        logger.debug(`Failed to close OpenCode server: ${err}`);
      }
      this.server = undefined;
    }
  }

  /**
   * Build the tools configuration based on config and defaults
   */
  private buildToolsConfig(config: OpenCodeSDKConfig): OpenCodeToolConfig | undefined {
    // If explicit tools config provided, use it
    if (config.tools) {
      return config.tools;
    }

    // If no working_dir, disable all tools (chat-only mode)
    if (!config.working_dir) {
      return {
        bash: false,
        edit: false,
        write: false,
        read: false,
        grep: false,
        glob: false,
        list: false,
        patch: false,
        todowrite: false,
        todoread: false,
        webfetch: false,
        question: false,
        skill: false,
        lsp: false,
      };
    }

    // With working_dir, enable read-only tools by default
    return {
      bash: false,
      edit: false,
      write: false,
      read: true,
      grep: true,
      glob: true,
      list: true,
      patch: false,
      todowrite: false,
      todoread: false,
      webfetch: false,
      question: false,
      skill: false,
      lsp: false,
    };
  }

  /**
   * Resolve and validate the working directory from config, or create a temp dir.
   * Returns { workingDir, isTempDir }.
   */
  private resolveWorkingDir(config: OpenCodeSDKConfig): { workingDir: string; isTempDir: boolean } {
    if (config.working_dir) {
      const workingDir = path.isAbsolute(config.working_dir)
        ? config.working_dir
        : path.resolve(process.cwd(), config.working_dir);
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
      return { workingDir, isTempDir: false };
    }
    const workingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-opencode-sdk-'));
    return { workingDir, isTempDir: true };
  }

  /**
   * Build the server environment, adding opencode bin path and enabling debug mode if needed.
   */
  private buildServerEnv(config: OpenCodeSDKConfig): Record<string, string> {
    const homeDir = os.homedir();
    const opencodeBinPath = path.join(homeDir, '.opencode', 'bin');
    const serverEnv: Record<string, string> = { ...process.env } as Record<string, string>;

    if (!serverEnv.PATH?.includes(opencodeBinPath)) {
      serverEnv.PATH = `${opencodeBinPath}:${serverEnv.PATH ?? ''}`;
      logger.debug(`Added ${opencodeBinPath} to PATH for OpenCode CLI`);
    }

    if (config.log_level === 'debug' || isDebugMode()) {
      serverEnv.DEBUG = serverEnv.DEBUG || 'opencode:*';
      logger.debug('[OpenCode SDK] Debug mode enabled, synced from promptfoo log level');
    }

    return serverEnv;
  }

  /**
   * Build the server config object for MCP, custom agents, permissions, and tools.
   */
  private buildServerConfig(config: OpenCodeSDKConfig): Record<string, unknown> {
    const serverConfig: Record<string, unknown> = {};

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
          tools: config.custom_agent.tools,
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

    return serverConfig;
  }

  /**
   * Initialize the OpenCode client (and optionally server) if not already initialized.
   */
  private async initializeClient(config: OpenCodeSDKConfig): Promise<void> {
    if (this.client) {
      return;
    }

    if (!this.opencodeModule) {
      this.opencodeModule = await loadOpenCodeSDK();
    }

    const { createOpencode, createOpencodeClient } = this.opencodeModule;

    if (config.baseUrl) {
      this.client = createOpencodeClient({ baseUrl: config.baseUrl });
      return;
    }

    const serverEnv = this.buildServerEnv(config);
    const serverOptions: {
      hostname: string;
      port: number;
      timeout: number;
      config?: Record<string, unknown>;
      env?: Record<string, string>;
    } = {
      hostname: config.hostname ?? '127.0.0.1',
      port: config.port ?? 0,
      timeout: config.timeout ?? 30000,
      env: serverEnv,
    };

    const serverConfig = this.buildServerConfig(config);
    if (Object.keys(serverConfig).length > 0) {
      serverOptions.config = serverConfig;
    }

    const opencode = await createOpencode(serverOptions);
    this.client = opencode.client;
    this.server = opencode.server;
    logger.debug(`OpenCode server started at ${opencode.server.url}`);
  }

  /**
   * Get or create a session ID for this call, persisting if configured.
   */
  private async getOrCreateSession(
    config: OpenCodeSDKConfig,
    sessionCacheKey: string | undefined,
  ): Promise<string> {
    if (config.session_id) {
      return config.session_id;
    }

    if (config.persist_sessions && sessionCacheKey && this.sessions.has(sessionCacheKey)) {
      return this.sessions.get(sessionCacheKey)!;
    }

    const createResult = await this.client!.session.create({
      body: { title: `promptfoo-${Date.now()}` },
    });
    const extractedId = createResult?.data?.id ?? createResult?.id;
    if (!extractedId) {
      throw new Error('Failed to get session ID from OpenCode SDK response');
    }

    if (config.persist_sessions && sessionCacheKey) {
      this.addSession(sessionCacheKey, extractedId);
    }

    return extractedId;
  }

  /**
   * Build the prompt body and options object for session.prompt().
   */
  private buildPromptOptions(
    config: OpenCodeSDKConfig,
    prompt: string,
    sessionId: string,
    workingDir: string,
  ): { path: { id: string }; body: Record<string, unknown>; query?: { directory: string } } {
    const promptBody: Record<string, unknown> = {
      parts: [{ type: 'text', text: prompt }],
    };

    if (config.provider_id || config.model) {
      promptBody.model = {
        providerID: config.provider_id ?? '',
        modelID: config.model ?? '',
      };
    }

    const toolsConfig = this.buildToolsConfig(config);
    if (toolsConfig) {
      promptBody.tools = toolsConfig;
    }

    if (config.agent) {
      promptBody.agent = config.agent;
    } else if (config.custom_agent) {
      promptBody.agent = 'custom';
    }

    if (config.custom_agent?.prompt) {
      promptBody.system = config.custom_agent.prompt;
    }

    if (config.permission) {
      promptBody.permission = config.permission;
    }

    const promptOptions: {
      path: { id: string };
      body: Record<string, unknown>;
      query?: { directory: string };
    } = {
      path: { id: sessionId },
      body: promptBody,
    };

    if (config.working_dir) {
      promptOptions.query = { directory: workingDir };
    }

    return promptOptions;
  }

  /**
   * Parse response data into output string and token usage.
   */
  private parseResponseData(response: Awaited<ReturnType<OpenCodeClient['session']['prompt']>>): {
    output: string;
    tokenUsage: ProviderResponse['tokenUsage'];
    cost: number;
  } {
    const responseData = response?.data;
    const assistantMessage = responseData?.info;
    const parts = responseData?.parts ?? [];

    let output = '';
    for (const part of parts) {
      if (part.type === 'text' && part.text) {
        output += (output ? '\n' : '') + part.text;
      }
    }

    const tokens = assistantMessage?.tokens;
    const tokenUsage: ProviderResponse['tokenUsage'] = tokens
      ? {
          prompt: tokens.input ?? 0,
          completion: tokens.output ?? 0,
          total: (tokens.input ?? 0) + (tokens.output ?? 0),
        }
      : undefined;

    const cost = assistantMessage?.cost ?? 0;
    return { output, tokenUsage, cost };
  }

  /**
   * Handle errors from callApi, converting abort and ENOENT into user-friendly messages.
   */
  private handleCallApiError(error: any, callOptions?: CallApiOptionsParams): ProviderResponse {
    const isAbort = error?.name === 'AbortError' || callOptions?.abortSignal?.aborted;
    if (isAbort) {
      logger.warn('OpenCode SDK call aborted');
      return { error: 'OpenCode SDK call aborted' };
    }

    if (error?.code === 'ENOENT' && error?.message?.includes('opencode')) {
      const cliError = dedent`The OpenCode CLI is required but not installed.

        The OpenCode SDK requires the 'opencode' CLI to be installed and available in your PATH.

        Install it with:
          curl -fsSL https://opencode.ai/install | bash

        Or see: https://opencode.ai for other installation methods.`;
      logger.error(cliError);
      return { error: cliError };
    }

    logger.error(`Error calling OpenCode SDK: ${error}`);
    return { error: `Error calling OpenCode SDK: ${error.message || error}` };
  }

  /**
   * Add a session to the cache with LRU eviction
   */
  private addSession(cacheKey: string, sessionId: string): void {
    // Remove oldest sessions if we've hit the limit
    while (this.sessions.size >= MAX_SESSIONS && this.sessionOrder.length > 0) {
      const oldestKey = this.sessionOrder.shift();
      if (oldestKey) {
        const oldSessionId = this.sessions.get(oldestKey);
        this.sessions.delete(oldestKey);
        // Best-effort cleanup of old session
        if (oldSessionId) {
          this.client?.session?.delete({ path: { id: oldSessionId } }).catch((err) => {
            logger.debug(`Failed to delete evicted session ${oldSessionId}: ${err}`);
          });
        }
      }
    }
    this.sessions.set(cacheKey, sessionId);
    this.sessionOrder.push(cacheKey);
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    // Merge configs from provider and prompt
    const config: OpenCodeSDKConfig = {
      ...this.config,
      ...context?.prompt?.config,
    };

    const { workingDir, isTempDir } = this.resolveWorkingDir(config);

    // Cache handling using shared utilities
    const mcpConfig = config.mcp && Object.keys(config.mcp).length > 0 ? config.mcp : undefined;
    const cacheResult = await initializeAgenticCache(
      {
        cacheKeyPrefix: 'opencode:sdk',
        workingDir: config.working_dir ? workingDir : undefined,
        bustCache: context?.bustCache,
        mcp: mcpConfig,
        cacheMcp: config.cache_mcp,
      },
      {
        prompt,
        provider_id: config.provider_id,
        model: config.model,
        tools: this.buildToolsConfig(config),
        permission: config.permission,
        agent: config.agent,
        custom_agent: config.custom_agent,
      },
    );

    const cachedResponse = await getCachedResponse(cacheResult, 'OpenCode SDK');
    if (cachedResponse) {
      return cachedResponse;
    }

    if (callOptions?.abortSignal?.aborted) {
      return { error: 'OpenCode SDK call aborted before it started' };
    }

    const sessionCacheKey = cacheResult.cacheKey;

    try {
      await this.initializeClient(config);

      const sessionId = await this.getOrCreateSession(config, sessionCacheKey);

      const promptOptions = this.buildPromptOptions(config, prompt, sessionId, workingDir);

      logger.debug(`OpenCode SDK prompt options:`, {
        path: promptOptions.path,
        body: promptOptions.body,
        query: promptOptions.query,
      });

      const response = await this.client!.session.prompt(promptOptions);
      logger.debug(`OpenCode SDK response received`);

      const { output, tokenUsage, cost } = this.parseResponseData(response);
      const raw = JSON.stringify(response);

      const providerResponse: ProviderResponse = {
        output,
        tokenUsage,
        cost,
        raw,
        sessionId,
      };

      await cacheResponse(cacheResult, providerResponse, 'OpenCode SDK');
      logger.debug(`OpenCode SDK response: ${output.substring(0, 100)}...`);

      return providerResponse;
    } catch (error: any) {
      return this.handleCallApiError(error, callOptions);
    } finally {
      if (isTempDir && workingDir) {
        fs.rmSync(workingDir, { recursive: true, force: true });
      }

      if (!config.persist_sessions && !config.session_id && sessionCacheKey) {
        this.sessions.delete(sessionCacheKey);
        const idx = this.sessionOrder.indexOf(sessionCacheKey);
        if (idx !== -1) {
          this.sessionOrder.splice(idx, 1);
        }
      }
    }
  }
}
