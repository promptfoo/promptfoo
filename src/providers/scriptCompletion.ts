import { execFile } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';

import { getCache, isCacheEnabled } from '../cache';
import { getProcessEnv } from '../envars';
import logger from '../logger';
import invariant from '../util/invariant';
import { safeJsonStringify } from '../util/json';
import { waitForPromiseWithAbort } from './shared';

import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderOptions,
  ProviderResponse,
} from '../types/index';

const ANSI_ESCAPE = /\x1b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

export function stripText(text: string) {
  return text.replace(ANSI_ESCAPE, '');
}

export function parseScriptParts(scriptPath: string): string[] {
  const scriptPartsRegex = /[^\s"']+|"([^"]*)"|'([^']*)'/g;
  let match;
  const scriptParts = [];

  while ((match = scriptPartsRegex.exec(scriptPath)) !== null) {
    scriptParts.push(match[1] || match[2] || match[0]);
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

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const signal = options?.abortSignal;
    signal?.throwIfAborted();
    const parts = parseScriptParts(this.scriptPath);
    const [command, ...args] = parts;
    invariant(command, 'No command found in script path');

    const hashes = isCacheEnabled() ? getFileHashes(parts) : [];
    const cache = hashes.length > 0 ? await getCache() : undefined;
    const cacheKey = `exec:${this.scriptPath}:${hashes.join(':')}:${prompt}:${JSON.stringify(this.options)}`;
    if (cache) {
      const cached = await waitForPromiseWithAbort(cache.get<string>(cacheKey), signal);
      signal?.throwIfAborted();
      if (cached) {
        return { ...JSON.parse(cached), cached: true };
      }
    } else if (isCacheEnabled()) {
      logger.warn('No script files could be hashed. Skipping the exec provider cache.');
    }

    // Exclude callbacks and circular provider references without mutating the caller's context.
    const {
      getCache: _getCache,
      logger: _logger,
      filters: _filters,
      originalProvider: _provider,
      ...scriptContext
    } = context ?? {};
    args.push(
      prompt,
      safeJsonStringify(this.options ?? {}) as string,
      safeJsonStringify(scriptContext) as string,
    );
    signal?.throwIfAborted();
    const output = await new Promise<string>((resolve, reject) => {
      const child = execFile(
        command,
        args,
        {
          cwd: this.options?.config?.basePath,
          env: getProcessEnv(),
          signal,
          killSignal: 'SIGKILL',
        },
        (error, stdout, stderr) => {
          if (error) {
            reject(error);
            return;
          }
          const text = stripText(stdout.toString().trim());
          const errorText = stripText(stderr.toString().trim());
          if (!text && errorText) {
            reject(new Error(errorText));
          } else {
            resolve(text);
          }
        },
      );
      // Let commands that read stdin see EOF immediately.
      child.stdin?.end();
    });

    signal?.throwIfAborted();
    const result = { output };
    if (cache) {
      await waitForPromiseWithAbort(cache.set(cacheKey, JSON.stringify(result)), signal);
    }
    return result;
  }
}
