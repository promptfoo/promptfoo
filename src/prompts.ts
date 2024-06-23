import * as path from 'path';
import * as fs from 'fs';

import invariant from 'tiny-invariant';
import { globSync } from 'glob';
import { PythonShell, Options as PythonShellOptions } from 'python-shell';

import logger from './logger';
import { runPython } from './python/wrapper';
import { importModule } from './esm';
import { safeJsonStringify } from './util';

import type {
  UnifiedConfig,
  Prompt,
  ProviderOptionsMap,
  TestSuite,
  ProviderOptions,
  ApiProvider,
} from './types';

export * from './gradingPrompts';

const PROMPT_DELIMITER = process.env.PROMPTFOO_PROMPT_SEPARATOR || '---';

/**
 * Reads and maps provider prompts based on the configuration and parsed prompts.
 * @param {Partial<UnifiedConfig>} config - The configuration object.
 * @param {Prompt[]} parsedPrompts - Array of parsed prompts.
 * @returns {TestSuite['providerPromptMap']} A map of provider IDs to their respective prompts.
 */
export function readProviderPromptMap(
  config: Partial<UnifiedConfig>,
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
 * Determines if a string is a valid file path.
 * @param {string} str - The string to check.
 * @returns {boolean} True if the string is a valid file path, false otherwise.
 */
export function maybeFilePath(str: string): boolean {
  if (typeof str !== 'string') {
    throw new Error(`Invalid input: ${JSON.stringify(str)}`);
  }

  const forbiddenSubstrings = ['\n', 'portkey://', 'langfuse://'];
  if (forbiddenSubstrings.some((substring) => str.includes(substring))) {
    return false;
  }

  const validFileExtensions = ['.cjs', '.js', '.json', '.jsonl', '.mjs', '.py', '.txt'];
  return (
    str.startsWith('file://') ||
    validFileExtensions.some((ext) => {
      const tokens = str.split(':'); // str may be file.js:functionName
      // Checks if the second to last token or the last token ends with the extension
      return tokens.pop()?.endsWith(ext) || tokens.pop()?.endsWith(ext);
    }) ||
    str.charAt(str.length - 3) === '.' ||
    str.charAt(str.length - 4) === '.' ||
    str.endsWith('.') ||
    str.includes('*') ||
    str.includes('/') ||
    str.includes('\\')
  );
}

type RawPrompt = Partial<Prompt> & {
  // The source of the prompt, such as a file path or a string.
  // Could also be an index in the array or a key in the object.
  source?: string;
};

/**
 * Normalizes the input prompt to an array of prompts, rejecting invalid and empty inputs.
 * @param {string | (string | Partial<Prompt>)[] | Record<string, string>} promptPathOrGlobs - The input prompt.
 * @returns {RawPrompt[]} The normalized prompts.
 * @throws {Error} If the input is invalid or empty.
 */
export function normalizeInput(
  promptPathOrGlobs: string | (string | Partial<Prompt>)[] | Record<string, string>,
): RawPrompt[] {
  if (
    !promptPathOrGlobs ||
    ((typeof promptPathOrGlobs === 'string' || Array.isArray(promptPathOrGlobs)) &&
      promptPathOrGlobs.length === 0)
  ) {
    throw new Error(`Invalid input prompt: ${JSON.stringify(promptPathOrGlobs)}`);
  }
  if (typeof promptPathOrGlobs === 'string') {
    return [
      {
        raw: promptPathOrGlobs,
      },
    ];
  }
  if (Array.isArray(promptPathOrGlobs)) {
    return promptPathOrGlobs.map((promptPathOrGlob, index) => {
      if (typeof promptPathOrGlob === 'string') {
        return {
          source: `${index}`,
          raw: promptPathOrGlob,
        };
      }
      return {
        source: `${index}`,
        raw: promptPathOrGlob.raw || promptPathOrGlob.id,
        ...promptPathOrGlob,
      };
    });
  }

  if (typeof promptPathOrGlobs === 'object' && Object.keys(promptPathOrGlobs).length) {
    /* NOTE: This format is considered legacy and has been deprecated. Example:
    {
      'prompts.txt': 'foo1',
      'prompts.py': 'foo2',
    }
    */
    return Object.entries(promptPathOrGlobs).map(([raw, key]) => ({
      label: key,
      raw: raw,
      source: raw,
    }));
  }
  // numbers, booleans, etc
  throw new Error(`Invalid input prompt: ${JSON.stringify(promptPathOrGlobs)}`);
}

/**
 * Processes a JSONL file to extract prompts.
 * @param {string} filePath - Path to the JSONL file.
 * @param {string | undefined} labelPrefix - Optional prefix for labels.
 * @param {string} rawPath - Raw path of the file.
 * @returns {Prompt[]} Array of prompts extracted from the file.
 */
function processJsonlFile(
  filePath: string,
  labelPrefix: string | undefined,
  rawPath: string,
): Prompt[] {
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const jsonLines = fileContent.split(/\r?\n/).filter((line) => line.length > 0);
  return jsonLines.map((json) => ({
    raw: json,
    label: `${labelPrefix ? `${labelPrefix}: ` : ''}${rawPath}: ${json}`,
  }));
}

/**
 * Processes a text file to extract prompts, splitting by a delimiter.
 * @param {string} promptPath - Path to the text file.
 * @param {RawPrompt} prompt - The raw prompt data.
 * @returns {Prompt[]} Array of prompts extracted from the file.
 */
function processTxtFile(promptPath: string, prompt: RawPrompt): Prompt[] {
  const fileContent = fs.readFileSync(promptPath, 'utf-8');
  return fileContent
    .split(PROMPT_DELIMITER)
    .map((p) => ({
      raw: p.trim(),
      label: prompt.label
        ? `${prompt.label}: ${prompt.raw}: ${p.trim()}`
        : `${prompt.raw}: ${p.trim()}`,
    }))
    .filter((p) => p.raw.length > 0); // handle leading/trailing delimiters and empty lines
}

/**
 * Processes a Python file to extract or execute a function as a prompt.
 * @param {string} promptPath - Path to the Python file.
 * @param {RawPrompt} prompt - The raw prompt data.
 * @param {string | undefined} functionName - Optional function name to execute.
 * @param {string} rawPath - Raw path of the file.
 * @returns {Prompt[]} Array of prompts extracted or executed from the file.
 */
function processPythonFile(
  promptPath: string,
  prompt: RawPrompt,
  functionName: string | undefined,
  rawPath: string,
): Prompt[] {
  const fileContent = fs.readFileSync(promptPath, 'utf-8');
  const promptFunction = async (context: {
    vars: Record<string, string | object>;
    provider?: ApiProvider;
  }) => {
    return runPython(promptPath, functionName as string, [
      {
        ...context,
        provider: {
          id: context.provider?.id,
          label: context.provider?.label,
        },
      },
    ]);
  };
  const promptFunctionLegacy = async (context: {
    vars: Record<string, string | object>;
    provider?: ApiProvider;
  }) => {
    // Legacy: run the whole file
    const options: PythonShellOptions = {
      mode: 'text',
      pythonPath: process.env.PROMPTFOO_PYTHON || 'python',
      args: [safeJsonStringify(context)],
    };
    logger.debug(`Executing python prompt script ${promptPath}`);
    const results = (await PythonShell.run(promptPath, options)).join('\n');
    logger.debug(`Python prompt script ${promptPath} returned: ${results}`);
    return results;
  };
  return [
    {
      raw: fileContent,
      label: `${prompt.label ? `${prompt.label}: ` : ''}${rawPath}: ${fileContent}`,
      function: functionName ? promptFunction : promptFunctionLegacy,
    },
  ];
}

/**
 * Processes a JavaScript file to import and execute a module function as a prompt.
 * @param {string} promptPath - Path to the JavaScript file.
 * @param {string | undefined} functionName - Optional function name to execute.
 * @returns {Promise<Prompt[]>} Promise resolving to an array of prompts.
 */
async function processJsFile(
  promptPath: string,
  functionName: string | undefined,
): Promise<Prompt[]> {
  const promptFunction = await importModule(promptPath, functionName);
  return [
    {
      raw: String(promptFunction),
      label: functionName
        ? `${promptPath}`
        : `${promptPath}:${String(promptFunction)}`,
      function: promptFunction,
    },
  ];
}

/**
 * Parses a file path or glob pattern to extract function names and file extensions.
 * Function names can be specified in the filename like this:
 * prompt.py:myFunction or prompts.js:myFunction.
 * @param {string} promptPath - The path or glob pattern.
 * @returns {{functionName?: string; extension: string; isDirectory: boolean}} Parsed details including function name, file extension, and directory status.
 */
function parsePathOrGlob(promptPath: string): {
  functionName?: string;
  extension: string;
  isDirectory: boolean;
} {
  let stats;
  try {
    stats = fs.statSync(promptPath);
  } catch (err) {
    if (process.env.PROMPTFOO_STRICT_FILES) {
      throw err;
    }
  }
  let filename = path.parse(promptPath).base;
  let functionName: string | undefined;

  if (filename.includes(':')) {
    const splits = filename.split(':');
    if (splits[0] && ['.js', '.cjs', '.mjs', '.py'].some((ext) => splits[0].endsWith(ext))) {
      [filename, functionName] = splits;
    }
  }
  const parsedPath = path.parse(filename);
  const extension = parsedPath.ext;

  return { functionName, extension, isDirectory: stats?.isDirectory() ?? false };
}

/**
 * Processes a string as a literal prompt.
 * @param {RawPrompt} prompt - The raw prompt data.
 * @returns {Prompt[]} Array of prompts created from the string.
 */
function processString(prompt: RawPrompt): Prompt[] {
  return [
    {
      raw: prompt!.raw as string,
      label: `${prompt.source ? `${prompt.source}: ` : ''}${prompt.raw}`,
    },
  ];
}

/**
 * Processes a raw prompt based on its content type and path.
 * @param {RawPrompt} prompt - The raw prompt data.
 * @param {string} basePath - Base path for file resolution.
 * @returns {Promise<Prompt[]>} Promise resolving to an array of processed prompts.
 */
export async function processPrompt(
  prompt: RawPrompt,
  basePath: string = '',
  maxRecursionDepth: number = 1,
): Promise<Prompt[]> {
  invariant(
    typeof prompt.raw === 'string',
    `prompt.raw must be a string, but got ${JSON.stringify(prompt.raw)}`,
  );
  if (!maybeFilePath(prompt.raw)) {
    // literal prompt
    return processString(prompt);
  }
  const promptPath = path.join(basePath, prompt.raw);
  const {
    extension,
    functionName,
    isDirectory,
  }: {
    extension: string;
    functionName?: string;
    isDirectory: boolean;
  } = parsePathOrGlob(promptPath);

  if (isDirectory && maxRecursionDepth > 0) {
    const globbedPath = globSync(promptPath.replace(/\\/g, '/'), {
      windowsPathsNoEscape: true,
    });
    logger.debug(
      `Expanded prompt ${prompt.raw} to ${promptPath} and then to ${JSON.stringify(globbedPath)}`,
    );
    const globbedFilePaths = globbedPath.flatMap((globbedPath) => {
      const filenames = fs.readdirSync(globbedPath);
      return filenames.map((filename) => path.join(globbedPath, filename));
    });
    const prompts: Prompt[] = [];
    for (const globbedFilePath of globbedFilePaths) {
      const processedPrompts = await processPrompt(
        { raw: globbedFilePath },
        basePath,
        maxRecursionDepth - 1,
      );
      prompts.push(...processedPrompts);
    }
    return prompts;
  }
  if (extension === '.jsonl') {
    return processJsonlFile(promptPath, prompt.label, prompt.raw);
  }
  if (extension === '.txt') {
    return processTxtFile(promptPath, prompt);
  }
  if (extension === '.py') {
    return processPythonFile(promptPath, prompt, functionName, prompt.raw);
  }
  if (['.js', '.cjs', '.mjs'].includes(extension)) {
    return processJsFile(promptPath, functionName);
  }
  return [];
}

/**
 * Reads and processes prompts from a specified path or glob pattern.
 * @param {string | (string | Partial<Prompt>)[] | Record<string, string>} promptPathOrGlobs - The path or glob pattern.
 * @param {string} basePath - Base path for file resolution.
 * @returns {Promise<Prompt[]>} Promise resolving to an array of processed prompts.
 */
export async function readPrompts(
  promptPathOrGlobs: string | (string | Partial<Prompt>)[] | Record<string, string>,
  basePath: string = '',
): Promise<Prompt[]> {
  logger.debug(`Reading prompts from ${JSON.stringify(promptPathOrGlobs)}`);

  const promptPartials: RawPrompt[] = normalizeInput(promptPathOrGlobs);
  const promptBatches: Prompt[][] = [];
  for (const prompt of promptPartials) {
    const promptBatch = await processPrompt(prompt, basePath);
    if (promptBatch.length === 0) {
      throw new Error(`There are no prompts in ${JSON.stringify(prompt.raw)}`);
    }
    promptBatches.push(promptBatch);
  }
  const prompts: Prompt[] = promptBatches.flat();
  return prompts;
}
