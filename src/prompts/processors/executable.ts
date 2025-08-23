import { execFile } from 'child_process';
import * as fs from 'fs';

import logger from '../../logger';
import { parseScriptParts, getFileHashes } from '../../providers/scriptCompletion';
import { getCache, isCacheEnabled } from '../../cache';
import invariant from '../../util/invariant';
import { safeJsonStringify } from '../../util/json';

import type { ApiProvider, Prompt, PromptFunctionContext } from '../../types';

const ANSI_ESCAPE = /\x1b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

function stripText(text: string) {
  return text.replace(ANSI_ESCAPE, '');
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
    vars: Record<string, string | object>;
    provider?: ApiProvider;
    config?: Record<string, any>;
  },
): Promise<string> => {
  invariant(context.provider?.id, 'provider.id is required');
  
  const transformedContext: PromptFunctionContext = {
    vars: context.vars,
    provider: {
      id: typeof context.provider?.id === 'function' ? context.provider?.id() : context.provider?.id,
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
    const scriptArgs = scriptParts.concat([
      safeJsonStringify(transformedContext) as string,
    ]);

    const options = context.config?.basePath ? { cwd: context.config.basePath } : {};

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
export function processExecutableFile(
  filePath: string,
  prompt: Partial<Prompt>,
  _functionName?: string,
): Prompt[] {
  // For display purposes, try to read the file if it exists and is a text file
  let rawContent = filePath;
  const scriptParts = parseScriptParts(filePath);
  const firstPart = scriptParts[0];
  
  if (firstPart && fs.existsSync(firstPart)) {
    try {
      const stats = fs.statSync(firstPart);
      if (stats.isFile() && stats.size < 1024 * 100) { // Only read files < 100KB
        const content = fs.readFileSync(firstPart, 'utf-8');
        // Check if it's likely a text file
        if (!/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(content.substring(0, 1000))) {
          rawContent = content;
        }
      }
    } catch (e) {
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
    },
  ];
}