/**
 * OpenHands SDK Provider
 *
 * This provider integrates with OpenHands, an open-source AI coding agent with
 * state-of-the-art benchmark performance (72.8% on SWE-Bench Verified).
 *
 * Key features:
 * - 100+ LLM providers via LiteLLM (Anthropic, OpenAI, Google, Ollama, etc.)
 * - Docker sandboxing for isolated code execution
 * - LLM-based security analysis for automated action review
 * - Context compression for unlimited conversation length
 *
 * Requirements:
 * - Python 3.11+ must be installed
 * - OpenHands must be installed: pip install openhands-ai
 *
 * Architecture:
 * - Starts OpenHands Agent Server as a subprocess
 * - Communicates via REST API endpoints
 * - Supports both polling and WebSocket event streaming
 *
 * Default configurations:
 * - No working_dir: Runs in temp directory with no tools (chat-only mode)
 * - With working_dir: Runs in specified directory with read-only tools
 *
 * @see https://docs.openhands.dev
 * @see https://github.com/OpenHands/OpenHands
 */

import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import dedent from 'dedent';
import { getEnvString } from '../envars';
import logger from '../logger';
import { fetchWithProxy } from '../util/fetch/index';
import { cacheResponse, getCachedResponse, initializeAgenticCache } from './agentic-utils';

import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../types/index';
import type { EnvOverrides } from '../types/env';

/**
 * Tool configuration for OpenHands SDK
 */
export interface OpenHandsToolConfig {
  /** Enable terminal/bash execution */
  terminal?: boolean;
  /** Enable file editing (true = read/write, 'read' = read-only) */
  file_editor?: boolean | 'read';
  /** Enable task tracking */
  task_tracker?: boolean;
  /** Enable web browsing */
  browser?: boolean;
}

/**
 * OpenHands SDK Provider Configuration
 */
export interface OpenHandsSDKConfig {
  /**
   * API key for the underlying LLM provider (e.g., Anthropic, OpenAI)
   * Falls back to provider-specific environment variables
   */
  apiKey?: string;

  /**
   * LLM provider ID (e.g., 'anthropic', 'openai', 'google', 'ollama')
   * Used by LiteLLM for model routing
   */
  provider_id?: string;

  /**
   * Model ID to use (e.g., 'claude-sonnet-4-5-20250929', 'gpt-4.1')
   * Combined with provider_id for LiteLLM model specification
   */
  model?: string;

  /**
   * Base URL for connecting to an existing OpenHands server
   * If not specified, the provider will start its own server
   */
  baseUrl?: string;

  /**
   * Hostname for the OpenHands server (when starting a new server)
   * @default '127.0.0.1'
   */
  hostname?: string;

  /**
   * Port for the OpenHands server (when starting a new server)
   * @default 3000
   */
  port?: number;

  /**
   * Timeout for server startup in milliseconds
   * @default 60000
   */
  timeout?: number;

  /**
   * Working directory for OpenHands to operate in
   * If not specified, uses a temporary directory
   */
  working_dir?: string;

  /**
   * Workspace type for execution environment
   * @default 'local'
   */
  workspace_type?: 'local' | 'docker' | 'remote';

  /**
   * Docker image for sandboxed execution (when workspace_type is 'docker')
   */
  docker_image?: string;

  /**
   * Tool configuration - enable/disable specific tools
   * When working_dir is set, defaults to read-only tools
   */
  tools?: OpenHandsToolConfig;

  /**
   * Maximum agent iterations before stopping
   * @default 50
   */
  max_iterations?: number;

  /**
   * Cost budget limit in USD (stops execution when exceeded)
   */
  max_budget_usd?: number;

  /**
   * Session ID to resume an existing session
   */
  session_id?: string;

  /**
   * Keep sessions alive between calls
   */
  persist_sessions?: boolean;

  /**
   * Enable LLM-based security analysis of agent actions
   * @default true
   */
  security_analyzer?: boolean;

  /**
   * Action confirmation policy for security
   * @default 'none' (for evals)
   */
  confirmation_policy?: 'none' | 'risky' | 'all';

  /**
   * Enable context compression for long conversations
   * @default true
   */
  condenser?: boolean;

  /**
   * Custom system prompt to override default
   */
  system_prompt?: string;

  /**
   * Append to default system prompt
   */
  append_system_prompt?: string;

  /**
   * Include raw events in response metadata
   * @default false
   */
  log_events?: boolean;

  /**
   * Enable event streaming via WebSocket (vs polling)
   * @default false
   */
  enable_streaming?: boolean;
}

/**
 * OpenHands conversation state (ConversationInfo from API)
 */
interface ConversationState {
  id: string;
  execution_status:
    | 'idle'
    | 'running'
    | 'paused'
    | 'waiting_for_confirmation'
    | 'finished'
    | 'error'
    | 'stuck';
  // Alias for easier access
  status:
    | 'idle'
    | 'running'
    | 'paused'
    | 'waiting_for_confirmation'
    | 'finished'
    | 'error'
    | 'stuck';
  messages?: Array<{ role: string; content: string }>;
  events?: Array<{
    type: string;
    data: unknown;
  }>;
  metrics?: {
    total_tokens?: number;
    prompt_tokens?: number;
    completion_tokens?: number;
  };
}

/**
 * Maximum number of sessions to keep in memory to prevent unbounded growth
 */
const MAX_SESSIONS = 100;

/**
 * Polling interval for conversation state (ms)
 */
const POLLING_INTERVAL_MS = 1000;

/**
 * Maximum time to wait for conversation completion (ms)
 */
const MAX_COMPLETION_TIMEOUT_MS = 300000; // 5 minutes

/**
 * Managed OpenHands server instance
 */
interface ManagedServer {
  process: ChildProcess;
  baseUrl: string;
  close: () => Promise<void>;
}

/**
 * Start the OpenHands agent server
 */
async function startOpenHandsServer(options: {
  hostname: string;
  port: number;
  timeout: number;
  env?: Record<string, string>;
}): Promise<ManagedServer> {
  const { hostname, port, timeout, env } = options;
  const healthEndpoint = `http://${hostname}:${port}/health`;

  logger.debug(`Starting OpenHands server at ${hostname}:${port}`);

  // Start the OpenHands agent server using Python
  const serverEnv = { ...process.env, ...env } as Record<string, string>;

  const proc = spawn(
    'python',
    ['-m', 'openhands.agent_server', '--port', String(port), '--host', hostname],
    {
      env: serverEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  // Log server output
  proc.stdout?.on('data', (data) => {
    logger.debug(`[OpenHands stdout] ${data.toString().trim()}`);
  });
  proc.stderr?.on('data', (data) => {
    logger.debug(`[OpenHands stderr] ${data.toString().trim()}`);
  });

  // Handle process errors
  proc.on('error', (err) => {
    logger.error(`OpenHands server process error: ${err.message}`);
  });

  // Wait for health check
  const startTime = Date.now();
  const pollInterval = 500;

  while (Date.now() - startTime < timeout) {
    try {
      const res = await fetchWithProxy(healthEndpoint);
      if (res.ok) {
        logger.debug(`OpenHands server healthy at ${healthEndpoint}`);
        return {
          process: proc,
          baseUrl: `http://${hostname}:${port}`,
          close: async () => {
            return new Promise((resolve) => {
              const forceKillTimeout = setTimeout(() => {
                if (!proc.killed) {
                  proc.kill('SIGKILL');
                }
                resolve();
              }, 5000);

              proc.on('exit', () => {
                clearTimeout(forceKillTimeout);
                resolve();
              });

              proc.kill('SIGTERM');
            });
          },
        };
      }
    } catch {
      // Server not ready yet
    }
    await new Promise((r) => setTimeout(r, pollInterval));
  }

  // Timeout - kill the process
  proc.kill('SIGKILL');
  throw new Error(`OpenHands server failed to start within ${timeout}ms`);
}

export class OpenHandsSDKProvider implements ApiProvider {
  config: OpenHandsSDKConfig;
  env?: EnvOverrides;

  private providerId = 'openhands:sdk';
  private server?: ManagedServer;
  private sessions: Map<string, string> = new Map(); // cacheKey -> sessionId
  private sessionOrder: string[] = []; // Track insertion order for LRU eviction

  constructor(
    options: {
      id?: string;
      config?: OpenHandsSDKConfig;
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
    return '[OpenHands SDK Provider]';
  }

  async cleanup(): Promise<void> {
    // Clean up sessions if not persisting
    if (!this.config.persist_sessions && this.server) {
      for (const sessionId of Array.from(this.sessions.values())) {
        try {
          await this.deleteConversation(sessionId);
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
        await this.server.close();
      } catch (err) {
        logger.debug(`Failed to close OpenHands server: ${err}`);
      }
      this.server = undefined;
    }
  }

  /**
   * Build the tools configuration based on config and defaults
   */
  private buildToolsConfig(config: OpenHandsSDKConfig): OpenHandsToolConfig {
    // If explicit tools config provided, use it
    if (config.tools) {
      return config.tools;
    }

    // If no working_dir, disable all tools (chat-only mode)
    if (!config.working_dir) {
      return {
        terminal: false,
        file_editor: false,
        task_tracker: false,
        browser: false,
      };
    }

    // With working_dir, enable read-only tools by default
    return {
      terminal: false,
      file_editor: 'read',
      task_tracker: true,
      browser: false,
    };
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
        if (oldSessionId && this.server) {
          this.deleteConversation(oldSessionId).catch((err) => {
            logger.debug(`Failed to delete evicted session ${oldSessionId}: ${err}`);
          });
        }
      }
    }
    this.sessions.set(cacheKey, sessionId);
    this.sessionOrder.push(cacheKey);
  }

  /**
   * Get the base URL for API calls
   */
  private getBaseUrl(): string {
    if (this.config.baseUrl) {
      return this.config.baseUrl;
    }
    if (this.server) {
      return this.server.baseUrl;
    }
    throw new Error('OpenHands server not initialized');
  }

  /**
   * Build the tools array for the API request based on config
   */
  private buildToolsArray(): Array<{ name: string; params?: Record<string, unknown> }> {
    const toolsConfig = this.buildToolsConfig(this.config);
    const tools: Array<{ name: string; params?: Record<string, unknown> }> = [];

    // Map our config format to OpenHands tool names
    if (toolsConfig.terminal !== false) {
      tools.push({ name: 'BashTool' });
    }
    if (toolsConfig.file_editor !== false) {
      tools.push({ name: 'FileEditorTool' });
    }
    if (toolsConfig.task_tracker !== false) {
      tools.push({ name: 'TaskTrackerTool' });
    }
    if (toolsConfig.browser !== false) {
      tools.push({ name: 'BrowserTool' });
    }

    return tools;
  }

  /**
   * Create a new conversation with initial message
   */
  private async createConversation(initialMessage?: string): Promise<string> {
    const baseUrl = this.getBaseUrl();
    const apiKey = this.getApiKey();
    const model = this.config.model || 'gpt-4o-mini';
    const providerId = this.config.provider_id || 'openai';

    // Build the model string in LiteLLM format
    const modelString = `${providerId}/${model}`;

    // Build request body per OpenHands API spec
    const requestBody: Record<string, unknown> = {
      agent: {
        kind: 'Agent',
        llm: {
          model: modelString,
          ...(apiKey && { api_key: apiKey }),
          temperature: 0.0,
        },
        tools: this.buildToolsArray(),
      },
      workspace: {
        working_dir: this.config.working_dir || '/tmp',
      },
      max_iterations: this.config.max_iterations || 50,
      ...(this.config.session_id && { conversation_id: this.config.session_id }),
    };

    // Add initial message if provided
    if (initialMessage) {
      requestBody.initial_message = {
        content: [{ text: initialMessage }],
      };
    }

    logger.debug('[OpenHands] Creating conversation with:', { requestBody });

    const response = await fetchWithProxy(`${baseUrl}/api/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to create conversation: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    const data = (await response.json()) as { conversation_id?: string; id?: string };
    const conversationId = data.conversation_id || data.id;
    if (!conversationId) {
      throw new Error('Failed to get conversation ID from response');
    }

    return conversationId;
  }

  /**
   * Send a message to a conversation
   */
  private async sendMessage(conversationId: string, message: string): Promise<void> {
    const baseUrl = this.getBaseUrl();
    const response = await fetchWithProxy(
      `${baseUrl}/api/conversations/${conversationId}/messages`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: [{ text: message }],
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to send message: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }
  }

  /**
   * Get conversation state (polling approach)
   */
  private async getConversationState(conversationId: string): Promise<ConversationState> {
    const baseUrl = this.getBaseUrl();
    const response = await fetchWithProxy(`${baseUrl}/api/conversations/${conversationId}`);

    if (!response.ok) {
      throw new Error(
        `Failed to get conversation state: ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as ConversationState;
    // Normalize: use execution_status as status for easier access
    data.status = data.execution_status || data.status;
    return data;
  }

  /**
   * Delete a conversation
   */
  private async deleteConversation(conversationId: string): Promise<void> {
    const baseUrl = this.getBaseUrl();
    try {
      await fetchWithProxy(`${baseUrl}/api/conversations/${conversationId}`, {
        method: 'DELETE',
      });
    } catch (err) {
      logger.debug(`Error deleting conversation ${conversationId}: ${err}`);
    }
  }

  /**
   * Run a conversation (needed after sending messages to idle conversation)
   */
  private async runConversation(conversationId: string): Promise<void> {
    const baseUrl = this.getBaseUrl();
    const response = await fetchWithProxy(`${baseUrl}/api/conversations/${conversationId}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to run conversation: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }
  }

  /**
   * Wait for conversation to complete (polling)
   */
  private async waitForCompletion(
    conversationId: string,
    abortSignal?: AbortSignal,
  ): Promise<ConversationState> {
    const startTime = Date.now();

    while (Date.now() - startTime < MAX_COMPLETION_TIMEOUT_MS) {
      // Check abort signal
      if (abortSignal?.aborted) {
        throw new Error('Conversation aborted');
      }

      const state = await this.getConversationState(conversationId);

      // Terminal states
      if (state.status === 'finished' || state.status === 'error' || state.status === 'stuck') {
        return state;
      }

      if (state.status === 'waiting_for_confirmation') {
        // In eval mode, we don't support interactive confirmation
        throw new Error('Agent awaiting confirmation - not supported in eval mode');
      }

      // Still running, waiting, or idle - keep polling
      await new Promise((r) => setTimeout(r, POLLING_INTERVAL_MS));
    }

    throw new Error(`Conversation timed out after ${MAX_COMPLETION_TIMEOUT_MS}ms`);
  }

  /**
   * Fetch events from a conversation
   */
  private async getConversationEvents(conversationId: string): Promise<
    Array<{
      kind: string;
      source?: string;
      llm_message?: {
        role: string;
        content: Array<{ type?: string; text?: string }>;
      };
    }>
  > {
    const baseUrl = this.getBaseUrl();
    const response = await fetchWithProxy(
      `${baseUrl}/api/conversations/${conversationId}/events/search?limit=100`,
    );

    if (!response.ok) {
      throw new Error(`Failed to get events: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as {
      results: Array<{
        kind: string;
        source?: string;
        llm_message?: {
          role: string;
          content: Array<{ type?: string; text?: string }>;
        };
      }>;
    };
    return data.results || [];
  }

  /**
   * Extract the final output from conversation events
   */
  private extractOutput(
    events: Array<{
      kind: string;
      source?: string;
      llm_message?: {
        role: string;
        content: Array<{ type?: string; text?: string }>;
      };
    }>,
  ): string {
    // Get the last assistant message from MessageEvents
    const assistantMessages = events.filter(
      (e) =>
        e.kind === 'MessageEvent' && e.source === 'agent' && e.llm_message?.role === 'assistant',
    );

    if (assistantMessages.length > 0) {
      const lastMessage = assistantMessages[assistantMessages.length - 1];
      const content = lastMessage.llm_message?.content || [];
      // Extract text content
      return content
        .filter((c) => c.type === 'text' || !c.type)
        .map((c) => c.text || '')
        .join('\n');
    }
    return '';
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    // Merge configs from provider and prompt
    const config: OpenHandsSDKConfig = {
      ...this.config,
      ...context?.prompt?.config,
    };

    let isTempDir = false;
    let workingDir: string | undefined;

    if (config.working_dir) {
      // Resolve relative paths to absolute paths
      workingDir = path.isAbsolute(config.working_dir)
        ? config.working_dir
        : path.resolve(process.cwd(), config.working_dir);
      // Validate working directory
      let stats: fs.Stats;
      try {
        stats = fs.statSync(workingDir);
      } catch (err: unknown) {
        const error = err as NodeJS.ErrnoException;
        throw new Error(
          `Working directory ${config.working_dir} (resolved to ${workingDir}) does not exist or isn't accessible: ${error.message}`,
        );
      }
      if (!stats.isDirectory()) {
        throw new Error(
          `Working directory ${config.working_dir} (resolved to ${workingDir}) is not a directory`,
        );
      }
    } else {
      isTempDir = true;
      workingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-openhands-sdk-'));
    }

    // Cache handling using shared utilities
    const cacheKeyData = {
      prompt,
      provider_id: config.provider_id,
      model: config.model,
      tools: this.buildToolsConfig(config),
      max_iterations: config.max_iterations,
      system_prompt: config.system_prompt,
      append_system_prompt: config.append_system_prompt,
    };

    const cacheResult = await initializeAgenticCache(
      {
        cacheKeyPrefix: 'openhands:sdk',
        workingDir: config.working_dir ? workingDir : undefined,
        bustCache: context?.bustCache,
      },
      cacheKeyData,
    );

    // Check cache
    const cachedResponse = await getCachedResponse(cacheResult, 'OpenHands SDK');
    if (cachedResponse) {
      return cachedResponse;
    }

    // Check abort signal
    if (callOptions?.abortSignal?.aborted) {
      return { error: 'OpenHands SDK call aborted before it started' };
    }

    try {
      // Initialize server (lazy)
      if (!this.server && !this.config.baseUrl) {
        // Build environment for the server process
        const serverEnv: Record<string, string> = { ...process.env } as Record<string, string>;

        // Set API keys based on provider_id
        const apiKey = this.getApiKey();
        if (apiKey) {
          const providerId = config.provider_id?.toLowerCase();
          if (providerId === 'anthropic') {
            serverEnv.ANTHROPIC_API_KEY = apiKey;
          } else if (providerId === 'openai') {
            serverEnv.OPENAI_API_KEY = apiKey;
          } else if (providerId === 'google') {
            serverEnv.GOOGLE_API_KEY = apiKey;
          } else {
            // Set common keys
            serverEnv.ANTHROPIC_API_KEY = serverEnv.ANTHROPIC_API_KEY || apiKey;
            serverEnv.OPENAI_API_KEY = serverEnv.OPENAI_API_KEY || apiKey;
          }
        }

        // Set model configuration
        if (config.provider_id && config.model) {
          // LiteLLM format: provider/model
          serverEnv.LLM_MODEL = `${config.provider_id}/${config.model}`;
        } else if (config.model) {
          serverEnv.LLM_MODEL = config.model;
        }

        // Set workspace configuration
        if (workingDir) {
          serverEnv.WORKSPACE_BASE = workingDir;
        }

        // Set sandbox configuration
        if (config.workspace_type === 'docker') {
          serverEnv.SANDBOX_TYPE = 'docker';
          if (config.docker_image) {
            serverEnv.SANDBOX_CONTAINER_IMAGE = config.docker_image;
          }
        } else {
          serverEnv.SANDBOX_TYPE = 'local';
        }

        // Set agent configuration
        if (config.max_iterations) {
          serverEnv.MAX_ITERATIONS = String(config.max_iterations);
        }
        if (config.max_budget_usd) {
          serverEnv.MAX_BUDGET_PER_TASK = String(config.max_budget_usd);
        }

        this.server = await startOpenHandsServer({
          hostname: config.hostname ?? '127.0.0.1',
          port: config.port ?? 8000,
          timeout: config.timeout ?? 60000,
          env: serverEnv,
        });

        logger.debug(`OpenHands server started at ${this.server.baseUrl}`);
      }

      // Get or create session
      let conversationId: string;
      const sessionCacheKey = cacheResult.cacheKey;
      let isNewConversation = false;

      if (config.session_id) {
        // Resume existing session
        conversationId = config.session_id;
        // For existing sessions, send the message first, then run
        await this.sendMessage(conversationId, prompt);
        await this.runConversation(conversationId);
      } else if (config.persist_sessions && sessionCacheKey && this.sessions.has(sessionCacheKey)) {
        // Reuse persisted session
        conversationId = this.sessions.get(sessionCacheKey)!;
        // For existing sessions, send the message first, then run
        await this.sendMessage(conversationId, prompt);
        await this.runConversation(conversationId);
      } else {
        // Create new conversation with initial message - this starts execution automatically
        conversationId = await this.createConversation(prompt);
        isNewConversation = true;

        if (config.persist_sessions && sessionCacheKey) {
          this.addSession(sessionCacheKey, conversationId);
        }
      }

      // For new conversations with initial_message, the agent starts automatically
      // For existing conversations, we already called runConversation above
      if (isNewConversation) {
        // Check if conversation needs to be started manually
        const initialState = await this.getConversationState(conversationId);
        if (initialState.status === 'idle') {
          await this.runConversation(conversationId);
        }
      }

      // Wait for completion
      const finalState = await this.waitForCompletion(conversationId, callOptions?.abortSignal);

      // Fetch events to extract output
      const events = await this.getConversationEvents(conversationId);

      // Extract output from events
      const output = this.extractOutput(events);

      const providerResponse: ProviderResponse = {
        output,
        raw: JSON.stringify({ state: finalState, events }),
        sessionId: conversationId,
        metadata: config.log_events
          ? {
              events,
            }
          : undefined,
      };

      // Cache the response
      await cacheResponse(cacheResult, providerResponse, 'OpenHands SDK');

      logger.debug(`OpenHands SDK response: ${output.substring(0, 100)}...`);

      return providerResponse;
    } catch (error: unknown) {
      const err = error as Error & { name?: string };
      const isAbort = err.name === 'AbortError' || callOptions?.abortSignal?.aborted;

      if (isAbort) {
        logger.warn('OpenHands SDK call aborted');
        return { error: 'OpenHands SDK call aborted' };
      }

      // Check for Python/OpenHands not installed error
      if (err.message?.includes('ENOENT') || err.message?.includes('python')) {
        const installError = dedent`OpenHands or Python is not installed.

          The OpenHands SDK provider requires:
          1. Python 3.11+ installed and available in PATH
          2. OpenHands installed: pip install openhands-ai

          For more information, see: https://docs.openhands.dev`;
        logger.error(installError);
        return { error: installError };
      }

      logger.error(`Error calling OpenHands SDK: ${err.message || err}`);
      return {
        error: `Error calling OpenHands SDK: ${err.message || err}`,
      };
    } finally {
      // Clean up temp directory
      if (isTempDir && workingDir) {
        fs.rmSync(workingDir, { recursive: true, force: true });
      }

      // Clean up non-persistent sessions from session tracking
      const sessionCacheKey = cacheResult.cacheKey;
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
