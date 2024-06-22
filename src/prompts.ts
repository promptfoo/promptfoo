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

export function maybeFilepath(str: string): boolean {
  return (
    !str.includes('\n') &&
    !str.includes('portkey://') &&
    !str.includes('langfuse://') &&
    (str.includes('/') ||
      str.includes('\\') ||
      str.includes('*') ||
      str.charAt(str.length - 3) === '.' ||
      str.charAt(str.length - 4) === '.')
  );
}

enum PromptInputType {
  STRING = 1,
  ARRAY = 2,
  NAMED = 3,
}

export async function readPrompts(
  promptPathOrGlobs: string | (string | Partial<Prompt>)[] | Record<string, string>,
  basePath: string = '',
): Promise<Prompt[]> {
  logger.debug(`Reading prompts from ${JSON.stringify(promptPathOrGlobs)}`);
  let promptPathInfos: { raw: string; resolved: string }[] = [];
  let promptContents: Prompt[] = [];

  let inputType: PromptInputType | undefined;
  let resolvedPath: string | undefined;
  const forceLoadFromFile = new Set<string>();
  const resolvedPathToDisplay = new Map<string, string>();
  if (typeof promptPathOrGlobs === 'string') {
    // Path to a prompt file
    if (promptPathOrGlobs.startsWith('file://')) {
      promptPathOrGlobs = promptPathOrGlobs.slice('file://'.length);
      // Ensure this path is not used as a raw prompt.
      forceLoadFromFile.add(promptPathOrGlobs);
    }
    resolvedPath = path.resolve(basePath, promptPathOrGlobs);
    promptPathInfos = [{ raw: promptPathOrGlobs, resolved: resolvedPath }];
    resolvedPathToDisplay.set(resolvedPath, promptPathOrGlobs);
    inputType = PromptInputType.STRING;
  } else if (Array.isArray(promptPathOrGlobs)) {
    // TODO(ian): Handle object array, such as OpenAI messages
    inputType = PromptInputType.ARRAY;
    promptPathInfos = promptPathOrGlobs.flatMap((pathOrGlob) => {
      let label;
      let rawPath: string;
      if (typeof pathOrGlob === 'object') {
        // Parse prompt config object {id, label}
        invariant(
          pathOrGlob.label,
          `Prompt object requires label, but got ${JSON.stringify(pathOrGlob)}`,
        );
        label = pathOrGlob.label;
        invariant(
          pathOrGlob.id,
          `Prompt object requires id, but got ${JSON.stringify(pathOrGlob)}`,
        );
        rawPath = pathOrGlob.id;
        inputType = PromptInputType.NAMED;
      } else {
        label = pathOrGlob;
        rawPath = pathOrGlob;
      }
      invariant(
        typeof rawPath === 'string',
        `Prompt path must be a string, but got ${JSON.stringify(rawPath)}`,
      );
      if (rawPath.startsWith('file://')) {
        rawPath = rawPath.slice('file://'.length);
        // This path is explicitly marked as a file, ensure that it's not used as a raw prompt.
        forceLoadFromFile.add(rawPath);
      }
      resolvedPath = path.resolve(basePath, rawPath);
      resolvedPathToDisplay.set(resolvedPath, label);
      const globbedPaths = globSync(resolvedPath.replace(/\\/g, '/'), {
        windowsPathsNoEscape: true,
      });
      logger.debug(
        `Expanded prompt ${rawPath} to ${resolvedPath} and then to ${JSON.stringify(globbedPaths)}`,
      );
      if (globbedPaths.length > 0) {
        return globbedPaths.map((globbedPath) => ({ raw: rawPath, resolved: globbedPath }));
      }
      // globSync will return empty if no files match, which is the case when the path includes a function name like: file.js:func
      return [{ raw: rawPath, resolved: resolvedPath }];
    });
  } else if (typeof promptPathOrGlobs === 'object') {
    // Display/contents mapping
    promptPathInfos = Object.keys(promptPathOrGlobs).map((key) => {
      resolvedPath = path.resolve(basePath, key);
      resolvedPathToDisplay.set(resolvedPath, (promptPathOrGlobs as Record<string, string>)[key]);
      return { raw: key, resolved: resolvedPath };
    });
    inputType = PromptInputType.NAMED;
  }

  logger.debug(`Resolved prompt paths: ${JSON.stringify(promptPathInfos)}`);

  for (const promptPathInfo of promptPathInfos) {
    const parsedPath = path.parse(promptPathInfo.resolved);
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
      promptContents.push({ raw: promptPathInfo.raw, label: promptPathInfo.raw });
      usedRaw = true;
    }
    if (usedRaw) {
      if (maybeFilepath(promptPathInfo.raw)) {
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
        if (inputType === PromptInputType.NAMED) {
          const resolvedPathLookup = functionName ? `${promptPath}:${functionName}` : promptPath;
          label = resolvedPathToDisplay.get(resolvedPathLookup) || resolvedPathLookup;
        }

        promptContents.push({
          raw: fileContent,
          label,
          function: promptFunction,
        });
      } else {
        const fileContent = fs.readFileSync(promptPath, 'utf-8');
        let label: string | undefined;
        if (inputType === PromptInputType.NAMED) {
          label = resolvedPathToDisplay.get(promptPath) || promptPath;
        } else {
          label = fileContent.length > 200 ? promptPath : fileContent;

          const ext = path.parse(promptPath).ext;
          if (ext === '.jsonl') {
            // Special case for JSONL file
            const jsonLines = fileContent.split(/\r?\n/).filter((line) => line.length > 0);
            for (const json of jsonLines) {
              promptContents.push({ raw: json, label: json });
            }
            continue;
          }
        }
        promptContents.push({ raw: fileContent, label });
      }
    }
  }

  if (
    promptContents.length === 1 &&
    inputType !== PromptInputType.NAMED &&
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
