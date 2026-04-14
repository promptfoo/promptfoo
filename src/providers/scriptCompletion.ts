import { execFile } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';

import { getCache, isCacheEnabled } from '../cache';
import logger from '../logger';
import { sha256 } from '../util/createHash';
import invariant from '../util/invariant';
import { safeJsonStringify, stableJsonStringify } from '../util/json';
import { buildCacheableScriptContext, sanitizeScriptContext } from './scriptContext';

import type {
  ApiProvider,
  CallApiContextParams,
  ProviderOptions,
  ProviderResponse,
} from '../types/index';

const ANSI_ESCAPE = /\x1b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

function stripText(text: string) {
  return text.replace(ANSI_ESCAPE, '');
}

export function parseScriptParts(scriptPath: string): string[] {
  const scriptPartsRegex = /[^\s"']+|"([^"]*)"|'([^']*)'/g;
  let match;
  const scriptParts = [];

  while ((match = scriptPartsRegex.exec(scriptPath)) !== null) {
    if (match[1]) {
      scriptParts.push(match[1]);
    } else if (match[2]) {
      scriptParts.push(match[2]);
    } else {
      scriptParts.push(match[0]);
    }
  }

  return scriptParts;
}

export function getFileHashes(scriptParts: string[]): string[] {
  const fileHashes: string[] = [];

  for (const part of scriptParts) {
    const cleanPart = part.replace(/^['"]|['"]$/g, '');
    if (fs.existsSync(cleanPart) && fs.statSync(cleanPart).isFile()) {
      const fileContent = fs.readFileSync(cleanPart);
      const fileHash = crypto.createHash('sha256').update(fileContent).digest('hex');
      fileHashes.push(fileHash);
      logger.debug(`File hash for ${cleanPart}: ${fileHash}`);
    }
  }

  return fileHashes;
}

export class ScriptCompletionProvider implements ApiProvider {
  constructor(
    private scriptPath: string,
    private options?: ProviderOptions,
  ) {}

  id() {
    return `exec:${this.scriptPath}`;
  }

  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    const scriptParts = parseScriptParts(this.scriptPath);
    const fileHashes = getFileHashes(scriptParts);
    const serializedOptions = safeJsonStringify(this.options ?? {}) ?? '{}';
    const sanitizedContext = sanitizeScriptContext('ScriptCompletionProvider', context) ?? {};
    const serializedContext = safeJsonStringify(sanitizedContext) ?? '{}';
    // The cache-key hash must exclude per-run non-deterministic fields like
    // `evaluationId` / `traceparent` so that two otherwise-identical eval
    // runs hit the same cache entry. Stable (sorted) JSON ensures upstream
    // callers that clone/reshape options or context with a different key
    // order still hit the same cache entry.
    const stableOptions = stableJsonStringify(this.options ?? {}) ?? '{}';
    const stableCacheableContext =
      stableJsonStringify(buildCacheableScriptContext(context)) ?? '{}';

    if (fileHashes.length === 0) {
      logger.warn(`Could not find any valid files in the command: ${this.scriptPath}`);
    }

    const cacheKey = `exec:${this.scriptPath}:${fileHashes.join(':')}:${sha256(prompt)}:${sha256(
      stableOptions,
    )}:${sha256(stableCacheableContext)}`;

    let cachedResult;
    if (fileHashes.length > 0 && isCacheEnabled()) {
      const cache = await getCache();
      cachedResult = await cache.get(cacheKey);

      if (cachedResult) {
        logger.debug('Returning cached result for script', { scriptPath: this.scriptPath });
        return { ...JSON.parse(cachedResult as string), cached: true };
      }
    } else if (fileHashes.length === 0 && isCacheEnabled()) {
      logger.warn(
        `Could not hash any files for command ${this.scriptPath}, caching will not be used`,
      );
    }

    return new Promise<ProviderResponse>((resolve, reject) => {
      const command = scriptParts.shift();
      invariant(command, 'No command found in script path');
      const scriptArgs = scriptParts.concat([prompt, serializedOptions, serializedContext]);
      const options = this.options?.config.basePath ? { cwd: this.options.config.basePath } : {};

      const child = execFile(command, scriptArgs, options, async (error, stdout, stderr) => {
        if (error) {
          logger.debug('Error running script', {
            scriptPath: this.scriptPath,
            errorMessage: error.message,
          });
          reject(error);
          return;
        }
        const standardOutput = stripText(Buffer.from(stdout).toString('utf8').trim());
        const errorOutput = stripText(Buffer.from(stderr).toString('utf8').trim());
        if (errorOutput) {
          logger.debug('Script produced stderr output', {
            scriptPath: this.scriptPath,
            stderr: errorOutput,
          });
          if (!standardOutput) {
            reject(new Error(errorOutput));
            return;
          }
        }
        logger.debug('Script produced stdout output', {
          scriptPath: this.scriptPath,
          stdout: standardOutput,
        });
        const result = { output: standardOutput };
        if (fileHashes.length > 0 && isCacheEnabled()) {
          const cache = await getCache();
          await cache.set(cacheKey, JSON.stringify(result));
        }
        resolve(result);
      });
      // Close stdin immediately so child processes that read stdin don't hang.
      // execFile pipes stdin by default but never writes to it, causing tools
      // like opencode to block forever waiting for input.
      child.stdin?.end();
    });
  }
}
