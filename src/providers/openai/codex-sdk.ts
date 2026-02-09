import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import { SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import dedent from 'dedent';
import cliState from '../../cliState';
import { getEnvString } from '../../envars';
import { importModule, resolvePackageEntryPoint } from '../../esm';
import logger from '../../logger';
import {
  type GenAISpanContext,
  type GenAISpanResult,
  getTraceparent,
  withGenAISpan,
} from '../../tracing/genaiTracer';

import type { EnvOverrides } from '../../types/env';
import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../../types/index';

/**
 * OpenAI Codex SDK Provider
 *
 * This provider requires the @openai/codex-sdk package to be installed separately:
 *   npm install @openai/codex-sdk
 *
 * Key features:
 * - Thread-based conversations with persistence in ~/.codex/sessions
 * - Native JSON schema output with Zod support
 * - Git repository requirement for safety (can be disabled)
 * - Custom binary path override support
 * - Streaming events for real-time progress
 *
 * Thread Management:
 * - No persist_threads: Creates ephemeral thread per call (default)
 * - With persist_threads: Pools threads by cache key for reuse
 * - With thread_id: Resumes specific thread from ~/.codex/sessions
 */

/**
 * Sandbox modes controlling filesystem access
 */
export type SandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access';

/**
 * Approval policies controlling when user approval is required
 */
export type ApprovalPolicy = 'never' | 'on-request' | 'on-failure' | 'untrusted';

/**
 * Reasoning effort levels for model reasoning intensity.
 *
 * Model support varies:
 * - gpt-5.2: 'none', 'low', 'medium', 'high', 'xhigh'
 * - gpt-5.1-codex-max: 'low', 'medium', 'high', 'xhigh'
 * - gpt-5.1-codex/mini: 'low', 'medium', 'high'
 *
 * Values:
 * - 'none': No reasoning overhead (gpt-5.2 only)
 * - 'minimal': SDK alias for minimal reasoning (maps to 'none' or 'low')
 * - 'low': Light reasoning, faster responses
 * - 'medium': Balanced (default)
 * - 'high': Thorough reasoning for complex tasks
 * - 'xhigh': Maximum reasoning depth (gpt-5.2, gpt-5.1-codex-max)
 */
export type ReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

/**
 * Collaboration modes for multi-agent coordination (beta feature)
 * - 'coding': Focus on implementation and code execution
 * - 'plan': Focus on planning and reasoning before execution
 */
export type CollaborationMode = 'coding' | 'plan';

export interface OpenAICodexSDKConfig {
  apiKey?: string;

  /**
   * Custom base URL for API requests (for proxies)
   */
  base_url?: string;

  /**
   * Working directory for Codex to operate in
   * Defaults to process.cwd()
   */
  working_dir?: string;

  /**
   * Additional directories the agent can access beyond the working directory.
   * Maps to --add-dir flag in Codex CLI.
   */
  additional_directories?: string[];

  /**
   * Skip Git repository check (Codex requires Git by default)
   */
  skip_git_repo_check?: boolean;

  /**
   * Path to custom codex binary
   */
  codex_path_override?: string;

  /**
   * Model to use (e.g., 'gpt-5.2', 'gpt-5.1-codex', 'gpt-5.1-codex-mini')
   */
  model?: string;

  /**
   * Sandbox access level controlling filesystem permissions
   * - 'read-only': Agent can only read files (safest)
   * - 'workspace-write': Agent can write to working directory (default)
   * - 'danger-full-access': Full filesystem access (use with caution)
   */
  sandbox_mode?: SandboxMode;

  /**
   * Model reasoning intensity. Support varies by model:
   * - 'none': No reasoning (gpt-5.2 only)
   * - 'low': Light reasoning, faster responses
   * - 'medium': Balanced (default)
   * - 'high': Thorough reasoning for complex tasks
   * - 'xhigh': Maximum depth (gpt-5.2, gpt-5.1-codex-max only)
   */
  model_reasoning_effort?: ReasoningEffort;

  /**
   * Allow network requests
   */
  network_access_enabled?: boolean;

  /**
   * Allow web search
   */
  web_search_enabled?: boolean;

  /**
   * When to require user approval
   * - 'never': Never require approval
   * - 'on-request': Require approval when requested
   * - 'on-failure': Require approval after failures
   * - 'untrusted': Require approval for untrusted operations
   */
  approval_policy?: ApprovalPolicy;

  /**
   * Thread management
   */
  thread_id?: string; // Resume existing thread
  persist_threads?: boolean; // Keep threads alive between calls
  thread_pool_size?: number; // Max concurrent threads

  /**
   * Output schema for structured JSON responses
   * Supports plain JSON schema or Zod schemas converted with zod-to-json-schema
   */
  output_schema?: Record<string, any>;

  /**
   * Environment variables to pass to Codex CLI
   * By default inherits Node.js process.env
   */
  cli_env?: Record<string, string>;

  /**
   * Enable streaming events (default: false for simplicity)
   */
  enable_streaming?: boolean;

  /**
   * Enable deep tracing of Codex CLI operations.
   * When enabled, injects OTEL environment variables so the Codex CLI
   * exports its internal spans to the local OTLP receiver.
   * Requires tracing.enabled and tracing.otlp.http.enabled in promptfooconfig.
   *
   * IMPORTANT: Deep tracing is INCOMPATIBLE with thread persistence.
   * When enabled, persist_threads, thread_id, and thread_pool_size are ignored
   * because the CLI process must be recreated for each call to get correct span linking.
   *
   * Default: false (only traces at provider level, not CLI internals)
   */
  deep_tracing?: boolean;

  /**
   * Enable collaboration mode for multi-agent coordination (beta).
   * When enabled, Codex can spawn and coordinate with other agent threads.
   *
   * - 'coding': Focus on implementation and code execution
   * - 'plan': Focus on planning and reasoning before execution
   *
   * Collaboration mode enables tools like spawn_agent, send_input, and wait
   * for inter-agent communication.
   *
   * @see https://developers.openai.com/codex/changelog/
   */
  collaboration_mode?: CollaborationMode;
}

/**
 * Helper to load the OpenAI Codex SDK ESM module
 * Uses resolvePackageEntryPoint to handle ESM-only packages with restrictive exports
 */
async function loadCodexSDK(): Promise<any> {
  const basePath =
    cliState.basePath && path.isAbsolute(cliState.basePath) ? cliState.basePath : process.cwd();

  const codexPath = resolvePackageEntryPoint('@openai/codex-sdk', basePath);

  if (!codexPath) {
    throw new Error(
      dedent`The @openai/codex-sdk package is required but not installed.

      To use the OpenAI Codex SDK provider, install it with:
        npm install @openai/codex-sdk

      Requires Node.js 18+.

      For more information, see: https://www.promptfoo.dev/docs/providers/openai-codex-sdk/`,
    );
  }

  try {
    return await importModule(codexPath);
  } catch (err) {
    logger.error(`Failed to load OpenAI Codex SDK: ${err}`);
    if ((err as any).stack) {
      logger.error((err as any).stack);
    }
    throw new Error(
      dedent`Failed to load @openai/codex-sdk.

      The package was found but could not be loaded. This may be due to:
      - Incompatible Node.js version (requires Node.js 18+)
      - Corrupted installation

      Try reinstalling:
        npm install @openai/codex-sdk

      For more information, see: https://www.promptfoo.dev/docs/providers/openai-codex-sdk/`,
    );
  }
}

// Pricing per 1M tokens (as of December 2025)
// See: https://openai.com/pricing
const CODEX_MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // GPT-5.2 (latest frontier model)
  'gpt-5.2': { input: 2.0, output: 8.0 },
  // GPT-5.1 Codex models (recommended for code tasks)
  'gpt-5.1-codex': { input: 2.0, output: 8.0 },
  'gpt-5.1-codex-max': { input: 3.0, output: 12.0 },
  'gpt-5.1-codex-mini': { input: 0.5, output: 2.0 },
  // GPT-5 models
  'gpt-5-codex': { input: 2.0, output: 8.0 },
  'gpt-5-codex-mini': { input: 0.5, output: 2.0 },
  'gpt-5': { input: 2.0, output: 8.0 },
};

export class OpenAICodexSDKProvider implements ApiProvider {
  static OPENAI_MODELS = [
    // GPT-5.2 (latest frontier model)
    'gpt-5.2',
    // GPT-5.1 Codex models (recommended for code tasks)
    'gpt-5.1-codex',
    'gpt-5.1-codex-max',
    'gpt-5.1-codex-mini',
    // GPT-5 Codex models
    'gpt-5-codex',
    'gpt-5-codex-mini',
    // GPT-5 base
    'gpt-5',
  ];

  config: OpenAICodexSDKConfig;
  env?: EnvOverrides;
  apiKey?: string;

  private providerId = 'openai:codex-sdk';
  private codexModule?: any;
  private codexInstance?: any;
  private codexInstanceEnvHash?: string; // Track env hash to detect changes
  private threads: Map<string, any> = new Map();
  private deepTracingWarningShown = false; // Show warning once per instance

  constructor(
    options: {
      id?: string;
      config?: OpenAICodexSDKConfig;
      env?: EnvOverrides;
    } = {},
  ) {
    const { config, env, id } = options;
    this.config = config ?? {};
    this.env = env;
    this.apiKey = this.getApiKey();
    this.providerId = id ?? this.providerId;

    if (this.config.model && !OpenAICodexSDKProvider.OPENAI_MODELS.includes(this.config.model)) {
      logger.warn(`Using unknown model for OpenAI Codex SDK: ${this.config.model}`);
    }
  }

  id(): string {
    return this.providerId;
  }

  getApiKey(): string | undefined {
    return (
      this.config?.apiKey ||
      this.env?.OPENAI_API_KEY ||
      this.env?.CODEX_API_KEY ||
      getEnvString('OPENAI_API_KEY') ||
      getEnvString('CODEX_API_KEY')
    );
  }

  toString(): string {
    return '[OpenAI Codex SDK Provider]';
  }

  async cleanup(): Promise<void> {
    // Clean up threads
    this.threads.clear();

    // Clean up Codex instance to release resources (child processes, file handles)
    if (this.codexInstance) {
      try {
        if (typeof this.codexInstance.destroy === 'function') {
          await this.codexInstance.destroy();
        } else if (typeof this.codexInstance.cleanup === 'function') {
          await this.codexInstance.cleanup();
        } else if (typeof this.codexInstance.close === 'function') {
          await this.codexInstance.close();
        }
      } catch (error) {
        logger.warn('[CodexSDK] Error during cleanup', { error });
      }
      this.codexInstance = undefined;
      this.codexInstanceEnvHash = undefined;
    }
  }

  private prepareEnvironment(
    config: OpenAICodexSDKConfig,
    traceparent?: string,
  ): Record<string, string> {
    const env: Record<string, string> = config.cli_env
      ? { ...config.cli_env }
      : ({ ...process.env } as Record<string, string>);

    // Sort keys for stable cache key generation
    const sortedEnv: Record<string, string> = {};
    for (const key of Object.keys(env).sort()) {
      if (env[key] !== undefined) {
        sortedEnv[key] = env[key];
      }
    }

    // Inject API key
    if (this.apiKey) {
      sortedEnv.OPENAI_API_KEY = this.apiKey;
      sortedEnv.CODEX_API_KEY = this.apiKey;
    }

    // Inject env overrides
    if (this.env) {
      for (const key of Object.keys(this.env).sort()) {
        const value = this.env[key as keyof typeof this.env];
        if (value !== undefined) {
          sortedEnv[key] = value;
        }
      }
    }

    // Inject OpenTelemetry configuration for deep tracing
    // This allows the Codex CLI to export its internal traces to our OTLP receiver
    // Without deep_tracing, we still capture spans at the provider level but don't
    // inject OTEL vars into CLI (which would cause export errors if no collector)
    if (config.deep_tracing) {
      // Standard OTEL environment variables - use defaults only if not already set
      if (!sortedEnv.OTEL_EXPORTER_OTLP_ENDPOINT) {
        sortedEnv.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://127.0.0.1:4318';
      }
      if (!sortedEnv.OTEL_EXPORTER_OTLP_PROTOCOL) {
        sortedEnv.OTEL_EXPORTER_OTLP_PROTOCOL = 'http/json';
      }
      if (!sortedEnv.OTEL_SERVICE_NAME) {
        sortedEnv.OTEL_SERVICE_NAME = 'codex-cli';
      }
      if (!sortedEnv.OTEL_TRACES_EXPORTER) {
        sortedEnv.OTEL_TRACES_EXPORTER = 'otlp';
      }
      // W3C Trace Context - only set if we have a traceparent for proper parent-child linking
      if (traceparent) {
        sortedEnv.TRACEPARENT = traceparent;
      }
      logger.debug('[CodexSDK] Injecting OTEL config for deep tracing', {
        traceparent: traceparent || '(none - CLI will start own trace)',
        endpoint: sortedEnv.OTEL_EXPORTER_OTLP_ENDPOINT,
        userConfigured: {
          endpoint: !!env.OTEL_EXPORTER_OTLP_ENDPOINT,
          protocol: !!env.OTEL_EXPORTER_OTLP_PROTOCOL,
          serviceName: !!env.OTEL_SERVICE_NAME,
        },
      });
    } else {
      // When deep_tracing is disabled, remove any inherited TRACEPARENT
      // to prevent accidental trace linking from parent processes
      delete sortedEnv.TRACEPARENT;
    }

    return sortedEnv;
  }

  private validateWorkingDirectory(workingDir: string, skipGitCheck: boolean = false): void {
    let stats: fs.Stats;
    try {
      stats = fs.statSync(workingDir);
    } catch (err: any) {
      throw new Error(
        `Working directory ${workingDir} does not exist or isn't accessible: ${err.message}`,
      );
    }

    if (!stats.isDirectory()) {
      throw new Error(`Working directory ${workingDir} is not a directory`);
    }

    if (!skipGitCheck) {
      const gitDir = path.join(workingDir, '.git');
      if (!fs.existsSync(gitDir)) {
        throw new Error(
          dedent`Working directory ${workingDir} is not a Git repository.

          Codex requires a Git repository by default to prevent unrecoverable errors.

          To bypass this check, set skip_git_repo_check: true in your provider config.`,
        );
      }
    }
  }

  private buildThreadOptions(config: OpenAICodexSDKConfig): Record<string, any> {
    return {
      workingDirectory: config.working_dir,
      skipGitRepoCheck: config.skip_git_repo_check ?? false,
      ...(config.model ? { model: config.model } : {}),
      ...(config.additional_directories?.length
        ? { additionalDirectories: config.additional_directories }
        : {}),
      ...(config.sandbox_mode ? { sandboxMode: config.sandbox_mode } : {}),
      ...(config.model_reasoning_effort
        ? { modelReasoningEffort: config.model_reasoning_effort }
        : {}),
      ...(config.network_access_enabled !== undefined
        ? { networkAccessEnabled: config.network_access_enabled }
        : {}),
      ...(config.web_search_enabled !== undefined
        ? { webSearchEnabled: config.web_search_enabled }
        : {}),
      ...(config.approval_policy ? { approvalPolicy: config.approval_policy } : {}),
      ...(config.collaboration_mode ? { collaborationMode: config.collaboration_mode } : {}),
    };
  }

  private async getOrCreateThread(
    config: OpenAICodexSDKConfig,
    cacheKey: string | undefined,
    instance: any,
  ): Promise<any> {
    const threadOptions = this.buildThreadOptions(config);

    // When deep_tracing is enabled, skip all thread caching/persistence
    // Each call needs a fresh thread for correct span linking
    if (config.deep_tracing) {
      return instance.startThread(threadOptions);
    }

    // Resume specific thread
    if (config.thread_id) {
      const cached = this.threads.get(config.thread_id);
      if (cached) {
        return cached;
      }

      const thread = instance.resumeThread(config.thread_id, threadOptions);
      if (config.persist_threads) {
        this.threads.set(config.thread_id, thread);
      }
      return thread;
    }

    // Use pooled thread
    if (config.persist_threads && cacheKey) {
      const cached = this.threads.get(cacheKey);
      if (cached) {
        return cached;
      }

      // Enforce pool size limit
      const poolSize = config.thread_pool_size ?? 1;
      if (this.threads.size >= poolSize) {
        const oldestKey = this.threads.keys().next().value;
        if (oldestKey) {
          this.threads.delete(oldestKey);
        }
      }
    }

    // Create new thread
    const thread = instance.startThread(threadOptions);

    if (config.persist_threads && cacheKey) {
      this.threads.set(cacheKey, thread);
    }

    return thread;
  }

  private async runStreaming(
    thread: any,
    prompt: string,
    runOptions: any,
    callOptions?: CallApiOptionsParams,
  ): Promise<any> {
    const { events } = await thread.runStreamed(prompt, runOptions);
    const items: any[] = [];
    let usage: any = undefined;
    const tracer = trace.getTracer('promptfoo.codex-sdk');

    // Track in-progress spans for items (keyed by item.id)
    const activeSpans: Map<string, ReturnType<typeof tracer.startSpan>> = new Map();
    // Track start times for items (used for items that only have item.completed)
    const itemStartTimes: Map<string, number> = new Map();
    // Track the last event timestamp to estimate start times for items without item.started
    let lastEventTime = Date.now();

    // Collect reasoning for parent span event
    const reasoningTexts: string[] = [];
    // Track all prompts/messages in the conversation
    const conversationMessages: Array<{ role: string; content: string }> = [];

    // Add the initial user prompt
    conversationMessages.push({ role: 'user', content: prompt });

    try {
      for await (const event of events) {
        const eventTime = Date.now();

        // Check abort signal
        if (callOptions?.abortSignal?.aborted) {
          const abortError = new Error('AbortError');
          abortError.name = 'AbortError';
          throw abortError;
        }

        switch (event.type) {
          case 'item.started': {
            // Guard against malformed events
            const item = event.item;
            if (!item) {
              logger.warn('Codex item.started event missing item', { event });
              break;
            }
            // Skip items without IDs - we can't correlate them with item.completed
            // They'll be handled retroactively when item.completed arrives
            if (!item.id) {
              logger.debug('Codex item.started without id, will create span at completion', {
                type: item.type,
              });
              break;
            }
            // Coerce id to string for consistent Map keys
            const itemId = String(item.id);
            // Create a child span for this item
            const spanName = this.getSpanNameForItem(item);
            const span = tracer.startSpan(spanName, {
              kind: SpanKind.INTERNAL,
              attributes: {
                'codex.item.id': itemId,
                'codex.item.type': item.type,
                ...this.getAttributesForItem(item),
              },
            });
            activeSpans.set(itemId, span);
            itemStartTimes.set(itemId, eventTime);
            logger.debug('Codex item started', { itemId, type: item.type });
            break;
          }
          case 'item.completed': {
            // Guard against malformed events
            const item = event.item;
            if (!item) {
              logger.warn('Codex item.completed event missing item', { event });
              break;
            }
            // Use item.id for correlation with item.started, or generate fallback for tracing
            // Items without IDs get retroactive spans (item.started skips them)
            const itemId = item.id ? String(item.id) : crypto.randomUUID();
            items.push(item);

            // Collect reasoning text for summary
            if (item.type === 'reasoning' && typeof item.text === 'string') {
              reasoningTexts.push(item.text);
            }

            // Collect agent messages for conversation history
            if (item.type === 'agent_message' && typeof item.text === 'string') {
              conversationMessages.push({ role: 'assistant', content: item.text });
            }

            // Get or create span for this item
            // Some item types (like reasoning) may only emit item.completed without item.started
            let span = activeSpans.get(itemId);
            const hadStartEvent = span !== undefined;

            if (!span) {
              // Create span retroactively for items without item.started event
              // Use lastEventTime as approximate start time
              const spanName = this.getSpanNameForItem(item);
              span = tracer.startSpan(spanName, {
                kind: SpanKind.INTERNAL,
                startTime: lastEventTime,
                attributes: {
                  'codex.item.id': itemId,
                  'codex.item.type': item.type,
                  'codex.timing.estimated': true, // Mark that timing is estimated
                  ...this.getAttributesForItem(item),
                },
              });
            }

            // Add completion attributes
            const completionAttrs = this.getCompletionAttributesForItem(item);
            for (const [key, value] of Object.entries(completionAttrs)) {
              span.setAttribute(key, value);
            }

            // Calculate and record duration
            const startTime = itemStartTimes.get(itemId) || lastEventTime;
            const durationMs = eventTime - startTime;
            span.setAttribute('codex.duration_ms', durationMs);
            span.setAttribute('codex.had_start_event', hadStartEvent);

            // Add span events for rich content types
            if (item.type === 'reasoning' && typeof item.text === 'string') {
              span.addEvent('reasoning', {
                'codex.reasoning.text': item.text,
              });
            }
            if (item.type === 'agent_message' && typeof item.text === 'string') {
              span.addEvent('message', {
                'codex.message.text': item.text,
              });
            }
            if (item.type === 'command_execution' && typeof item.aggregated_output === 'string') {
              span.addEvent('output', {
                'codex.command.output': item.aggregated_output,
              });
            }

            // Set status based on item - check for any error indicators
            const hasError =
              item.status === 'failed' ||
              item.type === 'error' ||
              item.error !== undefined ||
              (item.type === 'command_execution' &&
                typeof item.exit_code === 'number' &&
                item.exit_code !== 0);

            if (hasError) {
              span.setStatus({
                code: SpanStatusCode.ERROR,
                message:
                  (typeof item.message === 'string' ? item.message : null) ||
                  (typeof item.error?.message === 'string' ? item.error.message : null) ||
                  (item.type === 'command_execution' && item.exit_code !== 0
                    ? `Command exited with code ${item.exit_code}`
                    : null) ||
                  'Item failed',
              });
            } else {
              span.setStatus({ code: SpanStatusCode.OK });
            }

            span.end();
            activeSpans.delete(itemId);
            itemStartTimes.delete(itemId);
            logger.debug('Codex item completed', { itemId, type: item.type, durationMs });
            break;
          }
          case 'turn.completed':
            usage = event.usage;
            logger.debug('Codex turn completed', { usage });
            break;
          default:
            // Log unknown event types for debugging
            logger.debug('Codex unknown event type', { type: event.type });
        }

        // Update last event time for next iteration
        lastEventTime = eventTime;
      }
    } finally {
      // End any remaining spans (handles abort/error cases)
      for (const [itemId, span] of activeSpans) {
        logger.warn('Codex item span not properly closed', { itemId });
        span.setStatus({ code: SpanStatusCode.ERROR, message: 'Span not properly closed' });
        span.end();
      }
      activeSpans.clear();
      itemStartTimes.clear();
    }

    // Extract text from agent_message items for final response
    const agentMessages = items.filter((i) => i.type === 'agent_message');
    const finalResponse =
      agentMessages.length > 0 ? agentMessages.map((i) => i.text).join('\n') : '';

    return {
      finalResponse,
      items,
      usage,
      // Include collected data for parent span enrichment
      reasoningTexts,
      conversationMessages,
    };
  }

  /**
   * Get a descriptive span name for a Codex item
   */
  private getSpanNameForItem(item: any): string {
    switch (item.type) {
      case 'command_execution': {
        const cmd =
          typeof item.command === 'string' ? item.command.split(' ')[0] || 'command' : 'command';
        return `exec ${cmd}`;
      }
      case 'file_change':
        return `file ${item.changes?.[0]?.kind || 'change'}`;
      case 'mcp_tool_call': {
        const server = typeof item.server === 'string' ? item.server : 'unknown';
        const tool = typeof item.tool === 'string' ? item.tool : 'unknown';
        return `mcp ${server}/${tool}`;
      }
      case 'agent_message':
        return 'agent response';
      case 'reasoning':
        return 'reasoning';
      case 'web_search': {
        const query = typeof item.query === 'string' ? item.query.slice(0, 30) : '';
        return `search "${query}"`;
      }
      case 'todo_list':
        return 'todo update';
      case 'error':
        return 'error';
      // Collaboration mode item types
      case 'collaboration_tool_call': {
        const tool = typeof item.tool === 'string' ? item.tool : 'unknown';
        return `collab ${tool}`;
      }
      case 'spawn_agent': {
        const role = typeof item.role === 'string' ? item.role : 'agent';
        return `spawn ${role}`;
      }
      case 'send_input':
        return 'send input';
      case 'agent_wait':
        return 'wait';
      default:
        return `codex.${item.type || 'unknown'}`;
    }
  }

  /**
   * Get attributes for a Codex item at start
   */
  private getAttributesForItem(item: any): Record<string, string | number | boolean> {
    const attrs: Record<string, string | number | boolean> = {};

    switch (item.type) {
      case 'command_execution':
        if (typeof item.command === 'string') {
          attrs['codex.command'] = item.command;
        }
        break;
      case 'mcp_tool_call':
        if (typeof item.server === 'string') {
          attrs['codex.mcp.server'] = item.server;
        }
        if (typeof item.tool === 'string') {
          attrs['codex.mcp.tool'] = item.tool;
        }
        break;
      case 'web_search':
        if (typeof item.query === 'string') {
          attrs['codex.search.query'] = item.query;
        }
        break;
      // Collaboration mode attributes
      case 'collaboration_tool_call':
        if (typeof item.tool === 'string') {
          attrs['codex.collab.tool'] = item.tool;
        }
        if (typeof item.target_thread_id === 'string') {
          attrs['codex.collab.target_thread'] = item.target_thread_id;
        }
        break;
      case 'spawn_agent':
        if (typeof item.role === 'string') {
          attrs['codex.collab.role'] = item.role;
        }
        if (typeof item.thread_id === 'string') {
          attrs['codex.collab.spawned_thread'] = item.thread_id;
        }
        break;
      case 'send_input':
        if (typeof item.target_thread_id === 'string') {
          attrs['codex.collab.target_thread'] = item.target_thread_id;
        }
        break;
    }

    return attrs;
  }

  /**
   * Get attributes for a Codex item at completion
   */
  private getCompletionAttributesForItem(item: any): Record<string, string | number | boolean> {
    const attrs: Record<string, string | number | boolean> = {};

    switch (item.type) {
      case 'command_execution':
        if (typeof item.exit_code === 'number') {
          attrs['codex.exit_code'] = item.exit_code;
        }
        if (typeof item.status === 'string') {
          attrs['codex.status'] = item.status;
        }
        if (typeof item.aggregated_output === 'string') {
          attrs['codex.output'] = item.aggregated_output;
        }
        break;
      case 'file_change':
        if (typeof item.status === 'string') {
          attrs['codex.status'] = item.status;
        }
        if (Array.isArray(item.changes) && item.changes.length) {
          attrs['codex.files_changed'] = item.changes.length;
          attrs['codex.files'] = item.changes
            .map((c: any) => (typeof c?.path === 'string' ? c.path : ''))
            .filter(Boolean)
            .join(', ');
        }
        break;
      case 'mcp_tool_call':
        if (typeof item.status === 'string') {
          attrs['codex.status'] = item.status;
        }
        if (typeof item.error?.message === 'string') {
          attrs['codex.error'] = item.error.message;
        }
        break;
      case 'agent_message':
        if (typeof item.text === 'string') {
          attrs['codex.message'] = item.text;
        }
        break;
      case 'reasoning':
        if (typeof item.text === 'string') {
          attrs['codex.reasoning'] = item.text;
        }
        break;
      case 'error':
        if (typeof item.message === 'string') {
          attrs['codex.error'] = item.message;
        }
        break;
    }

    return attrs;
  }

  private generateCacheKey(config: OpenAICodexSDKConfig, prompt: string): string {
    const keyData = {
      working_dir: config.working_dir,
      additional_directories: config.additional_directories,
      model: config.model,
      output_schema: config.output_schema,
      sandbox_mode: config.sandbox_mode,
      model_reasoning_effort: config.model_reasoning_effort,
      network_access_enabled: config.network_access_enabled,
      web_search_enabled: config.web_search_enabled,
      approval_policy: config.approval_policy,
      prompt,
    };

    const hash = crypto.createHash('sha256').update(JSON.stringify(keyData)).digest('hex');
    return `openai:codex-sdk:${hash}`;
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    // Merge configs (prompt config takes precedence)
    const config: OpenAICodexSDKConfig = {
      ...this.config,
      ...context?.prompt?.config,
    };

    const modelName = config.model || 'codex';

    // Build GenAI span context for tracing
    const spanContext: GenAISpanContext = {
      system: 'openai',
      operationName: 'chat',
      model: modelName,
      providerId: this.id(),
      evalId: context?.evaluationId || context?.test?.metadata?.evaluationId,
      testIndex:
        typeof context?.test?.vars?.__testIdx === 'number'
          ? context.test.vars.__testIdx
          : undefined,
      promptLabel: context?.prompt?.label,
      traceparent: context?.traceparent,
      requestBody: prompt,
    };

    // Result extractor for span attributes
    const resultExtractor = (response: ProviderResponse): GenAISpanResult => {
      const result: GenAISpanResult = {};

      if (response.tokenUsage) {
        result.tokenUsage = response.tokenUsage;
      }

      // Surface session/thread ID for debugging provider reuse
      if (response.sessionId) {
        result.responseId = response.sessionId;
      }

      // Surface cache status if available
      if (response.cached !== undefined) {
        result.cacheHit = response.cached;
      }

      // Confirm actual model used (may differ from requested)
      result.responseModel = modelName;

      if (response.output !== undefined) {
        try {
          result.responseBody =
            typeof response.output === 'string' ? response.output : JSON.stringify(response.output);
        } catch {
          result.responseBody = '[unable to serialize output]';
        }
      }

      // Extract reasoning summary from raw response if available
      if (response.raw) {
        try {
          const rawData =
            typeof response.raw === 'string' ? JSON.parse(response.raw) : response.raw;
          // Include reasoning in additional attributes
          if (rawData.reasoningTexts?.length > 0) {
            result.additionalAttributes = {
              'codex.reasoning.count': rawData.reasoningTexts.length,
              'codex.reasoning.summary': rawData.reasoningTexts.join('\n---\n').slice(0, 2000),
            };
          }
          // Include conversation history
          if (rawData.conversationMessages?.length > 0) {
            result.additionalAttributes = {
              ...result.additionalAttributes,
              'codex.conversation.message_count': rawData.conversationMessages.length,
            };
          }
          // Include item counts for observability
          if (rawData.items?.length > 0) {
            const itemCounts: Record<string, number> = {};
            for (const item of rawData.items) {
              itemCounts[item.type] = (itemCounts[item.type] || 0) + 1;
            }
            result.additionalAttributes = {
              ...result.additionalAttributes,
              'codex.items.total': rawData.items.length,
              'codex.items.breakdown': JSON.stringify(itemCounts),
            };
          }
        } catch {
          // Ignore parse errors
        }
      }

      return result;
    };

    // Wrap the API call in a GenAI span
    // withGenAISpan handles both exceptions and { error: ... } responses
    return withGenAISpan(
      spanContext,
      () => this.callApiInternal(prompt, context, callOptions, config),
      resultExtractor,
    );
  }

  /**
   * Internal implementation of callApi without tracing wrapper.
   * Context is available for future use (e.g., _context?.vars for template rendering,
   * _context?.bustCache for cache control, _context?.debug for debug mode).
   */
  private async callApiInternal(
    prompt: string,
    _context: CallApiContextParams | undefined,
    callOptions: CallApiOptionsParams | undefined,
    config: OpenAICodexSDKConfig,
  ): Promise<ProviderResponse> {
    // Get current trace context for deep tracing
    // This allows the Codex CLI to export its internal spans as children of our span
    const currentTraceparent = getTraceparent();

    // Prepare environment with OTEL config for deep tracing
    const env: Record<string, string> = this.prepareEnvironment(config, currentTraceparent);

    if (!this.apiKey && !env.OPENAI_API_KEY && !env.CODEX_API_KEY) {
      throw new Error(
        'OpenAI API key is not set. Set OPENAI_API_KEY or CODEX_API_KEY environment variable or add "apiKey" to provider config.',
      );
    }

    // Validate working directory
    if (config.working_dir) {
      this.validateWorkingDirectory(config.working_dir, config.skip_git_repo_check);
    }

    // Check abort signal
    if (callOptions?.abortSignal?.aborted) {
      return { error: 'OpenAI Codex SDK call aborted before it started' };
    }

    // Load SDK module (lazy)
    if (!this.codexModule) {
      this.codexModule = await loadCodexSDK();
    }

    // Deep tracing requires per-call instances (each call has unique TRACEPARENT)
    // This avoids race conditions where concurrent calls destroy shared instances
    let localInstance: any = undefined;
    const useLocalInstance = config.deep_tracing;

    if (useLocalInstance) {
      // Warn about ignored thread options (only once)
      if (
        (config.persist_threads || config.thread_id || (config.thread_pool_size ?? 0) > 1) &&
        !this.deepTracingWarningShown
      ) {
        logger.warn(
          '[CodexSDK] deep_tracing is incompatible with thread persistence. ' +
            'Thread options (persist_threads, thread_id, thread_pool_size) are ignored when deep_tracing is enabled.',
        );
        this.deepTracingWarningShown = true;
      }

      // Create a fresh instance for this call only (not cached)
      localInstance = new this.codexModule.Codex({
        env,
        ...(config.codex_path_override ? { codexPathOverride: config.codex_path_override } : {}),
        ...(config.base_url ? { baseUrl: config.base_url } : {}),
      });
    } else {
      // Standard caching path for non-deep-tracing mode
      // Exclude TRACEPARENT from hash to preserve thread persistence across traces
      const stableEnv = { ...env };
      delete stableEnv.TRACEPARENT;

      const envHash = crypto.createHash('sha256').update(JSON.stringify(stableEnv)).digest('hex');
      const envChanged = this.codexInstanceEnvHash !== envHash;

      // Initialize Codex instance - recreate only if stable config changed
      if (!this.codexInstance || envChanged) {
        if (envChanged && this.codexInstance) {
          logger.debug('[CodexSDK] Recreating instance due to configuration change');
          // Clean up old instance to prevent resource leaks
          try {
            if (typeof this.codexInstance.destroy === 'function') {
              await this.codexInstance.destroy();
            } else if (typeof this.codexInstance.cleanup === 'function') {
              await this.codexInstance.cleanup();
            } else if (typeof this.codexInstance.close === 'function') {
              await this.codexInstance.close();
            }
          } catch (cleanupError) {
            logger.warn('[CodexSDK] Error cleaning up old instance', { error: cleanupError });
          }
          // Clear thread pool when instance is recreated
          this.threads.clear();
        }
        // Create new instance with full environment
        this.codexInstance = new this.codexModule.Codex({
          env,
          ...(config.codex_path_override ? { codexPathOverride: config.codex_path_override } : {}),
          ...(config.base_url ? { baseUrl: config.base_url } : {}),
        });
        this.codexInstanceEnvHash = envHash;
      }
    }

    // Use local instance for deep_tracing, otherwise shared cached instance
    const activeInstance = useLocalInstance ? localInstance : this.codexInstance;

    // Guard against undefined instance (shouldn't happen, but defensive coding)
    if (!activeInstance) {
      throw new Error('Failed to create Codex instance - SDK module may have failed to load');
    }

    // Get or create thread (pass instance to avoid using stale this.codexInstance)
    const cacheKey = this.generateCacheKey(config, prompt);
    const thread = await this.getOrCreateThread(config, cacheKey, activeInstance);

    // Prepare run options
    const runOptions: any = {};
    if (config.output_schema) {
      runOptions.outputSchema = config.output_schema;
    }
    if (callOptions?.abortSignal) {
      runOptions.signal = callOptions.abortSignal;
    }

    // Execute turn
    try {
      const turn = config.enable_streaming
        ? await this.runStreaming(thread, prompt, runOptions, callOptions)
        : await thread.run(prompt, runOptions);

      // Extract response
      const output = turn.finalResponse || '';
      const raw = JSON.stringify(turn);

      const tokenUsage: ProviderResponse['tokenUsage'] = turn.usage
        ? {
            prompt: turn.usage.input_tokens + (turn.usage.cached_input_tokens || 0),
            completion: turn.usage.output_tokens,
            total:
              turn.usage.input_tokens +
              (turn.usage.cached_input_tokens || 0) +
              turn.usage.output_tokens,
          }
        : undefined;

      // Calculate cost from usage
      let cost = 0;
      if (tokenUsage && config.model) {
        const pricing = CODEX_MODEL_PRICING[config.model];
        if (pricing) {
          // Pricing is per 1M tokens
          const inputCost = (tokenUsage.prompt || 0) * (pricing.input / 1_000_000);
          const outputCost = (tokenUsage.completion || 0) * (pricing.output / 1_000_000);
          cost = inputCost + outputCost;
        }
      }

      logger.debug('OpenAI Codex SDK response', { output, usage: turn.usage });

      return {
        output,
        tokenUsage,
        cost,
        raw,
        sessionId: thread.id || 'unknown',
      };
    } catch (error: unknown) {
      const isAbort =
        (error instanceof Error && error.name === 'AbortError') ||
        callOptions?.abortSignal?.aborted;

      if (isAbort) {
        logger.warn('OpenAI Codex SDK call aborted');
        return { error: 'OpenAI Codex SDK call aborted' };
      }

      // Safely extract error message - error may not be an Error object
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Error calling OpenAI Codex SDK', { error: errorMessage });
      return {
        error: `Error calling OpenAI Codex SDK: ${errorMessage}`,
      };
    } finally {
      // Clean up ephemeral threads (only for non-deep-tracing mode)
      if (!config.deep_tracing && !config.persist_threads && !config.thread_id && cacheKey) {
        this.threads.delete(cacheKey);
      }

      // Clean up local instance used for deep tracing (not shared, safe to destroy)
      if (useLocalInstance && localInstance) {
        try {
          if (typeof localInstance.destroy === 'function') {
            await localInstance.destroy();
          } else if (typeof localInstance.cleanup === 'function') {
            await localInstance.cleanup();
          } else if (typeof localInstance.close === 'function') {
            await localInstance.close();
          }
        } catch (cleanupError) {
          logger.debug('[CodexSDK] Error cleaning up local instance', { error: cleanupError });
        }
      }
    }
  }
}
