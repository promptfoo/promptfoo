import { execFile } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

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

/** The path of the file `filePath` names, or undefined when it is not a file. */
function findFile(filePath: string, cwd?: string): string | undefined {
  // The child process runs in `cwd`, so relative files must be looked up there, not in ours
  const resolvedPath = cwd === undefined ? filePath : path.resolve(cwd, filePath);
  if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isFile()) {
    return undefined;
  }
  return resolvedPath;
}

function hashFile(resolvedPath: string): string {
  const fileContent = fs.readFileSync(resolvedPath);
  const fileHash = crypto.createHash('sha256').update(fileContent).digest('hex');
  logger.debug(`File hash for ${resolvedPath}: ${fileHash}`);
  return fileHash;
}

// Words that name a credential on their own. Matched against the words of an option name,
// split on `-`, `_`, `.` and camelCase, so `--auth-file` matches but `--author-file` does not.
const SECRET_OPTION_WORDS = new Set([
  'key',
  'keys',
  'auth',
  'cert',
  'certs',
  'certificate',
  'cred',
  'creds',
  'pass',
  'pwd',
]);
// Distinctive substrings, matched against the option name with separators removed, which also
// catches joined spellings such as `apikey` or `privatekey`.
const SECRET_OPTION_SUBSTRINGS = [
  'token',
  'secret',
  'password',
  'passwd',
  'passphrase',
  'credential',
  'authorization',
  'bearer',
  'jwt',
  'apikey',
  'privatekey',
  'accesskey',
  'keyfile',
];

/**
 * Whether an option name (`--token-file`, `api_key`) looks like it points
 * at a credential. This is a name heuristic only: it cannot recognize a secret in a
 * positional argument or an option with an unrelated name (`--input=creds.txt` is not caught,
 * `--sort-key=...` is a false positive). It errs toward flagging, because the cost of a false
 * positive is only a skipped cache, while a false negative puts a secret digest on disk.
 */
export function isSecretOptionName(optionName: string): boolean {
  const words = optionName
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  if (words.some((word) => SECRET_OPTION_WORDS.has(word))) {
    return true;
  }
  const collapsed = words.join('');
  return SECRET_OPTION_SUBSTRINGS.some((substring) => collapsed.includes(substring));
}

export interface ExecFileInputs {
  /** Content hashes of the files the command refers to, in argument order. */
  fileHashes: string[];
  /** True when a file belongs to a credential-like option; the command must then not be cached. */
  hasSecretFile: boolean;
}

/**
 * Finds the files named by the command's arguments, for use in cache keys. An argument counts
 * when it is a file, or when it is `flag=value` / `key=value` and the value is a file (so
 * `--config="my config.json"` is covered). A part that is itself a file is hashed once.
 *
 * Relative files are looked up in `cwd` (the child's working directory; defaults to ours).
 *
 * Files that belong to a credential-like option (`--token-file=t.txt`, or `--token-file t.txt`)
 * are never hashed: a digest of a low-entropy secret in the persistent cache lets anyone with
 * the cache file test guesses offline. Such a command reports `hasSecretFile` and no hashes, so
 * callers skip the cache for it.
 */
export function getExecFileInputs(scriptParts: string[], cwd?: string): ExecFileInputs {
  const stripQuotes = (value: string) => value.replace(/^['"]|['"]$/g, '');
  const fileHashes: string[] = [];

  for (let i = 0; i < scriptParts.length; i++) {
    const part = scriptParts[i];
    const equalsIndex = part.indexOf('=');
    const wholePartFile = findFile(stripQuotes(part), cwd);
    if (wholePartFile !== undefined) {
      // `--token-file t.txt`: the file is the value of the option in the previous part
      const previous = scriptParts[i - 1];
      if (previous?.startsWith('-') && !previous.includes('=') && isSecretOptionName(previous)) {
        return { fileHashes: [], hasSecretFile: true };
      }
      fileHashes.push(hashFile(wholePartFile));
      continue;
    }
    if (equalsIndex !== -1) {
      const attachedFile = findFile(stripQuotes(part.slice(equalsIndex + 1)), cwd);
      if (attachedFile !== undefined) {
        if (isSecretOptionName(part.slice(0, equalsIndex))) {
          return { fileHashes: [], hasSecretFile: true };
        }
        fileHashes.push(hashFile(attachedFile));
      }
    }
  }

  return { fileHashes, hasSecretFile: false };
}

/** File hashes for the command, or none at all when it must not be cached; see getExecFileInputs. */
export function getFileHashes(scriptParts: string[], cwd?: string): string[] {
  return getExecFileInputs(scriptParts, cwd).fileHashes;
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
    // The child runs in basePath when it is set, so files are looked up there
    const cwd = this.options?.config?.basePath || undefined;
    const { fileHashes, hasSecretFile } = getExecFileInputs(scriptParts, cwd);

    if (hasSecretFile) {
      logger.warn(
        `Command ${this.scriptPath} attaches a credential file, caching will not be used`,
      );
    } else if (fileHashes.length === 0) {
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
    } else if (fileHashes.length === 0 && !hasSecretFile && isCacheEnabled()) {
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
        ...(cwd && { cwd }),
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
