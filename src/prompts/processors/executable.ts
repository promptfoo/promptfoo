import { execFile } from 'child_process';
import { createHash, randomUUID } from 'crypto';
import { constants, createReadStream } from 'fs';
import { access, stat as fsStat, readFile } from 'fs/promises';
import path from 'path';

import { getCache, isCacheEnabled } from '../../cache';
import logger from '../../logger';
import { getFileHashes, parseScriptParts } from '../../providers/scriptCompletion';
import invariant from '../../util/invariant';
import { safeJsonStringify } from '../../util/json';

import type { ApiProvider, Prompt, PromptFunctionContext, VarValue } from '../../types/index';

const ANSI_ESCAPE = /\x1b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

function stripText(text: string) {
  return text.replace(ANSI_ESCAPE, '');
}

async function getExecutableSourceHash(parts: string[], basePath?: string): Promise<string> {
  const cwd = path.resolve(basePath || '.');
  const command = parts[0];
  const searchPath = command && !/[\\/]/.test(command);
  const suffixes =
    process.platform === 'win32'
      ? ['', ...(process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';')]
      : [''];
  const candidates = searchPath
    ? (process.env.PATH || '')
        .split(path.delimiter)
        .flatMap((directory) =>
          suffixes.map((suffix) => path.resolve(cwd, directory, command + suffix)),
        )
    : [path.resolve(cwd, command || '')];
  try {
    let executable: string | undefined;
    for (const candidate of candidates) {
      try {
        if ((await fsStat(candidate)).isFile()) {
          if (searchPath) {
            await access(candidate, constants.X_OK);
          }
          executable = candidate;
          break;
        }
      } catch {
        // Continue searching PATH for the executable used by execFile.
      }
    }
    if (!executable) {
      return randomUUID();
    }
    const files = [executable];
    for (const argument of parts.slice(1)) {
      const candidate = path.resolve(cwd, argument);
      try {
        if ((await fsStat(candidate)).isFile()) {
          files.push(candidate);
        }
      } catch (error) {
        if (!['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code || '')) {
          throw error;
        }
      }
    }
    const hash = createHash('sha256').update(JSON.stringify(parts));
    for (const file of files) {
      const fileHash = createHash('sha256');
      for await (const chunk of createReadStream(file)) {
        fileHash.update(chunk);
      }
      hash.update(JSON.stringify([file, fileHash.digest('hex')]));
    }
    return hash.digest('hex');
  } catch {
    // Unreadable implementations can run, but a fresh token prevents unverifiable replay.
    return randomUUID();
  }
}

/**
 * Executable prompt function. Executes any script/binary and returns its output as the prompt.
 * The script receives context as JSON in its arguments.
 * @param scriptPath - Path to the executable script.
 * @param context - Context for the prompt.
 * @returns The prompt output from the script.
 */
export const executablePromptFunction = async (
  scriptPath: string,
  context: {
    vars: Record<string, VarValue>;
    provider?: ApiProvider;
    config?: {
      basePath?: string;
      timeout?: number;
    };
  },
): Promise<string> => {
  invariant(context.provider?.id, 'provider.id is required');

  const transformedContext: PromptFunctionContext = {
    vars: context.vars,
    provider: {
      id:
        typeof context.provider?.id === 'function' ? context.provider?.id() : context.provider?.id,
      label: context.provider?.label,
    },
    config: context.config ?? {},
  };

  const scriptParts = parseScriptParts(scriptPath);
  const fileHashes = getFileHashes(scriptParts);

  const cacheKey = `exec-prompt:${scriptPath}:${fileHashes.join(':')}:${safeJsonStringify(transformedContext)}`;

  let cachedResult;
  if (fileHashes.length > 0 && isCacheEnabled()) {
    const cache = getCache();
    cachedResult = await cache.get(cacheKey);

    if (cachedResult) {
      logger.debug(`Returning cached result for executable prompt ${scriptPath}`);
      return cachedResult as string;
    }
  }

  return new Promise<string>((resolve, reject) => {
    const command = scriptParts.shift();
    invariant(command, 'No command found in script path');

    // Pass context as JSON argument to the script
    const scriptArgs = scriptParts.concat([safeJsonStringify(transformedContext) as string]);

    const options = {
      cwd: context.config?.basePath,
      timeout: context.config?.timeout || 60000, // Default 60 second timeout
    };

    logger.debug(`Executing prompt script: ${command} ${scriptArgs.join(' ')}`);

    execFile(command, scriptArgs, options, async (error, stdout, stderr) => {
      if (error) {
        logger.error(`Error running executable prompt ${scriptPath}: ${error.message}`);
        reject(error);
        return;
      }

      const standardOutput = stripText(Buffer.from(stdout).toString('utf8').trim());
      const errorOutput = stripText(Buffer.from(stderr).toString('utf8').trim());

      if (errorOutput) {
        logger.debug(`Error output from executable prompt ${scriptPath}: ${errorOutput}`);
        if (!standardOutput) {
          reject(new Error(errorOutput));
          return;
        }
      }

      logger.debug(`Output from executable prompt ${scriptPath}: ${standardOutput}`);

      if (fileHashes.length > 0 && isCacheEnabled()) {
        const cache = getCache();
        await cache.set(cacheKey, standardOutput);
      }

      resolve(standardOutput);
    });
  });
};

/**
 * Processes an executable file to generate prompts.
 * The executable can be any script or binary that outputs prompt text to stdout.
 * It receives the context as JSON in its first argument.
 *
 * @param filePath - Path to the executable file (can include arguments).
 * @param prompt - The raw prompt data.
 * @param functionName - Not used for executables, but kept for interface consistency.
 * @returns Array of prompts generated from the executable.
 */
export async function processExecutableFile(
  filePath: string,
  prompt: Partial<Prompt>,
  _functionName?: string,
): Promise<Prompt[]> {
  // For display purposes, try to read the file if it exists and is a text file
  let rawContent = filePath;
  const scriptParts = parseScriptParts(filePath);
  const firstPart = scriptParts[0];

  if (firstPart) {
    try {
      const stats = await fsStat(firstPart);
      if (stats.isFile() && stats.size < 1024 * 100) {
        // Only read files < 100KB
        const content = await readFile(firstPart, 'utf-8');
        // Check if it's likely a text file
        if (!/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(content.substring(0, 1000))) {
          rawContent = content;
        }
      }
    } catch (_e) {
      // Ignore errors, use the path as raw content
    }
  }

  const label = prompt.label ?? filePath;

  return [
    {
      raw: rawContent,
      label,
      function: (context) =>
        executablePromptFunction(filePath, { ...context, config: prompt.config }),
      config: prompt.config,
      sourceHash: await getExecutableSourceHash(scriptParts, prompt.config?.basePath),
    },
  ];
}
