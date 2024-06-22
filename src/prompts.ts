import * as path from 'path';
import * as fs from 'fs';

import chalk from 'chalk';
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

export function maybeFilePath(str: string): boolean {
  if (typeof str !== 'string') {
    throw new Error(`Invalid input: ${JSON.stringify(str)}`);
  }

  const forbiddenSubstrings = ['\n', 'portkey://', 'langfuse://'];
  if (forbiddenSubstrings.some((substring) => str.includes(substring))) {
    return false;
  }

  const containsDot = str.charAt(str.length - 3) === '.' || str.charAt(str.length - 4) === '.';
  const hasValidFileExtension =
    str.endsWith('.') ||
    str.includes('*') ||
    str.includes('/') ||
    str.includes('\\') ||
    str.startsWith('file://');
  return hasValidFileExtension || containsDot;
}

enum PromptInputType {
  STRING = 1,
  ARRAY = 2,
  NAMED = 3,
}

/*
export interface Prompt {
  id?: string;
  raw: string;
  display?: string; // deprecated
  label: string;
  function?: (context: {
    vars: Record<string, string | object>;
    provider?: ApiProvider;
  }) => Promise<string | object>;
}
*/

type RawPrompt = Partial<Prompt> & {
  source?: string; // The source of the prompt, such as a file path or a string. Could also be an index in the array or a key in the object.
};

/**
 * Normalize the input prompt to an array of prompts. Rejects invalid and empty inputs.
 * @param {string | (string | Partial<Prompt>)[] | Record<string, string>} promptPathOrGlobs The input prompt.
 * @returns {Partial<Prompt>[]} The normalized prompts.
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
        ...promptPathOrGlob,
      };
    });
  }
  if (typeof promptPathOrGlobs === 'object' && Object.keys(promptPathOrGlobs).length) {
    return Object.entries(promptPathOrGlobs).map(([key, raw]) => ({
      source: key,
      raw,
    }));
  }
  // numbers, booleans, etc
  throw new Error(`Invalid input prompt: ${JSON.stringify(promptPathOrGlobs)}`);
}

export function hydratePrompt(prompt: RawPrompt, basePath: string = ''): Prompt[] {
  const rawPath = prompt.raw;

  invariant(rawPath, `prompt.raw must be a string, but got ${JSON.stringify(prompt.raw)}`);

  console.warn('rawPath', rawPath);

  if (!maybeFilePath(rawPath)) {
    return [
      {
        raw: rawPath,
        label: `${prompt.source ? `${prompt.source}: ` : ''}${rawPath}`,
      },
    ];
  }

  const promptPath = path.join(basePath, rawPath);

  let stat;
  try {
    stat = fs.statSync(promptPath);
  } catch (err) {
    if (process.env.PROMPTFOO_STRICT_FILES) {
      throw err;
    }
    // If the path doesn't exist, it's probably a raw prompt
    // prompts.push({ raw: promptPathInfo.raw, label: promptPathInfo.raw });
  }
  console.warn('----stat----', stat);
  if (stat?.isDirectory()) {
    return [];
  }








  const extension = path.parse(promptPath).ext;
  console.warn('extension', extension, 'promptPath', promptPath);
  if (extension === '.txt') {
    const fileContent = fs.readFileSync(promptPath, 'utf-8');
    // console.warn('-------fileContent-------', fileContent);
    const prompts: Prompt[] = fileContent
      .split(PROMPT_DELIMITER)
      .map((p) => ({
        raw: p.trim(),
        label: `${prompt.raw}: ${p.trim()}`,
      }))
      .filter((p) => p.raw.length > 0);
    // console.warn('-------prompts-------', prompts);
    if (prompts.length === 0) {
      throw new Error(`There are no prompts in ${JSON.stringify(prompt.raw)}`);
    }
    return prompts;
  }

  // ** globs
  const resolvedPath = path.resolve(basePath, rawPath);
  const globbedPaths = globSync(resolvedPath.replace(/\\/g, '/'), {
    windowsPathsNoEscape: true,
  });
  console.warn('globbedPaths', globbedPaths);
  logger.debug(
    `Expanded prompt ${rawPath} to ${resolvedPath} and then to ${JSON.stringify(globbedPaths)}`,
  );
  if (globbedPaths.length > 0) {
    return globbedPaths.map((globbedPath) => ({
      raw: rawPath,
      label: globbedPath,
    }));
  }
  return [];

  /*

  const parsedPath = path.parse(promptPath);

  // ** functions
  let filename = parsedPath.base;
  let functionName: string | undefined;
  if (parsedPath.base.includes(':')) {
    const splits = parsedPath.base.split(':');
    if (splits[0] && ['js', 'cjs', 'mjs', 'py'].includes(splits[0].split('.')[0])) {
      [filename, functionName] = splits;
    }
  } */
}

export async function readPrompts(
  promptPathOrGlobs: string | (string | Partial<Prompt>)[] | Record<string, string>,
  basePath: string = '',
): Promise<Prompt[]> {
  logger.debug(`Reading prompts from ${JSON.stringify(promptPathOrGlobs)}`);

  const promptPartials = normalizeInput(promptPathOrGlobs);
  console.warn('promptPartials', promptPartials);

  const prompts: Prompt[] = promptPartials.flatMap((prompt) => hydratePrompt(prompt, basePath));

  return prompts;
}

/*


  const forceLoadFromFile = new Set<string>(); // files to load prompts from
  const resolvedPathToDisplay = new Map<string, string>();

  const promptPathInfos: { raw: string; resolved: string | undefined }[] = promptPartials.flatMap(
    (prompt) => {
      invariant(prompt.raw, `Prompt path must be a string, but got ${JSON.stringify(prompt.raw)}`);
      if (prompt.raw.startsWith('file://') || maybeFilePath(prompt.raw)) {
        // This path is explicitly marked as a file, ensure that it's not used as a raw prompt.
        forceLoadFromFile.add(prompt.raw.slice('file://'.length));
      }
      const rawPath = prompt.raw;
      let resolvedPath;
      if (maybeFilePath(prompt.raw)) {
        resolvedPath = path.resolve(basePath, prompt.raw);
        const globbedPaths = globSync(resolvedPath.replace(/\\/g, '/'), {
          windowsPathsNoEscape: true,
        });
        logger.debug(
          `Expanded prompt ${rawPath} to ${resolvedPath} and then to ${JSON.stringify(globbedPaths)}`,
        );
        if (globbedPaths.length > 0) {
          return globbedPaths.map((globbedPath) => ({ raw: rawPath, resolved: globbedPath }));
        }
      }
      // globSync will return empty if no files match, which is the case when the path includes a function name like: file.js:func
      return [{ raw: rawPath, resolved: resolvedPath }];
    },
  );

  logger.debug(`Resolved prompt paths: ${JSON.stringify(promptPathInfos)}`);

  for (const promptPathInfo of promptPathInfos) {
    const parsedPath = path.parse(promptPathInfo.raw);
    let filename = parsedPath.base;
    let functionName: string | undefined;
    if (parsedPath.base.includes(':')) {
      const splits = parsedPath.base.split(':');
      if (
        splits[0] &&
        (splits[0].endsWith('.js') ||
          splits[0].endsWith('.cjs') ||
          splits[0].endsWith('.mjs') ||
          splits[0].endsWith('.py'))
      ) {
        [filename, functionName] = splits;
      }
    }
    const promptPath = path.join(parsedPath.dir, filename);
    let stat;
    let usedRaw = false;
    try {
      stat = fs.statSync(promptPath);
    } catch (err) {
      if (process.env.PROMPTFOO_STRICT_FILES || forceLoadFromFile.has(filename)) {
        throw err;
      }
      // If the path doesn't exist, it's probably a raw prompt
      prompts.push({ raw: promptPathInfo.raw, label: promptPathInfo.raw });
      usedRaw = true;
    }
    if (usedRaw) {
      if (maybeFilePath(promptPathInfo.raw)) {
        // It looks like a filepath, so falling back could be a mistake. Print a warning
        logger.warn(
          `Could not find prompt file: "${chalk.red(filename)}". Treating it as a text prompt.`,
        );
      }
    } else if (stat?.isDirectory()) {
      // FIXME(ian): Make directory handling share logic with file handling.
      const filesInDirectory = fs.readdirSync(promptPath);
      const fileContents = filesInDirectory.map((fileName) => {
        const joinedPath = path.join(promptPath, fileName);
        resolvedPath = path.resolve(basePath, joinedPath);
        resolvedPathToDisplay.set(resolvedPath, joinedPath);
        return fs.readFileSync(resolvedPath, 'utf-8');
      });
      promptContents.push(...fileContents.map((content) => ({ raw: content, label: content })));
    } else {
      const ext = path.parse(promptPath).ext;
      if (ext === '.js' || ext === '.cjs' || ext === '.mjs') {
        const promptFunction = await importModule(promptPath, functionName);
        const resolvedPathLookup = functionName ? `${promptPath}:${functionName}` : promptPath;
        promptContents.push({
          raw: String(promptFunction),
          label: resolvedPathToDisplay.get(resolvedPathLookup) || String(promptFunction),
          function: promptFunction,
        });
      } else if (ext === '.py') {
        const fileContent = fs.readFileSync(promptPath, 'utf-8');
        const promptFunction = async (context: {
          vars: Record<string, string | object>;
          provider?: ApiProvider;
        }) => {
          if (functionName) {
            return runPython(promptPath, functionName, [
              {
                ...context,
                provider: {
                  id: context.provider?.id,
                  label: context.provider?.label,
                },
              },
            ]);
          } else {
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
          }
        };
        let label = fileContent;

        const resolvedPathLookup = functionName ? `${promptPath}:${functionName}` : promptPath;
        label = resolvedPathToDisplay.get(resolvedPathLookup) || resolvedPathLookup;

        promptContents.push({
          raw: fileContent,
          label,
          function: promptFunction,
        });
      } else {
        const fileContent = fs.readFileSync(promptPath, 'utf-8');
        const label: string | undefined =
          resolvedPathToDisplay.get(promptPath) ||
          (fileContent?.length > 200 ? promptPath : fileContent);

        const ext = path.parse(promptPath).ext;
        if (ext === '.jsonl') {
          // Special case for JSONL file
          const jsonLines = fileContent.split(/\r?\n/).filter((line) => line.length > 0);
          for (const json of jsonLines) {
            promptContents.push({ raw: json, label: json });
          }
          continue;
        }
        // }
        promptContents.push({ raw: fileContent, label });
      }
    }
  }

  if (
    // promptContents.length === 1 &&
    //inputType !== PromptInputType.NAMED &&
    !promptContents[0]['function']
  ) {
    // Split raw text file into multiple prompts
    const content = promptContents[0].raw;
    promptContents = content
      .split(PROMPT_DELIMITER)
      .map((p) => ({ raw: p.trim(), label: p.trim() }));
  }
  if (promptContents.length === 0) {
    throw new Error(`There are no prompts in ${JSON.stringify(promptPathOrGlobs)}`);
  }
  return promptContents;
}
*/
