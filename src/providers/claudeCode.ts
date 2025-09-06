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

export const DEFAULT_ALLOWED_TOOLS = ['Read', 'Grep', 'Glob', 'LS'].sort(); // sort and export for tests

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

  env?: Record<string, string>;
  inherit_env?: boolean | string[]; // true to pass through whole env, array to pass through specific keys
}

export class ClaudeCodeSDKProvider implements ApiProvider {
  static ANTHROPIC_MODELS = ANTHROPIC_MODELS;
  static ANTHROPIC_MODELS_NAMES = ANTHROPIC_MODELS.map((model) => model.id);

  config: ClaudeCodeOptions;
  env?: EnvOverrides;
  apiKey?: string;

  // Only SDK and Anthropic are supported for now
  // Could later potentially support Claude Code via external CLI calls, as well as Bedrock/Vertex providers
  private providerId = 'claude-code:sdk:anthropic';
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
      !ClaudeCodeSDKProvider.ANTHROPIC_MODELS_NAMES.includes(this.config.model)
    ) {
      logger.warn(`Using unknown Anthropic model for Claude Code SDK: ${this.config.model}`);
    }

    if (
      this.config.fallback_model &&
      !ClaudeCodeSDKProvider.ANTHROPIC_MODELS_NAMES.includes(this.config.fallback_model)
    ) {
      logger.warn(
        `Using unknown Anthropic model for Claude Code SDK fallback: ${this.config.fallback_model}`,
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
    // Ensure consistent ordering for stable cache key
    const env: Record<string, string> = {};

    // Always include PATH so Claude Code SDK can find node executable
    if (process.env.PATH) {
      env.PATH = process.env.PATH;
    }

    if (typeof config.inherit_env === 'boolean' && config.inherit_env) {
      for (const key of Object.keys(process.env).sort()) {
        if (process.env[key] !== undefined) {
          env[key] = process.env[key];
        }
      }
    } else if (typeof config.inherit_env !== 'undefined' && Array.isArray(config.inherit_env)) {
      const keys = [...config.inherit_env].sort();
      for (const key of keys) {
        if (process.env[key] !== undefined) {
          env[key] = process.env[key];
        }
      }
    }
    if (config.env) {
      for (const key of Object.keys(config.env).sort()) {
        env[key] = config.env[key];
      }
    }
    if (this.apiKey) {
      env.ANTHROPIC_API_KEY = this.apiKey;
    }

    // Could potentially do more to validate credentials for Bedrock/Vertex here, but Anthropic key is the main use case
    if (!this.apiKey && !(env.CLAUDE_CODE_USE_BEDROCK || env.CLAUDE_CODE_USE_VERTEX)) {
      throw new Error(
        dedent`Anthropic API key is not set. Set the ANTHROPIC_API_KEY environment variable or add "apiKey" to the provider config.

        Use CLAUDE_CODE_USE_BEDROCK or CLAUDE_CODE_USE_VERTEX environment variable to use Bedrock or Vertex instead.`,
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
    let allowedTools = config.allow_all_tools ? undefined : DEFAULT_ALLOWED_TOOLS;
    if ('custom_allowed_tools' in config) {
      allowedTools = Array.from(new Set(config.custom_allowed_tools ?? [])).sort();
    } else if (config.append_allowed_tools) {
      allowedTools = Array.from(
        new Set([...DEFAULT_ALLOWED_TOOLS, ...config.append_allowed_tools]),
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

    let shouldCache = isCacheEnabled() && canCacheConfig(config);

    // If we're caching, only read from cache if we're not busting it (we can still write to it when busting)

    let cache: Awaited<ReturnType<typeof getCache>> | undefined;
    let cacheKey: string | undefined;
    if (shouldCache) {
      const workingDirFingerprintRes = config.working_dir
        ? await getWorkingDirFingerprint(config.working_dir)
        : null;

      shouldCache = !config.working_dir || !!workingDirFingerprintRes?.shouldCache;

      if (shouldCache) {
        cache = await getCache();
        const stringified = JSON.stringify({
          prompt,
          cacheKeyQueryOptions,
          workingDirFingerprint: workingDirFingerprintRes?.fingerprint,
        });
        // Hash to avoid super long cache keys or including sensitive env vars in the key
        const hash = crypto.createHash('sha256').update(stringified).digest('hex');
        cacheKey = `claude-code:${hash}`;
      } else {
        shouldCache = false;
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
   * Users could also potentially use Bedrock (with CLAUDE_CODE_USE_BEDROCK env var) or Vertex (with CLAUDE_CODE_USE_VERTEX env var) by using the 'env' or 'inherit_env' config options
   */
  getApiKey(): string | undefined {
    return this.config?.apiKey || this.env?.ANTHROPIC_API_KEY || getEnvString('ANTHROPIC_API_KEY');
  }

  async cleanup(): Promise<void> {
    // no cleanup needed
  }
}

function canCacheConfig(config: ClaudeCodeOptions): boolean {
  // Unless we're using default tools, assume we can't cache (could potentially make this smarter in the future)
  if (config.allow_all_tools || config.custom_allowed_tools || config.append_allowed_tools) {
    return false;
  }

  // Unless we're in 'default' or 'plan' mode, assume we can't cache
  if (config.permission_mode === 'acceptEdits' || config.permission_mode === 'bypassPermissions') {
    return false;
  }

  // If we're using MCP servers, assume we can't cache (could also make this smarter in the future)
  if (config.mcp || config.strict_mcp_config === false) {
    return false;
  }

  return true;
}

/**
 * Get a fingerprint for the working directory to determine if it's safe to cache. Checks directory mtime and descendant file mtimes recursively up to a safe maximum.
 *
 * This allows for caching prompts that use the same working directory when the files haven't changed.
 */
async function getWorkingDirFingerprint(workingDir: string): Promise<{
  fingerprint: string | null;
  shouldCache: boolean;
}> {
  const MAX_FILES_FOR_CACHE = 100;

  const warnTooManyFiles = () => {
    logger.warn(
      dedent`Working directory ${workingDir} contains more than ${MAX_FILES_FOR_CACHE} files. Caching disabled for this run. Try disabling the cache with PROMPTFOO_CACHE_ENABLED=false or bustCache: true.`,
    );
  };

  try {
    const dirStat = fs.statSync(workingDir);
    const dirMtime = dirStat.mtimeMs;

    // Recursively get all files
    const getAllFiles = (dir: string, files: string[] = []): string[] | false => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          const result = getAllFiles(fullPath, files);
          if (result === false) {
            return false;
          }
        } else if (entry.isFile()) {
          files.push(fullPath);
          // Stop early if we've already exceeded the max number of files for caching
          if (files.length > MAX_FILES_FOR_CACHE) {
            warnTooManyFiles();
            return false;
          }
        }
      }
      return files;
    };

    const getFilesResult = getAllFiles(workingDir);
    if (getFilesResult === false) {
      return { fingerprint: null, shouldCache: false };
    }
    const allFiles = getFilesResult;

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

    return { fingerprint, shouldCache: true };
  } catch (err) {
    logger.error(`Error creating working directory fingerprint: ${err}`);
    return { fingerprint: null, shouldCache: false };
  }
}
