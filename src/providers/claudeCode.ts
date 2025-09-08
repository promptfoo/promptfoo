import { createRequire } from 'node:module';
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
import { ANTHROPIC_MODELS } from './anthropic/util';
import { transformMCPConfigToClaudeCode } from './mcp/transform';
import { MCPConfig } from './mcp/types';
import type { Options as QueryOptions } from '@anthropic-ai/claude-code';

import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../types';
import type { EnvOverrides } from '../types/env';

/**
 * Claude Code SDK Provider
 *
 * Default permissions are restricted so it can be treated similarly to a plain chat API provider with standard input/output and no side effects. File reads/grep/glob/ls are allowed, but no file system writes or system calls by default. User can override these restrictions with 'custom_allowed_tools', 'append_allowed_tools', 'disallowed_tools', and 'permission_mode'
 *
 * Runs in isolated working directory (either provided by the user or a temp dir)
 *
 * To test with side effects (file writes, system calls, etc.), user can override permissions and use a custom working directory. They're then responsible for setup/teardown of the custom working directory, as well as security/safety considerations.
 *
 * MCP server connection details are passed through from config. strict_mcp_config is true by default to only allow MCP servers that are explicitly configured, but user can override.
 */

// When a working directory is provided, we allow read-only tools by default (when no working directory is provided, default to no tools)
export const FS_READONLY_ALLOWED_TOOLS = ['Read', 'Grep', 'Glob', 'LS'].sort(); // sort and export for tests

// Claude Code SDK supports these model aliases in addition to full model names
// See: https://docs.anthropic.com/en/docs/claude-code/model-config
export const CLAUDE_CODE_MODEL_ALIASES = [
  'default',
  'sonnet',
  'opus',
  'haiku',
  'sonnet[1m]',
  'opusplan',
];

/**
 * Helper to load the Claude Code SDK ESM module
 * Uses the same pattern as other providers for resolving npm packages
 */
async function loadClaudeCodeSDK(): Promise<typeof import('@anthropic-ai/claude-code')> {
  const require = createRequire(path.resolve(cliState.basePath || ''));
  const claudeCodePath = require.resolve('@anthropic-ai/claude-code');
  return importModule(claudeCodePath);
}

export interface ClaudeCodeOptions {
  apiKey?: string;

  /**
   * 'working_dir' allows user to point to a pre-prepared directory with desired files/directories in place
   * If not supplied, we'll use an empty temp dir for isolation
   */
  working_dir?: string;

  /**
   * 'model' and 'fallback_model' are optional
   * if not supplied, Claude Code SDK uses default models
   */
  model?: string;
  fallback_model?: string;

  max_turns?: number;
  max_thinking_tokens?: number;

  mcp?: MCPConfig;
  strict_mcp_config?: boolean; // only allow MCP servers that are explicitly configured—no discovery; true by default

  /**
   * User can set more dangerous 'acceptEdits' or 'bypassPermissions' if they know what they're doing,
   */
  permission_mode?: 'default' | 'plan' | 'acceptEdits' | 'bypassPermissions';

  custom_system_prompt?: string;
  append_system_prompt?: string;

  /**
   * Since we run CC by default with a readonly set of allowed_tools, user can either fully replace the list ('custom_allowed_tools'), append to it ('append_allowed_tools'), or allow all tools ('allow_all_tools')
   */
  custom_allowed_tools?: string[];
  append_allowed_tools?: string[];
  allow_all_tools?: boolean;

  /**
   * 'disallowed_tools' is passed through as is; it always takes precedence over 'allowed_tools'
   */
  disallowed_tools?: string[];
}

export class ClaudeCodeSDKProvider implements ApiProvider {
  static ANTHROPIC_MODELS = ANTHROPIC_MODELS;
  static ANTHROPIC_MODELS_NAMES = ANTHROPIC_MODELS.map((model) => model.id);

  config: ClaudeCodeOptions;
  env?: EnvOverrides;
  apiKey?: string;

  // Only SDK and Anthropic are supported for now
  // Could later potentially support Claude Code via external CLI calls, as well as Bedrock/Vertex providers
  private providerId = 'anthropic:claude-code';
  private claudeCodeModule?: typeof import('@anthropic-ai/claude-code');

  constructor(
    options: {
      id?: string;
      config?: ClaudeCodeOptions;
      env?: EnvOverrides;
    } = {},
  ) {
    const { config, env, id } = options;
    this.config = config ?? {};
    this.env = env;
    this.apiKey = this.getApiKey();
    this.providerId = id ?? this.providerId;

    if (
      this.config.model &&
      !ClaudeCodeSDKProvider.ANTHROPIC_MODELS_NAMES.includes(this.config.model) &&
      !CLAUDE_CODE_MODEL_ALIASES.includes(this.config.model)
    ) {
      logger.warn(`Using unknown model for Claude Code SDK: ${this.config.model}`);
    }

    if (
      this.config.fallback_model &&
      !ClaudeCodeSDKProvider.ANTHROPIC_MODELS_NAMES.includes(this.config.fallback_model) &&
      !CLAUDE_CODE_MODEL_ALIASES.includes(this.config.fallback_model)
    ) {
      logger.warn(
        `Using unknown model for Claude Code SDK fallback: ${this.config.fallback_model}`,
      );
    }
  }

  id(): string {
    return this.providerId;
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    // Merge configs from the provider and the prompt
    const config: ClaudeCodeOptions = {
      ...this.config,
      ...context?.prompt?.config,
    };

    // Set up env for the Claude Code SDK call
    // Pass through entire environment like claude-code CLI does, with EnvOverrides taking precedence
    // Sort keys for stable cache key generation
    const env: Record<string, string> = {};
    for (const key of Object.keys(process.env).sort()) {
      if (process.env[key] !== undefined) {
        env[key] = process.env[key];
      }
    }

    // EnvOverrides take precedence over process.env
    if (this.env) {
      for (const key of Object.keys(this.env).sort()) {
        const value = this.env[key as keyof typeof this.env];
        if (value !== undefined) {
          env[key] = value;
        }
      }
    }

    // Ensure API key is available to Claude Code SDK
    if (this.apiKey) {
      env.ANTHROPIC_API_KEY = this.apiKey;
    }

    // Could potentially do more to validate credentials for Bedrock/Vertex here, but Anthropic key is the main use case
    if (!this.apiKey && !(env.CLAUDE_CODE_USE_BEDROCK || env.CLAUDE_CODE_USE_VERTEX)) {
      throw new Error(
        dedent`Anthropic API key is not set. Set the ANTHROPIC_API_KEY environment variable or add "apiKey" to the provider config.

        Use CLAUDE_CODE_USE_BEDROCK or CLAUDE_CODE_USE_VERTEX environment variables to use Bedrock or Vertex instead.`,
      );
    }

    // Set up allowed tools for the Claude Code SDK call
    // Check for conflicting config options (may want a zod schema in the future)
    if (
      config.allow_all_tools &&
      ('custom_allowed_tools' in config || 'append_allowed_tools' in config)
    ) {
      throw new Error(
        'Cannot specify both allow_all_tools and custom_allowed_tools or append_allowed_tools',
      );
    }
    if ('custom_allowed_tools' in config && 'append_allowed_tools' in config) {
      throw new Error('Cannot specify both custom_allowed_tools and append_allowed_tools');
    }

    // De-dupe and sort allowed/disallowed tools for cache key consistency
    const defaultAllowedTools = config.working_dir ? FS_READONLY_ALLOWED_TOOLS : [];

    let allowedTools = config.allow_all_tools ? undefined : defaultAllowedTools;
    if ('custom_allowed_tools' in config) {
      allowedTools = Array.from(new Set(config.custom_allowed_tools ?? [])).sort();
    } else if (config.append_allowed_tools) {
      allowedTools = Array.from(
        new Set([...defaultAllowedTools, ...config.append_allowed_tools]),
      ).sort();
    }

    const disallowedTools = config.disallowed_tools
      ? Array.from(new Set(config.disallowed_tools)).sort()
      : undefined;

    let isTempDir = false;
    let workingDir: string | undefined;

    if (config.working_dir) {
      workingDir = config.working_dir;
    } else {
      isTempDir = true;
    }

    // Just the keys we'll use to compute the cache key first
    // Lets us avoid unnecessary work and cleanup if there's a cache hit
    const cacheKeyQueryOptions: Omit<QueryOptions, 'abortController' | 'mcpServers' | 'cwd'> = {
      maxTurns: config.max_turns,
      model: config.model,
      fallbackModel: config.fallback_model,
      strictMcpConfig: config.strict_mcp_config ?? true, // only allow MCP servers that are explicitly configured - true by default
      permissionMode: config.permission_mode,
      customSystemPrompt: config.custom_system_prompt,
      appendSystemPrompt: config.append_system_prompt,
      maxThinkingTokens: config.max_thinking_tokens,
      allowedTools,
      disallowedTools,
      env,
    };

    let shouldCache = isCacheEnabled();

    // If we're caching, only read from cache if we're not busting it (we can still write to it when busting)

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
        const stringified = JSON.stringify({
          prompt,
          cacheKeyQueryOptions,
          workingDirFingerprint,
        });
        // Hash to avoid super long cache keys or including sensitive env vars in the key
        const hash = crypto.createHash('sha256').update(stringified).digest('hex');
        cacheKey = `anthropic:claude-code:${hash}`;
      }
    }

    const shouldReadCache = shouldCache && !context?.bustCache;
    const shouldWriteCache = shouldCache;

    if (shouldReadCache && cache && cacheKey) {
      try {
        const cachedResponse = await cache.get<string | undefined>(cacheKey);
        if (cachedResponse) {
          logger.debug(
            `Returning cached response for ${prompt} (cache key: ${cacheKey}): ${cachedResponse}`,
          );
          return JSON.parse(cachedResponse);
        }
      } catch (error) {
        logger.error(`Error getting cached response for ${prompt}: ${String(error)}`);
      }
    }

    // Transform MCP config to Claude Code MCP servers
    const mcpServers = config.mcp ? transformMCPConfigToClaudeCode(config.mcp) : {};

    if (workingDir) {
      // verify the working dir exists and is a directory
      let stats: fs.Stats;
      try {
        stats = fs.statSync(workingDir);
      } catch (err: any) {
        throw new Error(
          `Working dir ${config.working_dir} does not exist or isn't accessible: ${err.message}`,
        );
      }
      if (!stats.isDirectory()) {
        throw new Error(`Working dir ${config.working_dir} is not a directory`);
      }
    } else if (isTempDir) {
      // use a temp dir
      workingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-claude-code-'));
    }

    // Make sure we didn't already abort
    if (callOptions?.abortSignal?.aborted) {
      return { error: 'Claude Code SDK call aborted before it started' };
    }

    // Propagate abort signal to the Claude Code SDK call
    const abortController = new AbortController();
    let abortHandler: (() => void) | undefined;
    if (callOptions?.abortSignal) {
      abortHandler = () => {
        abortController.abort(callOptions.abortSignal!.reason);
      };
      callOptions.abortSignal.addEventListener('abort', abortHandler);
    }

    // Make the Claude Code SDK call
    const options: QueryOptions = {
      ...cacheKeyQueryOptions,
      abortController,
      mcpServers,
      cwd: workingDir,
    };
    const queryParams = { prompt, options };
    logger.debug(`Calling Claude Code SDK: ${JSON.stringify(queryParams)}`);

    try {
      // Dynamically import the ESM module once and cache it
      if (!this.claudeCodeModule) {
        this.claudeCodeModule = await loadClaudeCodeSDK();
      }

      const res = await this.claudeCodeModule.query(queryParams);

      for await (const msg of res) {
        if (msg.type == 'result') {
          const raw = JSON.stringify(msg);
          const tokenUsage: ProviderResponse['tokenUsage'] = {
            prompt: msg.usage?.input_tokens,
            completion: msg.usage?.output_tokens,
            total:
              msg.usage?.input_tokens && msg.usage?.output_tokens
                ? msg.usage?.input_tokens + msg.usage?.output_tokens
                : undefined,
          };
          const cost = msg.total_cost_usd ?? 0;
          const sessionId = msg.session_id;
          if (msg.subtype == 'success') {
            logger.debug(`Claude Code SDK response: ${raw}`);
            const response = {
              output: msg.result,
              tokenUsage,
              cost,
              raw,
              sessionId,
            };

            if (shouldWriteCache && cache && cacheKey) {
              try {
                await cache.set(cacheKey, JSON.stringify(response));
              } catch (error) {
                logger.error(`Error caching response for ${prompt}: ${String(error)}`);
              }
            }
            return response;
          } else {
            return {
              error: `Claude Code SDK call failed: ${msg.subtype}`,
              tokenUsage,
              cost,
              raw,
              sessionId,
            };
          }
        }
      }

      return { error: "Claude Code SDK call didn't return a result" };
    } catch (error: any) {
      const isAbort = error?.name === 'AbortError' || callOptions?.abortSignal?.aborted;

      if (isAbort) {
        logger.warn('Claude Code SDK call aborted');
        return { error: 'Claude Code SDK call aborted' };
      }

      logger.error(`Error calling Claude Code SDK: ${error}`);
      return {
        error: `Error calling Claude Code SDK: ${error}`,
      };
    } finally {
      if (isTempDir && workingDir) {
        // Clean up the temp dir
        fs.rmSync(workingDir, { recursive: true, force: true });
      }
      if (callOptions?.abortSignal && abortHandler) {
        callOptions.abortSignal.removeEventListener('abort', abortHandler);
      }
    }
  }

  toString(): string {
    return '[Anthropic Claude Code SDK Provider]';
  }

  /**
   * For normal Claude Code support, just use the Anthropic API key
   * Users can also use Bedrock (with CLAUDE_CODE_USE_BEDROCK env var) or Vertex (with CLAUDE_CODE_USE_VERTEX env var)
   */
  getApiKey(): string | undefined {
    return this.config?.apiKey || this.env?.ANTHROPIC_API_KEY || getEnvString('ANTHROPIC_API_KEY');
  }

  async cleanup(): Promise<void> {
    // no cleanup needed
  }
}

/**
 * Get a fingerprint for the working directory to use as a cache key. Checks directory mtime and descendant file mtimes recursively.
 *
 * This allows for caching prompts that use the same working directory when the files haven't changed.
 *
 * Simple/naive approach with recursion, statSync/readdirSync, and sanity-check timeout should be fine for normal use cases—even with thousands of files it's likely fast enough. Could be optimized later to remove recursion and use async fs calls with a queue and batching if it ever becomes an issue.
 */
const FINGERPRINT_TIMEOUT_MS = 2000;
async function getWorkingDirFingerprint(workingDir: string): Promise<string> {
  const dirStat = fs.statSync(workingDir);
  const dirMtime = dirStat.mtimeMs;

  const startTime = Date.now();

  // Recursively get all files
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

  // Create fingerprint from directory mtime + all file mtimes
  const fileMtimes = allFiles
    .map((file) => {
      const stat = fs.statSync(file);
      const relativePath = path.relative(workingDir, file);
      return `${relativePath}:${stat.mtimeMs}`;
    })
    .sort(); // Sort for consistent ordering

  const fingerprintData = `dir:${dirMtime};files:${fileMtimes.join(',')}`;
  const fingerprint = crypto.createHash('sha256').update(fingerprintData).digest('hex');

  return fingerprint;
}
