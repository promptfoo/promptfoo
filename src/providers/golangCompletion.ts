import { execFile } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import util from 'util';

import { getCache, isCacheEnabled } from '../cache';
import { getWrapperDir } from '../esm';
import logger from '../logger';
import { sha256 } from '../util/createHash';
import { pathExists } from '../util/file';
import { parsePathOrGlob } from '../util/index';
import { safeJsonStringify, stableJsonStringify } from '../util/json';
import {
  buildCacheableScriptContext,
  containsSensitiveScriptInput,
  sanitizeScriptContext,
} from './scriptContext';

import type {
  ApiProvider,
  CallApiContextParams,
  ProviderOptions,
  ProviderResponse,
} from '../types/providers';

const execFileAsync = util.promisify(execFile);

interface GolangProviderConfig {
  goExecutable?: string;
}

export class GolangProvider implements ApiProvider {
  config: GolangProviderConfig;

  private scriptPath: string;
  private functionName: string | null;
  public label: string | undefined;

  constructor(
    runPath: string,
    private options?: ProviderOptions,
  ) {
    const { filePath: providerPath, functionName } = parsePathOrGlob(
      options?.config.basePath || '',
      runPath,
    );
    if (functionName && functionName !== 'call_api' && functionName !== 'CallApi') {
      throw new Error(
        `The Golang provider only supports the CallApi function; received "${functionName}"`,
      );
    }
    this.scriptPath = path.relative(options?.config.basePath || '', providerPath);
    this.functionName = functionName || null;
    this.id = () => options?.id ?? `golang:${this.scriptPath}:${this.functionName || 'default'}`;
    this.label = options?.label;
    this.config = options?.config ?? {};
  }

  id() {
    return `golang:${this.scriptPath}:${this.functionName || 'default'}`;
  }

  private async findModuleRoot(startPath: string): Promise<string> {
    let currentPath = startPath;
    while (currentPath !== path.dirname(currentPath)) {
      if (await pathExists(path.join(currentPath, 'go.mod'))) {
        return currentPath;
      }
      currentPath = path.dirname(currentPath);
    }
    throw new Error('Could not find go.mod file in any parent directory');
  }

  private async executeGolangScript(
    prompt: string,
    context: CallApiContextParams | undefined,
  ): Promise<ProviderResponse> {
    const absPath = path.resolve(path.join(this.options?.config.basePath || '', this.scriptPath));
    const moduleRoot = await this.findModuleRoot(path.dirname(absPath));
    logger.debug(`Found module root at ${moduleRoot}`);
    logger.debug(`Computing file hash for script ${absPath}`);
    const fileHash = sha256(await fs.readFile(absPath, 'utf-8'));
    const functionName = this.functionName || 'call_api';
    const sanitizedContext = sanitizeScriptContext('GolangProvider', context);
    const args = [prompt, this.options, sanitizedContext];
    const jsonArgs = safeJsonStringify(args) || '[]';
    // Build a separate arg set for cache-key hashing that excludes per-run
    // non-deterministic fields (`evaluationId`, `traceparent`, etc.). The
    // full `args` (with tracing metadata) are still forwarded to the Go binary.
    // Stable (sorted) JSON ensures callers that clone/reshape options or
    // context with a different key order still hit the same cache entry.
    const cacheableContext = buildCacheableScriptContext(context);
    const cacheKeyArgs = [prompt, this.options, cacheableContext];
    const cache = await getCache();
    let cachedResult;
    const containsSensitiveInput = containsSensitiveScriptInput(cacheKeyArgs);
    const cacheEnabled = isCacheEnabled() && !containsSensitiveInput;
    const cacheKey = cacheEnabled
      ? `golang:${this.scriptPath}:${functionName}:call_api:${fileHash}:${sha256(
          stableJsonStringify(cacheKeyArgs) || '[]',
        )}`
      : undefined;
    if (containsSensitiveInput) {
      logger.debug('GolangProvider cache disabled for sensitive invocation input');
    }

    if (cacheEnabled && cacheKey) {
      cachedResult = (await cache.get(cacheKey)) as string;
    }

    if (cachedResult) {
      logger.debug(`Returning cached call_api result for script ${absPath}`);
      return { ...JSON.parse(cachedResult), cached: true };
    } else {
      logger.debug('Running Golang script', {
        scriptPath: absPath,
        providerPath: this.scriptPath,
        apiType: 'call_api',
        argCount: args.length,
        hasContext: Boolean(sanitizedContext),
      });

      let tempDir: string | undefined;
      try {
        // Create temp directory
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'golang-provider-'));

        // Helper function to copy directory recursively
        const copyDir = async (src: string, dest: string): Promise<void> => {
          await fs.mkdir(dest, { recursive: true });
          const entries = await fs.readdir(src, { withFileTypes: true });
          for (const entry of entries) {
            const srcPath = path.join(src, entry.name);
            const destPath = path.join(dest, entry.name);
            if (entry.isDirectory()) {
              await copyDir(srcPath, destPath);
            } else {
              await fs.copyFile(srcPath, destPath);
            }
          }
        };

        // Copy the entire module structure
        await copyDir(moduleRoot, tempDir);

        const relativeScriptPath = path.relative(moduleRoot, absPath);
        const scriptDir = path.dirname(path.join(tempDir, relativeScriptPath));

        // Copy wrapper.go to the same directory as the script
        const tempWrapperPath = path.join(scriptDir, 'wrapper.go');
        await fs.mkdir(scriptDir, { recursive: true });
        await fs.copyFile(path.join(getWrapperDir('golang'), 'wrapper.go'), tempWrapperPath);

        const executablePath = path.join(tempDir, 'golang_wrapper');
        const tempScriptPath = path.join(tempDir, relativeScriptPath);

        // Build from the script directory using execFile (no shell injection)
        const goExecutable = this.config.goExecutable || 'go';
        await execFileAsync(
          goExecutable,
          ['build', '-o', executablePath, 'wrapper.go', path.basename(relativeScriptPath)],
          { cwd: scriptDir },
        );

        logger.debug(`Running Go executable: ${executablePath}`);

        // Execute compiled binary with args (no shell escaping needed)
        const { stdout, stderr } = await execFileAsync(executablePath, [
          tempScriptPath,
          functionName,
          jsonArgs,
        ]);
        if (stderr) {
          logger.error('Golang script stderr output', { stderr: String(stderr) });
        }
        logger.debug('Golang script stdout output', { stdout: String(stdout) });

        const result = JSON.parse(stdout);

        if (cacheEnabled && cacheKey && !('error' in result)) {
          await cache.set(cacheKey, JSON.stringify(result));
        }
        return result;
      } catch (error) {
        const err = error as Error;
        logger.error('Error running Golang script', {
          errorMessage: err.message,
          errorName: err.name,
        });
        throw new Error(`Error running Golang script: ${err.message}`);
      } finally {
        // Clean up temporary directory
        if (tempDir) {
          await fs.rm(tempDir, { recursive: true, force: true });
        }
      }
    }
  }

  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    return this.executeGolangScript(prompt, context);
  }
}
