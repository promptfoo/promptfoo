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

// G-Eval prompts
export const GEVAL_PROMPT_STEPS = JSON.stringify([
  {
    role: 'system',
    content: `Given an evaluation criteria, produce a numbered list of evaluation steps.

The output should be plain text, with each step on a new line starting with its number. E.g.:
1. Clarity: Assess if the submission is clear and easy to understand.
2. Relevance: Check if the submission addresses the criteria directly.
...`,
  },
  {
    role: 'user',
    content: 'Evaluation criteria:\n{{criteria}}',
  },
]);

export const GEVAL_PROMPT_EVALUATE = JSON.stringify([
  {
    role: 'system',
    content: `You are assessing a submitted answer on a given task based on a given criteria. Here is the data:

[BEGIN DATA]
***
[Task]: {{input}}
***
[Submission]: {{output}}
***
[Criteria]: {{criteria}}
***
[Steps]: {{steps}}
***
[END DATA]

Please follow the evaluation steps and produce a score between 1 and {{maxScore}}. Then at the very end, output a JSON object in the following format:
{"score": X, "reason": "Brief explanation of the score."}`,
  },
]);

export const RESEARCH_RUBRIC_FINAL_EVALUATION = `You are an AI grader evaluating the accuracy of an output using web search.

Output to evaluate: {{output}}
Evaluation criteria: {{rubric}}
{% if prompt %}
Original prompt that generated the output: {{prompt}}
{% endif %}

YOUR TASK:
1. Identify key factual claims in the output that need verification
2. Use web search to verify each claim (current data, facts, citations, etc.)
3. Evaluate the overall accuracy based on your findings

IMPORTANT:
- You MUST use web search to verify factual claims
- Check dates, numbers, names, and any specific claims
- If output mentions citations/papers, verify they exist
- For current information (prices, weather, news), check against live data

Return a JSON object with this exact structure:
{
  "pass": boolean (true if output meets accuracy criteria, false otherwise),
  "score": number (0.0 to 1.0, representing accuracy percentage),
  "reason": "Clear explanation of what you found and why it passes/fails",
  "verifiedClaims": ["List of claims you successfully verified"],
  "failedClaims": ["List of claims that were incorrect or unverifiable"]
}`;
