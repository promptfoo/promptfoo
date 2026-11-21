import { execFile } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';

import { getCache, isCacheEnabled } from '../cache';
import { getProcessEnv } from '../envars';
import logger from '../logger';
import { safeJsonStringify } from '../util/json';
import { requireLocalCommand } from '../util/scriptExecution';

import type {
  ApiProvider,
  CallApiContextParams,
  ProviderOptions,
  ProviderResponse,
} from '../types/index';

const ANSI_ESCAPE = /\x1b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

function stripText(text: string | Buffer) {
  return text.toString().trim().replace(ANSI_ESCAPE, '');
}

export function parseScriptParts(scriptPath: string): string[] {
  requireLocalCommand(scriptPath);
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

/** Capture the executable, fixed argv and working directory before accepting runtime data. */
export function prepareScript(scriptPath: string, cwd?: string, timeout?: number) {
  const parts = parseScriptParts(scriptPath);
  const [command, ...args] = parts;
  requireLocalCommand(command);
  return Object.freeze({
    scriptPath,
    command,
    getFileHashes() {
      requireLocalCommand(command);
      return getFileHashes(parts);
    },
    async run(inputs: string[]): Promise<string> {
      requireLocalCommand(command);
      const { stdout, stderr } = await new Promise<{ stdout: string; stderr: string }>(
        (resolve, reject) => {
          const child = execFile(
            command,
            [...args, ...inputs],
            { cwd, timeout, env: getProcessEnv(), shell: false },
            (error, stdout, stderr) => {
              if (error) {
                reject(error);
              } else {
                resolve({ stdout, stderr });
              }
            },
          );
          // Scripts receive input through argv and may wait for EOF on stdin.
          child.stdin?.end();
        },
      );
      const output = stripText(stdout);
      const error = stripText(stderr);
      if (error && !output) {
        throw new Error(error);
      }
      return output;
    },
  });
}

function scriptContext(context?: CallApiContextParams) {
  const value =
    context && 'toJSON' in context && typeof context.toJSON === 'function'
      ? context.toJSON('')
      : (context ?? {});
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return value;
  }
  // Skip internal fields before reading properties, including accessors.
  return Object.fromEntries(
    Object.keys(value)
      .filter((key) => !['getCache', 'logger', 'filters', 'originalProvider'].includes(key))
      .map((key) => [key, value[key]]),
  );
}

export class ScriptCompletionProvider implements ApiProvider {
  readonly #script: ReturnType<typeof prepareScript>;

  constructor(
    scriptPath: string,
    private options?: ProviderOptions,
  ) {
    this.#script = prepareScript(scriptPath, options?.config?.basePath);
  }

  id() {
    return `exec:${this.#script.scriptPath}`;
  }

  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    const fileHashes = this.#script.getFileHashes();

    if (fileHashes.length === 0) {
      logger.warn(`Could not find any valid files in the command: ${this.#script.scriptPath}`);
    }

    const cacheKey = `exec:${this.#script.scriptPath}:${fileHashes.join(':')}:${prompt}:${JSON.stringify(this.options)}`;

    const cache = fileHashes.length && isCacheEnabled() ? await getCache() : undefined;
    const cachedResult = await cache?.get(cacheKey);
    if (cachedResult) {
      return { ...JSON.parse(cachedResult as string), cached: true };
    }

    const output = await this.#script.run([
      prompt,
      safeJsonStringify(this.options ?? {}) as string,
      safeJsonStringify(scriptContext(context)) as string,
    ]);
    const result = { output };
    await cache?.set(cacheKey, JSON.stringify(result));
    return result;
  }
}
