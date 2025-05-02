import { globSync } from 'glob';
import logger from '../logger';
import type {
  UnifiedConfig,
  Prompt,
  PromptFunction,
  ProviderOptionsMap,
  TestSuite,
  ProviderOptions,
  EvaluateTestSuite,
} from '../types';
import { parsePathOrGlob } from '../util';
import { isJavascriptFile } from '../util/fileExtensions';
import invariant from '../util/invariant';
import { PromptSchema } from '../validators/prompts';
import { processCsvPrompts } from './processors/csv';
import { processJsFile } from './processors/javascript';
import { processJinjaFile } from './processors/jinja';
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

  if (extension === '.csv') {
    return processCsvPrompts(filePath, prompt);
  }
  if (extension === '.j2') {
    return processJinjaFile(filePath, prompt);
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

export async function processPrompts(
  prompts: EvaluateTestSuite['prompts'],
): Promise<TestSuite['prompts']> {
  return (
    await Promise.all(
      prompts.map(async (promptInput: EvaluateTestSuite['prompts'][number]) => {
        if (typeof promptInput === 'function') {
          return {
            raw: promptInput.toString(),
            label: promptInput?.name ?? promptInput.toString(),
            function: promptInput as PromptFunction,
          };
        } else if (typeof promptInput === 'string') {
          return readPrompts(promptInput);
        }
        try {
          return PromptSchema.parse(promptInput);
        } catch (error) {
          logger.warn(
            `Prompt input is not a valid prompt schema: ${error}\nFalling back to serialized JSON as raw prompt.`,
          );
          return {
            raw: JSON.stringify(promptInput),
            label: JSON.stringify(promptInput),
          };
        }
      }),
    )
  ).flat();
}

export const GEVAL_PROMPT_STEPS = `
Given an evaluation criteria which outlines how you should judge some text, generate 3-4 concise evaluation steps for any text based on the criteria below.

Evaluation Criteria:
{{criteria}}

**
IMPORTANT: Please make sure to only return in minified JSON format, with the "steps" key as a list of strings. No additional words, explanation or formatting is needed.
Example JSON:
{"steps": <list_of_strings>}
**

JSON:
`;

export const GEVAL_PROMPT_EVALUATE = `
You will be given one Reply for a Source Text below. Your task is to rate the Reply on one metric.
Please make sure you read and understand these instructions carefully. Please keep this document open while reviewing, and refer to it as needed.

Evaluation Criteria:
{{criteria}}

Evaluation Steps:
- {{steps}}
- Given the evaluation steps, return a JSON with two keys: 1) a "score" key ranging from 0 - {{maxScore}}, with {{maxScore}} being that it follows the Evaluation Criteria outlined in the Evaluation Steps and 0 being that it does not; 2) a "reason" key, a reason for the given score, but DO NOT QUOTE THE SCORE in your reason. Please mention specific information from Source Text and Reply in your reason, but be very concise with it!

Source Text:
{{input}}

Reply:
{{output}}

**
IMPORTANT: Please make sure to only return in minified JSON format, with the "score" and "reason" key. No additional words, explanation or formatting is needed.

Example JSON:
{"score":0,"reason":"The text does not follow the evaluation steps provided."}
**

JSON:
`;
