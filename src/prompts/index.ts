import { globSync } from 'glob';
import logger from '../logger';
import type {
  UnifiedConfig,
  Prompt,
  ProviderOptionsMap,
  TestSuite,
  ProviderOptions,
} from '../types';
import { parsePathOrGlob } from '../util';
import { isJavascriptFile } from '../util/file';
import invariant from '../util/invariant';
import { processJsFile } from './processors/javascript';
import { processJsonFile } from './processors/json';
import { processJsonlFile } from './processors/jsonl';
import { processMarkdownFile } from './processors/markdown';
import { processPythonFile } from './processors/python';
import { processString } from './processors/string';
import { processTxtFile } from './processors/text';
import { processYamlFile } from './processors/yaml';
import { maybeFilePath, normalizeInput } from './utils';

export * from './grading';

/**
 * Reads and maps provider prompts based on the configuration and parsed prompts.
 * @param config - The configuration object.
 * @param parsedPrompts - Array of parsed prompts.
 * @returns A map of provider IDs to their respective prompts.
 */
export function readProviderPromptMap(
  config: Pick<Partial<UnifiedConfig>, 'providers'>,
  parsedPrompts: Prompt[],
): TestSuite['providerPromptMap'] {
  const ret: Record<string, string[]> = {};

  if (!config.providers) {
    return ret;
  }

  const allPrompts = [];
  for (const prompt of parsedPrompts) {
    allPrompts.push(prompt.label);
  }

  if (typeof config.providers === 'string') {
    return { [config.providers]: allPrompts };
  }

  if (typeof config.providers === 'function') {
    return { 'Custom function': allPrompts };
  }

  for (const provider of config.providers) {
    if (typeof provider === 'object') {
      // It's either a ProviderOptionsMap or a ProviderOptions
      if (provider.id) {
        const rawProvider = provider as ProviderOptions;
        invariant(
          rawProvider.id,
          'You must specify an `id` on the Provider when you override options.prompts',
        );
        ret[rawProvider.id] = rawProvider.prompts || allPrompts;
        if (rawProvider.label) {
          ret[rawProvider.label] = rawProvider.prompts || allPrompts;
        }
      } else {
        const rawProvider = provider as ProviderOptionsMap;
        const originalId = Object.keys(rawProvider)[0];
        const providerObject = rawProvider[originalId];
        const id = providerObject.id || originalId;
        ret[id] = rawProvider[originalId].prompts || allPrompts;
      }
    }
  }

  return ret;
}

/**
 * Processes a raw prompt based on its content type and path.
 * @param prompt - The raw prompt data.
 * @param basePath - Base path for file resolution.
 * @param maxRecursionDepth - Maximum recursion depth for globbing.
 * @returns Promise resolving to an array of processed prompts.
 */
export async function processPrompt(
  prompt: Partial<Prompt>,
  basePath: string = '',
  maxRecursionDepth: number = 1,
): Promise<Prompt[]> {
  invariant(
    typeof prompt.raw === 'string',
    `prompt.raw must be a string, but got ${JSON.stringify(prompt.raw)}`,
  );

  // Handling when the prompt is a raw function (e.g. javascript function)
  if (prompt.function) {
    return [prompt as Prompt];
  }

  if (!maybeFilePath(prompt.raw)) {
    return processString(prompt);
  }

  const {
    extension,
    functionName,
    isPathPattern,
    filePath,
  }: {
    extension?: string;
    functionName?: string;
    isPathPattern: boolean;
    filePath: string;
  } = parsePathOrGlob(basePath, prompt.raw);

  if (isPathPattern && maxRecursionDepth > 0) {
    const globbedPath = globSync(filePath.replace(/\\/g, '/'), {
      windowsPathsNoEscape: true,
    });
    logger.debug(
      `Expanded prompt ${prompt.raw} to ${filePath} and then to ${JSON.stringify(globbedPath)}`,
    );
    const prompts: Prompt[] = [];
    for (const globbedFilePath of globbedPath) {
      const processedPrompts = await processPrompt(
        { raw: globbedFilePath },
        basePath,
        maxRecursionDepth - 1,
      );
      prompts.push(...processedPrompts);
    }
    if (prompts.length === 0) {
      // There was nothing at this filepath, so treat it as a prompt string.
      logger.debug(
        `Attempted to load file at "${prompt.raw}", but no file found. Using raw string.`,
      );
      prompts.push(...processString(prompt));
    }
    return prompts;
  }

  if (extension === '.json') {
    return processJsonFile(filePath, prompt);
  }
  if (extension === '.jsonl') {
    return processJsonlFile(filePath, prompt);
  }
  if (extension && isJavascriptFile(extension)) {
    return processJsFile(filePath, prompt, functionName);
  }
  if (extension === '.md') {
    return processMarkdownFile(filePath, prompt);
  }
  if (extension === '.py') {
    return processPythonFile(filePath, prompt, functionName);
  }
  if (extension === '.txt') {
    return processTxtFile(filePath, prompt);
  }
  if (extension && ['.yml', '.yaml'].includes(extension)) {
    return processYamlFile(filePath, prompt);
  }
  return [];
}

/**
 * Reads and processes prompts from a specified path or glob pattern.
 * @param promptPathOrGlobs - The path or glob pattern.
 * @param basePath - Base path for file resolution.
 * @returns Promise resolving to an array of processed prompts.
 */
export async function readPrompts(
  promptPathOrGlobs: string | (string | Partial<Prompt>)[] | Record<string, string>,
  basePath: string = '',
): Promise<Prompt[]> {
  logger.debug(`Reading prompts from ${JSON.stringify(promptPathOrGlobs)}`);
  const promptPartials: Partial<Prompt>[] = normalizeInput(promptPathOrGlobs);
  const prompts: Prompt[] = [];
  for (const prompt of promptPartials) {
    const promptBatch = await processPrompt(prompt, basePath);
    if (promptBatch.length === 0) {
      throw new Error(`There are no prompts in ${JSON.stringify(prompt.raw)}`);
    }
    prompts.push(...promptBatch);
  }
  return prompts;
}
