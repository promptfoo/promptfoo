import { createRequire } from 'node:module';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import dedent from 'dedent';
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
 * OpenAI Codex SDK Provider
 *
 * This provider requires the @openai/codex-sdk package, which may have a
 * proprietary license and is not installed by default. Users must install it separately:
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

export interface OpenAICodexSDKConfig {
  apiKey?: string;

  /**
   * Working directory for Codex to operate in
   * Defaults to process.cwd()
   */
  working_dir?: string;

  /**
   * Skip Git repository check (Codex requires Git by default)
   */
  skip_git_repo_check?: boolean;

  /**
   * Path to custom codex binary
   */
  codex_path_override?: string;

  /**
   * Model to use (e.g., 'gpt-4', 'gpt-4o', 'o3-mini')
   */
  model?: string;

  /**
   * Fallback model if primary model fails
   */
  fallback_model?: string;

  /**
   * Maximum tokens for response
   */
  max_tokens?: number;

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
   * Custom system instructions
   */
  system_prompt?: string;

  /**
   * Enable streaming events (default: false for simplicity)
   */
  enable_streaming?: boolean;
}

/**
 * Helper to load the OpenAI Codex SDK ESM module
 * Uses the same pattern as other providers for resolving npm packages
 */
async function loadCodexSDK(): Promise<any> {
  try {
    const basePath =
      cliState.basePath && path.isAbsolute(cliState.basePath) ? cliState.basePath : process.cwd();
    const resolveFrom = path.join(basePath, 'package.json');
    const require = createRequire(resolveFrom);
    const codexPath = require.resolve('@openai/codex-sdk');
    return importModule(codexPath);
  } catch (err) {
    logger.error(`Failed to load OpenAI Codex SDK: ${err}`);
    if ((err as any).stack) {
      logger.error((err as any).stack);
    }
    throw new Error(
      dedent`The @openai/codex-sdk package is required but not installed.

      This package may have a proprietary license and is not installed by default.

      To use the OpenAI Codex SDK provider, install it with:
        npm install @openai/codex-sdk

      Requires Node.js 18+.

      For more information, see: https://www.promptfoo.dev/docs/providers/openai-codex-sdk/`,
    );
  }
}

export class OpenAICodexSDKProvider implements ApiProvider {
  static OPENAI_MODELS = [
    'gpt-4',
    'gpt-4-turbo',
    'gpt-4o',
    'gpt-4o-mini',
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
  private threads: Map<string, any> = new Map();

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

    if (
      this.config.fallback_model &&
      !OpenAICodexSDKProvider.OPENAI_MODELS.includes(this.config.fallback_model)
    ) {
      logger.warn(
        `Using unknown model for OpenAI Codex SDK fallback: ${this.config.fallback_model}`,
      );
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
    this.threads.clear();
  }

  private prepareEnvironment(config: OpenAICodexSDKConfig): Record<string, string> {
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

  private async getOrCreateThread(config: OpenAICodexSDKConfig, cacheKey?: string): Promise<any> {
    // Resume specific thread
    if (config.thread_id) {
      const cached = this.threads.get(config.thread_id);
      if (cached) {
        return cached;
      }

      const thread = this.codexInstance!.resumeThread(config.thread_id);
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
    const thread = this.codexInstance!.startThread({
      workingDirectory: config.working_dir,
      skipGitRepoCheck: config.skip_git_repo_check ?? false,
    });

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

    for await (const event of events) {
      // Check abort signal
      if (callOptions?.abortSignal?.aborted) {
        throw new Error('AbortError');
      }

      switch (event.type) {
        case 'item.completed':
          items.push(event.item);
          logger.debug('Codex item completed', { item: event.item });
          break;
        case 'turn.completed':
          usage = event.usage;
          logger.debug('Codex turn completed', { usage });
          break;
      }
    }

    return {
      finalResponse: items.map((i) => i.content).join('\n'),
      items,
      usage,
    };
  }

  private generateCacheKey(config: OpenAICodexSDKConfig, prompt: string): string {
    const keyData = {
      working_dir: config.working_dir,
      model: config.model,
      output_schema: config.output_schema,
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

    // Prepare environment
    const env: Record<string, string> = this.prepareEnvironment(config);

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

    // Initialize Codex instance (lazy)
    if (!this.codexInstance) {
      this.codexInstance = new this.codexModule.Codex({
        env,
        ...(config.codex_path_override ? { codexPathOverride: config.codex_path_override } : {}),
      });
    }

    // Get or create thread
    const cacheKey = this.generateCacheKey(config, prompt);
    const thread = await this.getOrCreateThread(config, cacheKey);

    // Prepare run options
    const runOptions: any = {};
    if (config.output_schema) {
      runOptions.outputSchema = config.output_schema;
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
            prompt: turn.usage.prompt_tokens,
            completion: turn.usage.completion_tokens,
            total: turn.usage.total_tokens,
          }
        : undefined;

      // TODO: Calculate cost from usage
      const cost = 0;

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
