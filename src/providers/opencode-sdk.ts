import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

import dedent from 'dedent';
import { getCache, isCacheEnabled } from '../cache';
import cliState from '../cliState';
import { getEnvString } from '../envars';
import { importModule } from '../esm';
import logger from '../logger';

import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../types/index';
import type { EnvOverrides } from '../types/env';

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

// Default read-only tools when working_dir is specified
export const FS_READONLY_TOOLS = ['read', 'grep', 'glob', 'list'].sort();

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
  [key: string]: boolean | undefined; // MCP tools: mcp_*
}

/**
 * Permission configuration for specific tools
 */
export interface OpenCodePermissionConfig {
  bash?: 'ask' | 'allow' | 'deny' | Record<string, 'ask' | 'allow' | 'deny'>;
  edit?: 'ask' | 'allow' | 'deny';
  webfetch?: 'ask' | 'allow' | 'deny';
}

/**
 * Custom agent configuration
 */
export interface OpenCodeAgentConfig {
  description: string;
  mode?: 'primary' | 'subagent' | 'all';
  model?: string;
  temperature?: number;
  tools?: OpenCodeToolConfig;
  permission?: OpenCodePermissionConfig;
  prompt?: string;
}

/**
 * MCP server configuration
 */
export interface OpenCodeMCPServerConfig {
  type: 'local' | 'remote';
  command?: string;
  args?: string[];
  url?: string;
  headers?: Record<string, string>;
}

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
 * Helper to load the OpenCode SDK ESM module
 * Uses importModule utility which handles ESM loading in CommonJS environments
 */
async function loadOpenCodeSDK(): Promise<any> {
  try {
    // Resolve the package path, then use importModule to load it
    // The SDK is ESM-only, so we need the importModule utility which uses dynamic-import.cjs
    const basePath =
      cliState.basePath && path.isAbsolute(cliState.basePath) ? cliState.basePath : process.cwd();

    // The package only exports ESM, so we construct the direct path
    // The SDK is installed in node_modules/@opencode-ai/sdk/dist/index.js
    const modulePath = path.join(
      basePath,
      'node_modules',
      '@opencode-ai',
      'sdk',
      'dist',
      'index.js',
    );

    return await importModule(modulePath);
  } catch (err) {
    logger.error(`Failed to load OpenCode SDK: ${err}`);
    if ((err as any).stack) {
      logger.error((err as any).stack);
    }
    throw new Error(
      dedent`The @opencode-ai/sdk package is required but not installed.

      To use the OpenCode SDK provider, install it with:
        npm install @opencode-ai/sdk

      For more information, see: https://www.promptfoo.dev/docs/providers/opencode-sdk/`,
    );
  }
}

/**
 * Get a fingerprint for the working directory to use as a cache key
 */
const FINGERPRINT_TIMEOUT_MS = 2000;
async function getWorkingDirFingerprint(workingDir: string): Promise<string> {
  const dirStat = fs.statSync(workingDir);
  const dirMtime = dirStat.mtimeMs;

  const startTime = Date.now();

  const getAllFiles = (dir: string, files: string[] = []): string[] => {
    if (Date.now() - startTime > FINGERPRINT_TIMEOUT_MS) {
      throw new Error('Working directory fingerprint timed out');
    }

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        getAllFiles(fullPath, files);
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
    return files;
  };

  const allFiles = getAllFiles(workingDir);

  const fileMtimes = allFiles
    .map((file: string) => {
      const stat = fs.statSync(file);
      const relativePath = path.relative(workingDir, file);
      return `${relativePath}:${stat.mtimeMs}`;
    })
    .sort();

  const fingerprintData = `dir:${dirMtime};files:${fileMtimes.join(',')}`;
  const fingerprint = crypto.createHash('sha256').update(fingerprintData).digest('hex');

  return fingerprint;
}

export class OpenCodeSDKProvider implements ApiProvider {
  config: OpenCodeSDKConfig;
  env?: EnvOverrides;
  apiKey?: string;

  private providerId = 'opencode:sdk';
  private opencodeModule?: any;
  private client?: any;
  private server?: { url: string; close(): void };
  private sessions: Map<string, string> = new Map(); // cacheKey -> sessionId

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
    this.apiKey = this.getApiKey();
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
    };
  }

  /**
   * Generate cache key for this request
   */
  private generateCacheKey(
    prompt: string,
    config: OpenCodeSDKConfig,
    workingDirFingerprint: string | null,
  ): string {
    const keyData = {
      prompt,
      tools: this.buildToolsConfig(config),
      permission: config.permission,
      agent: config.agent,
      custom_agent: config.custom_agent,
      workingDirFingerprint,
    };

    const hash = crypto.createHash('sha256').update(JSON.stringify(keyData)).digest('hex');
    return `opencode:sdk:${hash}`;
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

    let isTempDir = false;
    let workingDir: string | undefined;

    if (config.working_dir) {
      workingDir = config.working_dir;
      // Validate working directory
      let stats: fs.Stats;
      try {
        stats = fs.statSync(workingDir);
      } catch (err: any) {
        throw new Error(
          `Working directory ${config.working_dir} does not exist or isn't accessible: ${err.message}`,
        );
      }
      if (!stats.isDirectory()) {
        throw new Error(`Working directory ${config.working_dir} is not a directory`);
      }
    } else {
      isTempDir = true;
      workingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-opencode-sdk-'));
    }

    // Cache handling
    let shouldCache = isCacheEnabled();
    let cache: Awaited<ReturnType<typeof getCache>> | undefined;
    let cacheKey: string | undefined;

    if (shouldCache) {
      let workingDirFingerprint: string | null = null;
      if (config.working_dir) {
        try {
          workingDirFingerprint = await getWorkingDirFingerprint(config.working_dir);
        } catch (error) {
          logger.error(
            dedent`Error getting working directory fingerprint for cache key - ${config.working_dir}: ${String(error)}

            Caching is disabled.`,
          );
          shouldCache = false;
        }
      }

      if (shouldCache) {
        cache = await getCache();
        cacheKey = this.generateCacheKey(prompt, config, workingDirFingerprint);
      }
    }

    const shouldReadCache = shouldCache && !context?.bustCache;
    const shouldWriteCache = shouldCache;

    // Check cache
    if (shouldReadCache && cache && cacheKey) {
      try {
        const cachedResponse = await cache.get<string | undefined>(cacheKey);
        if (cachedResponse) {
          logger.debug(`Returning cached response for OpenCode SDK (cache key: ${cacheKey})`);
          return JSON.parse(cachedResponse);
        }
      } catch (error) {
        logger.error(`Error getting cached response: ${String(error)}`);
      }
    }

    // Check abort signal
    if (callOptions?.abortSignal?.aborted) {
      return { error: 'OpenCode SDK call aborted before it started' };
    }

    try {
      // Load SDK module (lazy)
      if (!this.opencodeModule) {
        this.opencodeModule = await loadOpenCodeSDK();
      }

      // Initialize client and server (lazy)
      if (!this.client) {
        const { createOpencode, createOpencodeClient } = this.opencodeModule;

        if (config.baseUrl) {
          // Connect to existing server
          this.client = createOpencodeClient({
            baseUrl: config.baseUrl,
          });
        } else {
          // Ensure ~/.opencode/bin is in PATH for the SDK to find the opencode CLI
          const homeDir = os.homedir();
          const opencodeBinPath = path.join(homeDir, '.opencode', 'bin');
          if (!process.env.PATH?.includes(opencodeBinPath)) {
            process.env.PATH = `${opencodeBinPath}:${process.env.PATH}`;
            logger.debug(`Added ${opencodeBinPath} to PATH for OpenCode CLI`);
          }

          // Start our own server and create client
          const serverOptions: any = {
            hostname: config.hostname ?? '127.0.0.1',
            port: config.port ?? 0, // 0 = auto-select port
            timeout: config.timeout ?? 30000,
          };

          // Note: Model selection uses OpenCode's configured default model.
          // Per-prompt model selection is not supported by the SDK.

          const opencode = await createOpencode(serverOptions);
          this.client = opencode.client;
          this.server = opencode.server;

          logger.debug(`OpenCode server started at ${opencode.server.url}`);
        }
      }
      // Get or create session
      let sessionId: string;

      if (config.session_id) {
        // Resume existing session
        sessionId = config.session_id;
      } else if (config.persist_sessions && cacheKey && this.sessions.has(cacheKey)) {
        // Reuse persisted session
        sessionId = this.sessions.get(cacheKey)!;
      } else {
        // Create new session
        // The SDK session.create() accepts { body: { title } }
        const createResult = await this.client.session.create({
          body: { title: `promptfoo-${Date.now()}` },
        });
        // Response structure: { id, title, version, time }
        sessionId = createResult?.data?.id ?? createResult?.id ?? createResult;

        if (config.persist_sessions && cacheKey) {
          this.sessions.set(cacheKey, sessionId);
        }
      }

      // Build prompt body for session.prompt()
      // SDK expects: { path: { id }, body: { parts, model?, tools?, agent?, system? }, query?: { directory? } }
      const promptBody: any = {
        parts: [{ type: 'text', text: prompt }],
      };

      // Add model config if specified
      // SDK expects model: { providerID, modelID }
      if (config.provider_id || config.model) {
        promptBody.model = {
          providerID: config.provider_id ?? '',
          modelID: config.model ?? '',
        };
      }

      // Add tools config if specified
      const toolsConfig = this.buildToolsConfig(config);
      if (toolsConfig) {
        promptBody.tools = toolsConfig;
      }

      // Add agent if specified
      if (config.agent) {
        promptBody.agent = config.agent;
      }

      // Build the full options object for session.prompt()
      const promptOptions: any = {
        path: { id: sessionId },
        body: promptBody,
      };

      // Add working directory query param only if user specified a working_dir
      // (not for auto-created temp directories, as it affects API behavior)
      if (config.working_dir) {
        promptOptions.query = { directory: workingDir };
      }

      // Send message using session.prompt() and get response
      // SDK: session.prompt(options) -> { info: AssistantMessage, parts: Part[] }
      logger.debug(`OpenCode SDK prompt options:`, { path: promptOptions.path, body: promptBody });
      const response = await this.client.session.prompt(promptOptions);

      logger.debug(`OpenCode SDK response received`);

      // The response is { data: { info: AssistantMessage, parts: Part[] } }
      const responseData = response?.data ?? response;
      const assistantMessage = responseData?.info ?? responseData;
      const parts = responseData?.parts ?? [];

      // Extract text output from parts
      let output = '';
      for (const part of parts) {
        if (part.type === 'text' && part.text) {
          output += (output ? '\n' : '') + part.text;
        }
      }

      const raw = JSON.stringify(response);

      // Extract token usage from AssistantMessage.tokens
      // SDK structure: { input, output, reasoning, cache }
      const tokens = assistantMessage?.tokens;
      const tokenUsage: ProviderResponse['tokenUsage'] = tokens
        ? {
            prompt: tokens.input ?? 0,
            completion: tokens.output ?? 0,
            total: (tokens.input ?? 0) + (tokens.output ?? 0),
          }
        : undefined;

      // Extract cost from AssistantMessage
      const cost = assistantMessage?.cost ?? 0;

      const providerResponse: ProviderResponse = {
        output,
        tokenUsage,
        cost,
        raw,
        sessionId,
      };

      // Cache the response
      if (shouldWriteCache && cache && cacheKey) {
        try {
          await cache.set(cacheKey, JSON.stringify(providerResponse));
        } catch (error) {
          logger.error(`Error caching response: ${String(error)}`);
        }
      }

      logger.debug(`OpenCode SDK response: ${output.substring(0, 100)}...`);

      return providerResponse;
    } catch (error: any) {
      const isAbort = error?.name === 'AbortError' || callOptions?.abortSignal?.aborted;

      if (isAbort) {
        logger.warn('OpenCode SDK call aborted');
        return { error: 'OpenCode SDK call aborted' };
      }

      // Check for CLI not installed error
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
      return {
        error: `Error calling OpenCode SDK: ${error.message || error}`,
      };
    } finally {
      // Clean up temp directory
      if (isTempDir && workingDir) {
        fs.rmSync(workingDir, { recursive: true, force: true });
      }

      // Clean up non-persistent sessions
      if (!config.persist_sessions && !config.session_id && cacheKey) {
        this.sessions.delete(cacheKey);
      }
    }
  }
}
