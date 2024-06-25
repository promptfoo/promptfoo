import * as fs from 'fs';
import { globSync } from 'glob';
import yaml from 'js-yaml';
import * as path from 'path';
import { PythonShell, Options as PythonShellOptions } from 'python-shell';
import invariant from 'tiny-invariant';
import { importModule } from './esm';
import logger from './logger';
import { runPython } from './python/wrapper';
import type {
  UnifiedConfig,
  Prompt,
  ProviderOptionsMap,
  TestSuite,
  ProviderOptions,
  ApiProvider,
} from './types';
import { safeJsonStringify } from './util';

export * from './gradingPrompts';

const PROMPT_DELIMITER = process.env.PROMPTFOO_PROMPT_SEPARATOR || '---';
const VALID_FILE_EXTENSIONS = [
  '.cjs',
  '.js',
  '.json',
  '.jsonl',
  '.mjs',
  '.py',
  '.txt',
  '.yml',
  '.yaml',
];

/**
 * Reads and maps provider prompts based on the configuration and parsed prompts.
 * @param config - The configuration object.
 * @param parsedPrompts - Array of parsed prompts.
 * @returns A map of provider IDs to their respective prompts.
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
 * @param str - The string to check.
 * @returns True if the string is a valid file path, false otherwise.
 */
export function maybeFilePath(str: string): boolean {
  if (typeof str !== 'string') {
    throw new Error(`Invalid input: ${JSON.stringify(str)}`);
  }

  const forbiddenSubstrings = ['\n', 'portkey://', 'langfuse://'];
  if (forbiddenSubstrings.some((substring) => str.includes(substring))) {
    return false;
  }

  return (
    str.startsWith('file://') ||
    VALID_FILE_EXTENSIONS.some((ext) => {
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
 * @param promptPathOrGlobs - The input prompt.
 * @returns The normalized prompts.
 * @throws If the input is invalid or empty.
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
          raw: promptPathOrGlob,
        };
      }
      return {
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
 * @param filePath - Path to the JSONL file.
 * @param prompt - The raw prompt data.
 * @returns Array of prompts extracted from the file.
 */
function processJsonlFile(filePath: string, prompt: RawPrompt): Prompt[] {
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const jsonLines = fileContent.split(/\r?\n/).filter((line) => line.length > 0);
  return jsonLines.map((json) => ({
    raw: json,
    label: `${prompt.label ? `${prompt.label}: ` : ''}${filePath}: ${json}`,
  }));
}

/**
 * Processes a JSON file to extract prompts.
 * This function reads a JSON file, parses it, and maps each entry to a `Prompt` object.
 * Each prompt is labeled with the file path and the JSON content.
 *
 * @param filePath - The path to the JSON file.
 * @param prompt - The raw prompt data, used for labeling.
 * @returns An array of `Prompt` objects extracted from the JSON file.
 * @throws Will throw an error if the file cannot be read or parsed.
 */
function processJsonFile(filePath: string, prompt: RawPrompt): Prompt[] {
  try {
    const fileContents = fs.readFileSync(filePath, 'utf8');
    return [
      {
        raw: fileContents,
        label: `${prompt.label ? `${prompt.label}: ` : ''}${filePath}: ${fileContents}`,
      },
    ];
  } catch (error) {
    logger.error(`Error processing JSON file: ${error}`);
    throw new Error(`Failed to process JSON file at ${filePath}: ${error}`);
  }
}

/**
 * Processes a YAML file to extract prompts.
 * This function reads a YAML file, parses it, and maps each entry to a `Prompt` object.
 * Each prompt is labeled with the file path and the YAML content.
 *
 * @param filePath - The path to the YAML file.
 * @param prompt - The raw prompt data, used for labeling.
 * @returns An array of `Prompt` objects extracted from the YAML file.
 * @throws Will throw an error if the file cannot be read or parsed.
 */
function processYamlFile(filePath: string, prompt: RawPrompt): Prompt[] {
  try {
    const fileContents = fs.readFileSync(filePath, 'utf8');
    const yamlContent = yaml.load(fileContents, {
      json: true,
    });
    return [
      {
        raw: JSON.stringify(yamlContent),
        label: prompt.label ? `${prompt.label}: ${filePath}` : `${filePath}: ${fileContents}`,
      },
    ];
  } catch (error) {
    logger.error(`Error processing YAML file: ${error}`);
    throw new Error(`Failed to process YAML file at ${filePath}: ${error}`);
  }
}

/**
 * Processes a text file to extract prompts, splitting by a delimiter.
 * @param filePath - Path to the text file.
 * @param prompt - The raw prompt data.
 * @returns Array of prompts extracted from the file.
 */
function processTxtFile(filePath: string, prompt: RawPrompt): Prompt[] {
  const fileContent = fs.readFileSync(filePath, 'utf-8');
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
 * Python prompt function. Runs a specific function from the python file.
 * @param promptPath - Path to the Python file.
 * @param functionName - Function name to execute.
 * @param context - Context for the prompt.
 * @returns The prompts
 */
export const pythonPromptFunction = async (
  filePath: string,
  functionName: string,
  context: {
    vars: Record<string, string | object>;
    provider?: ApiProvider;
  },
) => {
  return runPython(filePath, functionName, [
    {
      ...context,
      provider: {
        id: context.provider?.id,
        label: context.provider?.label,
      },
    },
  ]);
};

/**
 * Legacy Python prompt function. Runs the whole python file.
 * @param filePath - Path to the Python file.
 * @param context - Context for the prompt.
 * @returns The prompts
 */
export const pythonPromptFunctionLegacy = async (
  filePath: string,
  context: {
    vars: Record<string, string | object>;
    provider?: ApiProvider;
  },
) => {
  const options: PythonShellOptions = {
    mode: 'text',
    pythonPath: process.env.PROMPTFOO_PYTHON || 'python',
    args: [safeJsonStringify(context)],
  };
  logger.debug(`Executing python prompt script ${filePath}`);
  const results = (await PythonShell.run(filePath, options)).join('\n');
  logger.debug(`Python prompt script ${filePath} returned: ${results}`);
  return results;
};

/**
 * Processes a Python file to extract or execute a function as a prompt.
 * @param filePath - Path to the Python file.
 * @param prompt - The raw prompt data.
 * @param functionName - Optional function name to execute.
 * @returns Array of prompts extracted or executed from the file.
 */
function processPythonFile(
  filePath: string,
  prompt: RawPrompt,
  functionName: string | undefined,
): Prompt[] {
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  return [
    {
      raw: fileContent,
      label: `${prompt.label ? `${prompt.label}: ` : ''}${prompt.raw}: ${fileContent}`,
      function: functionName
        ? (...args) => pythonPromptFunction(filePath, functionName, ...args)
        : (...args) => pythonPromptFunctionLegacy(filePath, ...args),
    },
  ];
}

/**
 * Processes a JavaScript file to import and execute a module function as a prompt.
 * @param filePath - Path to the JavaScript file.
 * @param functionName - Optional function name to execute.
 * @returns Promise resolving to an array of prompts.
 */
async function processJsFile(
  filePath: string,
  functionName: string | undefined,
): Promise<Prompt[]> {
  const promptFunction = await importModule(filePath, functionName);
  return [
    {
      raw: String(promptFunction),
      label: functionName ? `${filePath}` : `${filePath}:${String(promptFunction)}`,
      function: promptFunction,
    },
  ];
}

/**
 * Parses a file path or glob pattern to extract function names and file extensions.
 * Function names can be specified in the filename like this:
 * prompt.py:myFunction or prompts.js:myFunction.
 * @param promptPath - The path or glob pattern.
 * @returns Parsed details including function name, file extension, and directory status.
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
 * @param prompt - The raw prompt data.
 * @returns Array of prompts created from the string.
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
 * @param prompt - The raw prompt data.
 * @param basePath - Base path for file resolution.
 * @param maxRecursionDepth - Maximum recursion depth for globbing.
 * @returns Promise resolving to an array of processed prompts.
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

  let promptPath = path.join(basePath, prompt.raw);
  if (promptPath.includes('file:')) {
    promptPath = promptPath.split('file:')[1];
  }

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
    return processJsonlFile(promptPath, prompt);
  }
  if (extension === '.json') {
    return processJsonFile(promptPath, prompt);
  }
  if (extension === '.txt') {
    return processTxtFile(promptPath, prompt);
  }
  if (extension === '.py') {
    return processPythonFile(promptPath, prompt, functionName);
  }
  if (['.js', '.cjs', '.mjs'].includes(extension)) {
    return processJsFile(promptPath, functionName);
  }
  if (['.yml', '.yaml'].includes(extension)) {
    return processYamlFile(promptPath, prompt);
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

  const promptPartials: RawPrompt[] = normalizeInput(promptPathOrGlobs);
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
