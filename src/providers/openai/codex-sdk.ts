import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import dedent from 'dedent';
import cliState from '../../cliState';
import { getEnvString } from '../../envars';
import { importModule, resolvePackageEntryPoint } from '../../esm';
import logger from '../../logger';
import { trace, SpanKind, SpanStatusCode } from '@opentelemetry/api';
import {
  withGenAISpan,
  getTraceparent,
  sanitizeBody,
  type GenAISpanContext,
  type GenAISpanResult,
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
 * Reasoning effort levels
 */
export type ReasoningEffort = 'low' | 'medium' | 'high';

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
   * Model to use (e.g., 'codex', 'codex-mini', 'gpt-5.2', 'gpt-4o', 'o3-mini')
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
   * Model reasoning intensity
   * - 'low': Light reasoning, faster responses
   * - 'medium': Balanced (default)
   * - 'high': Thorough reasoning for complex tasks
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
  // GPT-4 models
  'gpt-4o': { input: 2.5, output: 10.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4-turbo': { input: 10.0, output: 30.0 },
  'gpt-4': { input: 30.0, output: 60.0 },
  // Reasoning models
  'o3-mini': { input: 1.1, output: 4.4 },
  o1: { input: 15.0, output: 60.0 },
  'o1-mini': { input: 3.0, output: 12.0 },
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
    // GPT-4 models
    'gpt-4',
    'gpt-4-turbo',
    'gpt-4o',
    'gpt-4o-mini',
    // Reasoning models
    'o1',
    'o1-mini',
    'o3-mini',
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
    // Only enabled when config.deep_tracing is true AND we have a trace context
    // Without deep_tracing, we still capture spans at the provider level but don't
    // inject OTEL vars into CLI (which would cause export errors if no collector)
    if (traceparent && config.deep_tracing) {
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
      // W3C Trace Context - always set to current trace for proper parent-child linking
      sortedEnv.TRACEPARENT = traceparent;
      logger.debug('[CodexSDK] Injecting OTEL config for deep tracing', {
        traceparent,
        endpoint: sortedEnv.OTEL_EXPORTER_OTLP_ENDPOINT,
        userConfigured: {
          endpoint: !!env.OTEL_EXPORTER_OTLP_ENDPOINT,
          protocol: !!env.OTEL_EXPORTER_OTLP_PROTOCOL,
          serviceName: !!env.OTEL_SERVICE_NAME,
        },
      });
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
    };
  }

  private async getOrCreateThread(config: OpenAICodexSDKConfig, cacheKey?: string): Promise<any> {
    const threadOptions = this.buildThreadOptions(config);

    // Resume specific thread
    if (config.thread_id) {
      const cached = this.threads.get(config.thread_id);
      if (cached) {
        return cached;
      }

      const thread = this.codexInstance!.resumeThread(config.thread_id, threadOptions);
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
    const thread = this.codexInstance!.startThread(threadOptions);

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
          throw new Error('AbortError');
        }

        switch (event.type) {
          case 'item.started': {
            // Create a child span for this item
            const item = event.item;
            const spanName = this.getSpanNameForItem(item);
            const span = tracer.startSpan(spanName, {
              kind: SpanKind.INTERNAL,
              attributes: {
                'codex.item.id': item.id,
                'codex.item.type': item.type,
                ...this.getAttributesForItem(item),
              },
            });
            activeSpans.set(item.id, span);
            itemStartTimes.set(item.id, eventTime);
            logger.debug('Codex item started', { itemId: item.id, type: item.type });
            break;
          }
          case 'item.completed': {
            const item = event.item;
            items.push(item);

            // Collect reasoning text for summary
            if (item.type === 'reasoning' && item.text) {
              reasoningTexts.push(item.text);
            }

            // Collect agent messages for conversation history
            if (item.type === 'agent_message' && item.text) {
              conversationMessages.push({ role: 'assistant', content: item.text });
            }

            // Get or create span for this item
            // Some item types (like reasoning) may only emit item.completed without item.started
            let span = activeSpans.get(item.id);
            const hadStartEvent = span !== undefined;

            if (!span) {
              // Create span retroactively for items without item.started event
              // Use lastEventTime as approximate start time
              const spanName = this.getSpanNameForItem(item);
              span = tracer.startSpan(spanName, {
                kind: SpanKind.INTERNAL,
                startTime: lastEventTime,
                attributes: {
                  'codex.item.id': item.id,
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
            const startTime = itemStartTimes.get(item.id) || lastEventTime;
            const durationMs = eventTime - startTime;
            span.setAttribute('codex.duration_ms', durationMs);
            span.setAttribute('codex.had_start_event', hadStartEvent);

            // Add span events for rich content types (sanitized to prevent secret leakage)
            if (item.type === 'reasoning' && item.text) {
              span.addEvent('reasoning', {
                'codex.reasoning.text': this.sanitizeText(item.text, 4096),
                'codex.reasoning.full_length': item.text.length,
              });
            }
            if (item.type === 'agent_message' && item.text) {
              span.addEvent('message', {
                'codex.message.text': this.sanitizeText(item.text, 4096),
                'codex.message.full_length': item.text.length,
              });
            }
            if (item.type === 'command_execution' && item.aggregated_output) {
              span.addEvent('output', {
                'codex.command.output': this.sanitizeText(item.aggregated_output, 4096),
                'codex.command.output_length': item.aggregated_output.length,
              });
            }

            // Set status based on item
            if (item.status === 'failed' || item.type === 'error') {
              span.setStatus({
                code: SpanStatusCode.ERROR,
                message: item.message || item.error?.message || 'Item failed',
              });
            } else {
              span.setStatus({ code: SpanStatusCode.OK });
            }

            span.end();
            activeSpans.delete(item.id);
            itemStartTimes.delete(item.id);
            logger.debug('Codex item completed', { itemId: item.id, type: item.type, durationMs });
            break;
          }
          case 'turn.completed':
            usage = event.usage;
            logger.debug('Codex turn completed', { usage });
            break;
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
      case 'command_execution':
        return `exec ${item.command?.split(' ')[0] || 'command'}`;
      case 'file_change':
        return `file ${item.changes?.[0]?.kind || 'change'}`;
      case 'mcp_tool_call':
        return `mcp ${item.server}/${item.tool}`;
      case 'agent_message':
        return 'agent response';
      case 'reasoning':
        return 'reasoning';
      case 'web_search':
        return `search "${item.query?.slice(0, 30) || ''}"`;
      case 'todo_list':
        return 'todo update';
      case 'error':
        return 'error';
      default:
        return `codex.${item.type || 'unknown'}`;
    }
  }

  /**
   * Sanitize and truncate text content for span attributes.
   * Prevents secret leakage and controls attribute size.
   */
  private sanitizeText(text: string, maxLength: number = 1000): string {
    const sanitized = sanitizeBody(text);
    if (sanitized.length <= maxLength) {
      return sanitized;
    }
    return sanitized.slice(0, maxLength - 15) + '... [truncated]';
  }

  /**
   * Sanitize a file path to remove PII (usernames from home directories).
   * Converts absolute paths like /Users/john.doe/projects/foo/bar.ts to ~/projects/foo/bar.ts
   */
  private sanitizePath(filePath: string): string {
    // Patterns for home directories on various systems
    // macOS: /Users/username/
    // Linux: /home/username/
    // Windows: C:\Users\username\
    const homePatterns = [/^\/Users\/[^/]+\//, /^\/home\/[^/]+\//, /^[A-Z]:\\Users\\[^\\]+\\/i];

    let sanitized = filePath;
    for (const pattern of homePatterns) {
      sanitized = sanitized.replace(pattern, '~/');
    }
    return sanitized;
  }

  /**
   * Get attributes for a Codex item at start
   */
  private getAttributesForItem(item: any): Record<string, string | number | boolean> {
    const attrs: Record<string, string | number | boolean> = {};

    switch (item.type) {
      case 'command_execution':
        // Sanitize commands as they may contain credentials (API keys in curl, env vars, etc.)
        if (item.command) {
          attrs['codex.command'] = this.sanitizeText(item.command, 2000);
        }
        break;
      case 'mcp_tool_call':
        // Server and tool names are safe identifiers, no sanitization needed
        if (item.server) {
          attrs['codex.mcp.server'] = item.server;
        }
        if (item.tool) {
          attrs['codex.mcp.tool'] = item.tool;
        }
        break;
      case 'web_search':
        // Sanitize search queries as they may contain sensitive information
        if (item.query) {
          attrs['codex.search.query'] = this.sanitizeText(item.query, 500);
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
        if (item.exit_code !== undefined) {
          attrs['codex.exit_code'] = item.exit_code;
        }
        if (item.status) {
          attrs['codex.status'] = item.status;
        }
        // Sanitize and truncate output to prevent secret leakage
        if (item.aggregated_output) {
          attrs['codex.output'] = this.sanitizeText(item.aggregated_output, 1000);
        }
        break;
      case 'file_change':
        if (item.status) {
          attrs['codex.status'] = item.status;
        }
        if (item.changes?.length) {
          attrs['codex.files_changed'] = item.changes.length;
          // Sanitize paths to remove usernames/PII and truncate total length
          const sanitizedPaths = item.changes.map((c: any) => this.sanitizePath(c.path));
          attrs['codex.files'] = sanitizedPaths.join(', ').slice(0, 500);
        }
        break;
      case 'mcp_tool_call':
        if (item.status) {
          attrs['codex.status'] = item.status;
        }
        if (item.error?.message) {
          attrs['codex.error'] = this.sanitizeText(item.error.message, 500);
        }
        break;
      case 'agent_message':
        // Sanitize and truncate message
        if (item.text) {
          attrs['codex.message'] = this.sanitizeText(item.text, 500);
        }
        break;
      case 'reasoning':
        // Sanitize and truncate reasoning
        if (item.text) {
          attrs['codex.reasoning'] = this.sanitizeText(item.text, 500);
        }
        break;
      case 'error':
        if (item.message) {
          attrs['codex.error'] = this.sanitizeText(item.message, 500);
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
      testIndex: context?.test?.vars?.__testIdx as number | undefined,
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
        result.responseBody =
          typeof response.output === 'string' ? response.output : JSON.stringify(response.output);
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

    // Compute hash of environment for instance caching
    // Note: deep_tracing is INCOMPATIBLE with thread persistence
    // The CLI only sees TRACEPARENT at spawn time - subsequent calls would have wrong parent span
    // When deep_tracing is enabled, we MUST recreate the instance for each call to get correct spans
    const stableEnv = { ...env };
    if (config.deep_tracing) {
      // Keep full TRACEPARENT in hash - forces instance recreation per-call
      // This ensures each call's child spans are correctly linked to the right parent span
      // Thread persistence (persist_threads, thread_id, thread_pool_size) is disabled in this mode
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
    } else {
      // When NOT doing deep tracing, exclude TRACEPARENT entirely
      // This preserves thread persistence across traces
      delete stableEnv.TRACEPARENT;
    }
    // OTEL config vars stay in hash - they're configuration, not per-request context
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
      // Create new instance with full environment (including TRACEPARENT for initial trace linking)
      this.codexInstance = new this.codexModule.Codex({
        env,
        ...(config.codex_path_override ? { codexPathOverride: config.codex_path_override } : {}),
        ...(config.base_url ? { baseUrl: config.base_url } : {}),
      });
      this.codexInstanceEnvHash = envHash;
    }

    // Get or create thread
    const cacheKey = this.generateCacheKey(config, prompt);
    const thread = await this.getOrCreateThread(config, cacheKey);

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
    } catch (error: any) {
      const isAbort = error?.name === 'AbortError' || callOptions?.abortSignal?.aborted;

      if (isAbort) {
        logger.warn('OpenAI Codex SDK call aborted');
        return { error: 'OpenAI Codex SDK call aborted' };
      }

      logger.error('Error calling OpenAI Codex SDK', { error: error.message });
      return {
        error: `Error calling OpenAI Codex SDK: ${error.message}`,
      };
    } finally {
      // Clean up ephemeral threads
      if (!config.persist_threads && !config.thread_id && cacheKey) {
        this.threads.delete(cacheKey);
      }
    }
  }
}
