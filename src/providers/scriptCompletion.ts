import { execFile } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import invariant from 'tiny-invariant';
import { getCache, isCacheEnabled } from '../cache';
import logger from '../logger';
import type {
  ApiProvider,
  CallApiContextParams,
  ProviderOptions,
  ProviderResponse,
} from '../types';
import { safeJsonStringify } from '../util/json';

const ANSI_ESCAPE = /\x1b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

function stripText(text: string) {
  return text.replace(ANSI_ESCAPE, '');
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
    const fileHashes: string[] = [];

    // Parse all filepaths out of the command string
    const scriptParts = this.scriptPath.match(/[^\s"']+|"([^"]*)"|'([^']*)'/g) || [];
    for (const part of scriptParts) {
      // Remove quotes if present
      const cleanPart = part.replace(/^['"]|['"]$/g, '');
      if (fs.existsSync(cleanPart) && fs.statSync(cleanPart).isFile()) {
        const fileContent = fs.readFileSync(cleanPart);
        const fileHash = crypto.createHash('sha256').update(fileContent).digest('hex');
        fileHashes.push(fileHash);
        logger.debug(`File hash for ${cleanPart}: ${fileHash}`);
      }
    }

    if (fileHashes.length === 0) {
      logger.warn(`Could not find any valid files in the command: ${this.scriptPath}`);
    }

    const cacheKey = `exec:${this.scriptPath}:${fileHashes.join(':')}:${prompt}:${JSON.stringify(this.options)}`;

    let cachedResult;
    if (fileHashes.length > 0 && isCacheEnabled()) {
      const cache = await getCache();
      cachedResult = await cache.get(cacheKey);

      if (cachedResult) {
        logger.debug(`Returning cached result for script ${this.scriptPath}: ${cachedResult}`);
        return JSON.parse(cachedResult as string);
      }
    } else if (fileHashes.length === 0 && isCacheEnabled()) {
      logger.warn(
        `Could not hash any files for command ${this.scriptPath}, caching will not be used`,
      );
    }

    return new Promise<ProviderResponse>((resolve, reject) => {
      const scriptPartsRegex = /[^\s"']+|"([^"]*)"|'([^']*)'/g;
      let match;
      const scriptParts = [];

      while ((match = scriptPartsRegex.exec(this.scriptPath)) !== null) {
        // If it's a quoted match, push the first group (ignoring the quotes)
        if (match[1]) {
          scriptParts.push(match[1]);
        } else if (match[2]) {
          // If it's a single-quoted match, push the second group (ignoring the quotes)
          scriptParts.push(match[2]);
        } else {
          // Otherwise, push the whole match
          scriptParts.push(match[0]);
        }
      }
      const command = scriptParts.shift();
      invariant(command, 'No command found in script path');
      // These are not useful in the shell
      delete context?.fetchWithCache;
      delete context?.getCache;
      delete context?.logger;
      const scriptArgs = scriptParts.concat([
        prompt,
        safeJsonStringify(this.options || {}),
        safeJsonStringify(context || {}),
      ]);
      const options = this.options?.config.basePath ? { cwd: this.options.config.basePath } : {};

      execFile(command, scriptArgs, options, async (error, stdout, stderr) => {
        if (error) {
          logger.debug(`Error running script ${this.scriptPath}: ${error.message}`);
          reject(error);
          return;
        }
        const standardOutput = stripText(String(stdout).trim());
        const errorOutput = stripText(String(stderr).trim());
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
    });
  }
}
