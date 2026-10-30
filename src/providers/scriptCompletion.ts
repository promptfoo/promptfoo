import { execFile } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';

import { getCache, isCacheEnabled } from '../cache';
import { getProcessEnv } from '../envars';
import logger from '../logger';
import invariant from '../util/invariant';
import { safeJsonStringify } from '../util/json';

import type {
  ApiProvider,
  CallApiContextParams,
  ProviderOptions,
  ProviderResponse,
} from '../types/index';

/** Bump when `parseScriptParts` changes the argv it produces, so output cached for the old argv is not reused. */
export const EXEC_CACHE_VERSION = 'argv-v2';

const ANSI_ESCAPE = /\x1b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

export function stripText(text: string) {
  return text.replace(ANSI_ESCAPE, '');
}

/**
 * Splits a command line into arguments, shell-style but without running a shell:
 * - whitespace outside quotes separates arguments
 * - `'...'` and `"..."` group text; adjacent segments join (`--a="b c"` -> `--a=b c`)
 * - empty quotes are kept as empty arguments
 * - backslashes are always literal (Windows paths like `"C:\dir\"` work), so a quote
 *   can't be escaped: use the other quote style (`'say "hi"'`)
 * - a quote with no closing match is kept as a literal character
 */
export function parseScriptParts(scriptPath: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inToken = false;

  for (let i = 0; i < scriptPath.length; i++) {
    const char = scriptPath[i];
    if (char === '"' || char === "'") {
      const end = scriptPath.indexOf(char, i + 1);
      if (end !== -1) {
        current += scriptPath.slice(i + 1, end);
        inToken = true;
        i = end;
        continue;
      }
    } else if (/\s/.test(char)) {
      if (inToken) {
        parts.push(current);
        current = '';
        inToken = false;
      }
      continue;
    }
    current += char;
    inToken = true;
  }

  if (inToken) {
    parts.push(current);
  }
  return parts;
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

    if (fileHashes.length === 0) {
      logger.warn(`Could not find any valid files in the command: ${this.scriptPath}`);
    }

    const cacheKey = `exec:${EXEC_CACHE_VERSION}:${this.scriptPath}:${fileHashes.join(':')}:${prompt}:${JSON.stringify(this.options)}`;

    let cachedResult;
    if (fileHashes.length > 0 && isCacheEnabled()) {
      const cache = await getCache();
      cachedResult = await cache.get(cacheKey);

      if (cachedResult) {
        logger.debug(`Returning cached result for script ${this.scriptPath}: ${cachedResult}`);
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
      // Remove properties not useful in shell scripts and non-serializable objects
      // These can contain circular references (e.g., Timeout objects) that break JSON serialization
      delete context?.getCache;
      delete context?.logger;
      delete context?.filters; // NunjucksFilterMap contains functions
      delete context?.originalProvider; // ApiProvider object with methods
      const scriptArgs = scriptParts.concat([
        prompt,
        safeJsonStringify(this.options || {}) as string,
        safeJsonStringify(context || {}) as string,
      ]);
      const options = {
        ...(this.options?.config.basePath && { cwd: this.options.config.basePath }),
        env: getProcessEnv(),
      };

      const child = execFile(command, scriptArgs, options, async (error, stdout, stderr) => {
        if (error) {
          logger.debug(`Error running script ${this.scriptPath}: ${error.message}`);
          reject(error);
          return;
        }
        const standardOutput = stripText(Buffer.from(stdout).toString('utf8').trim());
        const errorOutput = stripText(Buffer.from(stderr).toString('utf8').trim());
        if (errorOutput) {
          logger.debug(`Error output from script ${this.scriptPath}: ${errorOutput}`);
          if (!standardOutput) {
            reject(new Error(errorOutput));
            return;
          }
        }
        logger.debug(`Output from script ${this.scriptPath}: ${standardOutput}`);
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
