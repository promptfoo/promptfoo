/**
 * Shared utilities for agentic providers (Claude Agent SDK, OpenCode SDK, etc.)
 *
 * These utilities handle common functionality needed by coding agent providers:
 * - Working directory fingerprinting for cache key generation
 * - Response caching with fingerprint support
 */

import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

import dedent from 'dedent';
import { getCache, isCacheEnabled } from '../cache';
import logger from '../logger';
import { safeResolve } from '../util/pathUtils';

import type { ProviderResponse } from '../types/index';

/**
 * Timeout for working directory fingerprint generation (ms)
 * Prevents hanging on extremely large directories
 */
const FINGERPRINT_TIMEOUT_MS = 2000;
const STAT_BATCH_SIZE = 32;

/**
 * Resolve a coding-agent working directory relative to the config file directory.
 *
 * `cliState.basePath` tracks the loaded config file's directory. Coding-agent providers
 * use `process.cwd()` only when no config base path is available, which keeps relative
 * paths stable when the same config is run from different shells.
 */
export function resolveAgenticWorkingDir(
  workingDir: string | undefined,
  configBasePath?: string,
): string | undefined {
  if (!workingDir) {
    return undefined;
  }

  const basePath = configBasePath ? path.resolve(configBasePath) : process.cwd();
  return safeResolve(basePath, workingDir);
}

/**
 * Get a fingerprint for a working directory to use as a cache key.
 * Checks directory mtime and descendant file mtimes recursively.
 *
 * This allows for caching prompts that use the same working directory
 * when the files haven't changed.
 *
 * @param workingDir - Absolute path to the working directory
 * @returns SHA-256 hash fingerprint of the directory state
 * @throws Error if fingerprinting times out or directory is inaccessible
 */
export async function getWorkingDirFingerprint(workingDir: string): Promise<string> {
  const dirStat = await fs.stat(workingDir);
  const dirMtime = dirStat.mtimeMs;

  const startTime = Date.now();

  // Recursively get all files
  const getAllFiles = async (dir: string, files: string[] = []): Promise<string[]> => {
    if (Date.now() - startTime > FINGERPRINT_TIMEOUT_MS) {
      throw new Error('Working directory fingerprint timed out');
    }

    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await getAllFiles(fullPath, files);
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
    return files;
  };

  const allFiles = await getAllFiles(workingDir);

  // Create fingerprint from directory mtime + all file mtimes
  const fileMtimes: string[] = [];
  for (let i = 0; i < allFiles.length; i += STAT_BATCH_SIZE) {
    if (Date.now() - startTime > FINGERPRINT_TIMEOUT_MS) {
      throw new Error('Working directory fingerprint timed out');
    }

    const batch = allFiles.slice(i, i + STAT_BATCH_SIZE);
    const batchMtimes = await Promise.all(
      batch.map(async (file: string) => {
        const stat = await fs.stat(file);
        const relativePath = path.relative(workingDir, file);
        return `${relativePath}:${stat.mtimeMs}`;
      }),
    );
    fileMtimes.push(...batchMtimes);
  }
  fileMtimes.sort(); // Sort for consistent ordering

  const fingerprintData = `dir:${dirMtime};files:${fileMtimes.join(',')}`;
  const fingerprint = crypto.createHash('sha256').update(fingerprintData).digest('hex');

  return fingerprint;
}

/**
 * Options for cache operations
 */
export interface AgenticCacheOptions {
  /** Cache key prefix (e.g., 'anthropic:claude-agent-sdk', 'opencode:sdk') */
  cacheKeyPrefix: string;
  /** Working directory path (optional) */
  workingDir?: string;
  /** Whether to bust the cache (read bypass, but still write) */
  bustCache?: boolean;
  /** MCP configuration — when present and cacheMcp is not true, caching is disabled */
  mcp?: unknown;
  /** When true, enables caching even when MCP is configured */
  cacheMcp?: boolean;
}

/**
 * Result of cache check operation
 */
export interface CacheCheckResult {
  /** Whether caching should be used */
  shouldCache: boolean;
  /** Whether we should read from cache (false when bustCache is true) */
  shouldReadCache: boolean;
  /** Whether we should write to cache */
  shouldWriteCache: boolean;
  /** The cache instance (if caching is enabled) */
  cache?: Awaited<ReturnType<typeof getCache>>;
  /** The generated cache key (if caching is enabled) */
  cacheKey?: string;
  /** The working directory fingerprint (if working_dir was provided) */
  workingDirFingerprint?: string | null;
}

/**
 * Generate a cache key from arbitrary data using SHA-256 hash
 *
 * @param prefix - Cache key prefix (provider identifier)
 * @param data - Data to hash for the cache key
 * @returns Prefixed SHA-256 hash cache key
 */
export function generateCacheKey(prefix: string, data: Record<string, unknown>): string {
  const stringified = JSON.stringify(data);
  const hash = crypto.createHash('sha256').update(stringified).digest('hex');
  return `${prefix}:${hash}`;
}

/**
 * Initialize cache and check for cached response
 *
 * This handles the common caching pattern used by agentic providers:
 * 1. Check if caching is enabled
 * 2. Generate working directory fingerprint if needed
 * 3. Generate cache key
 * 4. Return cache configuration for use by the provider
 *
 * @param options - Cache options including prefix and working directory
 * @param cacheKeyData - Data to include in the cache key
 * @returns Cache configuration and optional cached response
 */
export async function initializeAgenticCache(
  options: AgenticCacheOptions,
  cacheKeyData: Record<string, unknown>,
): Promise<CacheCheckResult> {
  const shouldCache = isCacheEnabled();

  if (!shouldCache) {
    return {
      shouldCache: false,
      shouldReadCache: false,
      shouldWriteCache: false,
    };
  }

  // MCP tools typically interact with external state, so disable caching by default.
  // Users can opt in with cacheMcp: true for deterministic MCP tools.
  if (options.mcp && !options.cacheMcp) {
    return {
      shouldCache: false,
      shouldReadCache: false,
      shouldWriteCache: false,
    };
  }

  let workingDirFingerprint: string | null = null;

  if (options.workingDir) {
    try {
      workingDirFingerprint = await getWorkingDirFingerprint(options.workingDir);
    } catch (error) {
      logger.error(
        dedent`Error getting working directory fingerprint for cache key - ${options.workingDir}: ${String(error)}

        Caching is disabled.`,
      );
      return {
        shouldCache: false,
        shouldReadCache: false,
        shouldWriteCache: false,
      };
    }
  }

  const cache = await getCache();
  const cacheKey = generateCacheKey(options.cacheKeyPrefix, {
    ...cacheKeyData,
    workingDirFingerprint,
    ...(options.mcp ? { mcp: options.mcp } : {}),
  });

  return {
    shouldCache: true,
    shouldReadCache: !options.bustCache,
    shouldWriteCache: true,
    cache,
    cacheKey,
    workingDirFingerprint,
  };
}

/**
 * Try to get a cached response
 *
 * @param cacheResult - Result from initializeAgenticCache
 * @param debugContext - Context for debug logging (e.g., prompt preview)
 * @returns Cached ProviderResponse if found, undefined otherwise
 */
export async function getCachedResponse(
  cacheResult: CacheCheckResult,
  debugContext?: string,
): Promise<ProviderResponse | undefined> {
  if (!cacheResult.shouldReadCache || !cacheResult.cache || !cacheResult.cacheKey) {
    return undefined;
  }

  try {
    const cachedResponse = await cacheResult.cache.get<string | undefined>(cacheResult.cacheKey);
    if (cachedResponse) {
      logger.debug(
        `Returning cached response${debugContext ? ` for ${debugContext}` : ''} (cache key: ${cacheResult.cacheKey})`,
      );
      return { ...JSON.parse(cachedResponse), cached: true };
    }
  } catch (error) {
    logger.error(`Error getting cached response: ${String(error)}`);
  }

  return undefined;
}

/**
 * Cache a provider response
 *
 * @param cacheResult - Result from initializeAgenticCache
 * @param response - The ProviderResponse to cache
 * @param debugContext - Context for debug logging
 */
export async function cacheResponse(
  cacheResult: CacheCheckResult,
  response: ProviderResponse,
  debugContext?: string,
): Promise<void> {
  if (!cacheResult.shouldWriteCache || !cacheResult.cache || !cacheResult.cacheKey) {
    return;
  }

  try {
    await cacheResult.cache.set(cacheResult.cacheKey, JSON.stringify(response));
  } catch (error) {
    logger.error(
      `Error caching response${debugContext ? ` for ${debugContext}` : ''}: ${String(error)}`,
    );
  }
}
