import { stat as fsStat, readFile } from 'fs/promises';

import { getCache, isCacheEnabled } from '../../cache';
import { prepareScript } from '../../providers/scriptCompletion';
import invariant from '../../util/invariant';
import { safeJsonStringify } from '../../util/json';

import type { ApiProvider, Prompt, PromptFunctionContext, VarValue } from '../../types/index';

type ExecutablePromptContext = {
  vars: Record<string, VarValue>;
  provider?: ApiProvider;
  config?: { basePath?: string; timeout?: number };
};

function preparePrompt(scriptPath: string, config: ExecutablePromptContext['config']) {
  return prepareScript(scriptPath, config?.basePath, config?.timeout || 60_000);
}

export async function executablePromptFunction(
  scriptPath: string,
  context: ExecutablePromptContext,
) {
  return renderExecutablePrompt(preparePrompt(scriptPath, context.config), context);
}

async function renderExecutablePrompt(
  script: ReturnType<typeof prepareScript>,
  context: ExecutablePromptContext,
) {
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

  const fileHashes = script.getFileHashes();

  const argument = safeJsonStringify(transformedContext) as string;
  const cacheKey = `exec-prompt:${script.scriptPath}:${fileHashes.join(':')}:${argument}`;
  const cache = fileHashes.length && isCacheEnabled() ? getCache() : undefined;
  const cachedResult = await cache?.get(cacheKey);
  if (typeof cachedResult === 'string') {
    return cachedResult;
  }

  const output = await script.run([argument]);
  await cache?.set(cacheKey, output);
  return output;
}

/**
 * Processes an executable file to generate prompts.
 * The executable can be any script or binary that outputs prompt text to stdout.
 * It receives the context as JSON in its first argument.
 *
 * @param filePath - Path to the executable file (can include arguments).
 * @param prompt - The raw prompt data.
 * @param functionName - Not used for executables, but kept for interface consistency.
 * @param displayPath - Path used for generated labels and the binary/unreadable content fallback.
 * @returns Array of prompts generated from the executable.
 */
export async function processExecutableFile(
  filePath: string,
  prompt: Partial<Prompt>,
  _functionName?: string,
  displayPath: string = filePath,
): Promise<Prompt[]> {
  // For display purposes, try to read the file if it exists and is a text file
  let rawContent = displayPath;
  const script = preparePrompt(filePath, prompt.config);
  const firstPart = script.command;

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

  const label = prompt.label ?? displayPath;

  return [
    {
      raw: rawContent,
      label,
      function: (context) => renderExecutablePrompt(script, { ...context, config: prompt.config }),
      config: prompt.config,
    },
  ];
}
