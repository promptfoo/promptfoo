import crypto from 'crypto';
import fs from 'fs';
import { createRequire } from 'node:module';
import path from 'path';

import dedent from 'dedent';
import cliState from '../../cliState';
import { getEnvString } from '../../envars';
import { getDirectory, importModule } from '../../esm';
import logger from '../../logger';

import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../../types/index';
import type { EnvOverrides } from '../../types/env';

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

/**
 * Sandbox mode for Codex execution.
 * Controls what level of access the agent has to the filesystem.
 */
export type SandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access';

/**
 * Model reasoning effort level.
 * Controls how much reasoning the model should use.
 */
export type ModelReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh';

/**
 * Approval policy for Codex operations.
 * Controls when user approval is required.
 */
export type ApprovalPolicy = 'never' | 'on-request' | 'on-failure' | 'untrusted';

export interface OpenAICodexSDKConfig {
  /**
   * OpenAI API key
   */
  apiKey?: string;

  /**
   * Custom base URL for API requests (useful for proxies or custom endpoints)
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
   * Model to use (e.g., 'codex-max', 'gpt-4o', 'o3-mini')
   * As of v0.65.0, Codex Max is the default model.
   */
  model?: string;

  /**
   * Sandbox mode for execution environment.
   * - 'read-only': Agent can only read files (safest)
   * - 'workspace-write': Agent can write to working directory (default)
   * - 'danger-full-access': Agent has full filesystem access (use with caution)
   */
  sandbox_mode?: SandboxMode;

  /**
   * Model reasoning effort level.
   * Controls how much reasoning the model should use for complex tasks.
   * - 'minimal': Least reasoning, fastest responses
   * - 'low': Light reasoning
   * - 'medium': Balanced reasoning
   * - 'high': Most thorough reasoning
   */
  model_reasoning_effort?: ModelReasoningEffort;

  /**
   * Enable network access for the agent.
   * When true, allows the agent to make network requests.
   */
  network_access_enabled?: boolean;

  /**
   * Enable web search capability.
   * When true, allows the agent to perform web searches.
   */
  web_search_enabled?: boolean;

  /**
   * Approval policy for operations.
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
}

/**
 * Helper to resolve the path to @openai/codex-sdk from a given base directory.
 * Handles ESM-only packages that don't work with require.resolve().
 */
function resolveCodexSDKPath(baseDir: string): string | null {
  // The SDK's ESM entry point
  const esmEntryPoint = path.join(
    baseDir,
    'node_modules',
    '@openai',
    'codex-sdk',
    'dist',
    'index.js',
  );

  // Check if the ESM entry point exists
  if (fs.existsSync(esmEntryPoint)) {
    return esmEntryPoint;
  }

  // Try using createRequire for packages that support CommonJS resolution
  try {
    const resolveFrom = path.join(baseDir, 'package.json');
    const require = createRequire(resolveFrom);
    return require.resolve('@openai/codex-sdk');
  } catch {
    return null;
  }
}

/**
 * Helper to load the OpenAI Codex SDK ESM module
 * Uses importModule utility which handles ESM loading in CommonJS environments
 *
 * Resolution order:
 * 1. Promptfoo's own node_modules (for when SDK is installed with promptfoo)
 * 2. User's project node_modules (cliState.basePath)
 * 3. Current working directory
 */
async function loadCodexSDK(): Promise<any> {
  const errors: string[] = [];

  // Try promptfoo's installation directory first
  // This handles the common case where the SDK is installed as a dependency of promptfoo
  try {
    const promptfooDir = getDirectory();
    // getDirectory() returns the 'src' directory, go up one level to get project root
    const promptfooRoot = path.resolve(promptfooDir, '..');
    const codexPath = resolveCodexSDKPath(promptfooRoot);
    if (codexPath) {
      logger.debug(`Resolved @openai/codex-sdk from promptfoo installation: ${codexPath}`);
      return await importModule(codexPath);
    }
    throw new Error('Package not found in promptfoo node_modules');
  } catch (err) {
    errors.push(`Promptfoo installation: ${err instanceof Error ? err.message : String(err)}`);
    logger.debug(`Failed to load @openai/codex-sdk from promptfoo installation: ${err}`);
  }

  // Try user's project directory (cliState.basePath)
  if (cliState.basePath && path.isAbsolute(cliState.basePath)) {
    try {
      const codexPath = resolveCodexSDKPath(cliState.basePath);
      if (codexPath) {
        logger.debug(`Resolved @openai/codex-sdk from user project: ${codexPath}`);
        return await importModule(codexPath);
      }
      throw new Error('Package not found in user project node_modules');
    } catch (err) {
      errors.push(`User project (${cliState.basePath}): ${err instanceof Error ? err.message : String(err)}`);
      logger.debug(`Failed to load @openai/codex-sdk from user project: ${err}`);
    }
  }

  // Try current working directory as fallback
  try {
    const codexPath = resolveCodexSDKPath(process.cwd());
    if (codexPath) {
      logger.debug(`Resolved @openai/codex-sdk from cwd: ${codexPath}`);
      return await importModule(codexPath);
    }
    throw new Error('Package not found in current directory node_modules');
  } catch (err) {
    errors.push(`Current directory: ${err instanceof Error ? err.message : String(err)}`);
    logger.debug(`Failed to load @openai/codex-sdk from cwd: ${err}`);
  }

  // All resolution attempts failed
  logger.error(`Failed to load OpenAI Codex SDK. Tried locations:\n${errors.join('\n')}`);
  throw new Error(
    dedent`The @openai/codex-sdk package is required but not installed.

    This package may have a proprietary license and is not installed by default.

    To use the OpenAI Codex SDK provider, install it with:
      npm install @openai/codex-sdk

    Requires Node.js 18+.

    For more information, see: https://www.promptfoo.dev/docs/providers/openai-codex-sdk/`,
  );
}

// Pricing per 1M tokens (as of November 2025)
// See: https://openai.com/pricing
const CODEX_MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-5.1-codex': { input: 2.0, output: 8.0 },
  'gpt-5.1-codex-max': { input: 3.0, output: 12.0 },
  'gpt-5.1-codex-mini': { input: 0.5, output: 2.0 },
  'gpt-5-codex': { input: 2.0, output: 8.0 },
  'gpt-5-codex-mini': { input: 0.5, output: 2.0 },
  'gpt-5': { input: 2.0, output: 8.0 },
  'gpt-4o': { input: 2.5, output: 10.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4-turbo': { input: 10.0, output: 30.0 },
  'gpt-4': { input: 30.0, output: 60.0 },
  'o3-mini': { input: 1.1, output: 4.4 },
  o1: { input: 15.0, output: 60.0 },
  'o1-mini': { input: 3.0, output: 12.0 },
};

export class OpenAICodexSDKProvider implements ApiProvider {
  static OPENAI_MODELS = [
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

    // Create new thread with all ThreadOptions
    const thread = this.codexInstance!.startThread({
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

    // Extract text from agent_message items for final response
    const agentMessages = items.filter((i) => i.type === 'agent_message');
    const finalResponse =
      agentMessages.length > 0 ? agentMessages.map((i) => i.text).join('\n') : '';

    return {
      finalResponse,
      items,
      usage,
    };
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
        ...(config.base_url ? { baseUrl: config.base_url } : {}),
        ...(this.apiKey ? { apiKey: this.apiKey } : {}),
      });
    }

    // Get or create thread
    const cacheKey = this.generateCacheKey(config, prompt);
    const thread = await this.getOrCreateThread(config, cacheKey);

    // Prepare run options (TurnOptions)
    const runOptions: any = {};
    if (config.output_schema) {
      runOptions.outputSchema = config.output_schema;
    }
    // Pass abort signal to SDK
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
