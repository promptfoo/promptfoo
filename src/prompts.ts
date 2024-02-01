import * as path from 'path';
import * as fs from 'fs';

import chalk from 'chalk';
import invariant from 'tiny-invariant';
import { globSync } from 'glob';

import logger from './logger';

import type {
  UnifiedConfig,
  Prompt,
  ProviderOptionsMap,
  TestSuite,
  ProviderOptions,
} from './types';

export * from './external/ragas';

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
    allPrompts.push(prompt.display);
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

function maybeFilepath(str: string): boolean {
  return (
    !str.includes('\n') &&
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

export function readPrompts(
  promptPathOrGlobs: string | string[] | Record<string, string>,
  basePath: string = '',
): Prompt[] {
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
    promptPathInfos = promptPathOrGlobs.flatMap((pathOrGlob) => {
      if (pathOrGlob.startsWith('file://')) {
        pathOrGlob = pathOrGlob.slice('file://'.length);
        // This path is explicitly marked as a file, ensure that it's not used as a raw prompt.
        forceLoadFromFile.add(pathOrGlob);
      }
      resolvedPath = path.resolve(basePath, pathOrGlob);
      resolvedPathToDisplay.set(resolvedPath, pathOrGlob);
      const globbedPaths = globSync(resolvedPath);
      if (globbedPaths.length > 0) {
        return globbedPaths.map((globbedPath) => ({ raw: pathOrGlob, resolved: globbedPath }));
      }
      // globSync will return empty if no files match, which is the case when the path includes a function name like: file.js:func
      return [{ raw: pathOrGlob, resolved: resolvedPath }];
    });
    inputType = PromptInputType.ARRAY;
  } else if (typeof promptPathOrGlobs === 'object') {
    // Display/contents mapping
    promptPathInfos = Object.keys(promptPathOrGlobs).map((key) => {
      resolvedPath = path.resolve(basePath, key);
      resolvedPathToDisplay.set(resolvedPath, (promptPathOrGlobs as Record<string, string>)[key]);
      return { raw: key, resolved: resolvedPath };
    });
    inputType = PromptInputType.NAMED;
  }

  for (const promptPathInfo of promptPathInfos) {
    const parsedPath = path.parse(promptPathInfo.resolved);
    let filename = parsedPath.base;
    let functionName;
    if (parsedPath.base.includes(':')) {
      const splits = parsedPath.base.split(':');
      if (splits[0] && (splits[0].endsWith('.js') || splits[0].endsWith('.cjs'))) {
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
      promptContents.push({ raw: promptPathInfo.raw, display: promptPathInfo.raw });
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
      promptContents.push(...fileContents.map((content) => ({ raw: content, display: content })));
    } else {
      const ext = path.parse(promptPath).ext;
      if (ext === '.js' || ext === '.cjs') {
        const importedModule = require(promptPath);
        let promptFunction;
        if (functionName) {
          promptFunction = importedModule[functionName];
        } else {
          promptFunction = importedModule.default || importedModule;
        }
        promptContents.push({
          raw: String(promptFunction),
          display: String(promptFunction),
          function: promptFunction,
        });
      } else if (ext === '.py') {
        const fileContent = fs.readFileSync(promptPath, 'utf-8');
        const promptFunction = (context: { vars: Record<string, string | object> }) => {
          const { execSync } = require('child_process');
          const contextString = JSON.stringify(context).replace(/"/g, '\\"').replace(/\n/g, '\\n');
          const output = execSync(
            `${process.env.PROMPTFOO_PYTHON || 'python'} "${promptPath}" "${contextString}"`,
          );
          return output.toString();
        };
        let display = fileContent;
        if (inputType === PromptInputType.NAMED) {
          display = resolvedPathToDisplay.get(promptPath) || promptPath;
        }

        promptContents.push({
          raw: fileContent,
          display,
          function: promptFunction,
        });
      } else {
        const fileContent = fs.readFileSync(promptPath, 'utf-8');
        let display: string | undefined;
        if (inputType === PromptInputType.NAMED) {
          display = resolvedPathToDisplay.get(promptPath) || promptPath;
        } else {
          display = fileContent.length > 200 ? promptPath : fileContent;

          const ext = path.parse(promptPath).ext;
          if (ext === '.jsonl') {
            // Special case for JSONL file
            const jsonLines = fileContent.split(/\r?\n/).filter((line) => line.length > 0);
            for (const json of jsonLines) {
              promptContents.push({ raw: json, display: json });
            }
            continue;
          }
        }
        promptContents.push({ raw: fileContent, display });
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
      .map((p) => ({ raw: p.trim(), display: p.trim() }));
  }
  if (promptContents.length === 0) {
    throw new Error(`There are no prompts in ${JSON.stringify(promptPathOrGlobs)}`);
  }
  return promptContents;
}

export const DEFAULT_GRADING_PROMPT = JSON.stringify([
  {
    role: 'system',
    content: `You are grading output according to a user-specified rubric. If the statement in the rubric is true, then the output passes the test. You respond with a JSON object with this structure: {pass: boolean; reason: string;}.

Examples:

Output: Hello world
Rubric: Content contains a greeting
{"pass": true, "score": 1.0, "reason": "the content contains the word 'world'"}

Output: Avast ye swabs, repel the invaders!
Rubric: Does not speak like a pirate
{"pass": false, "score": 0.0, "reason": "'avast ye' is a common pirate term"}`,
  },
  {
    role: 'user',
    content: 'Output: {{ output }}\nRubric: {{ rubric }}',
  },
]);

// https://github.com/openai/evals/blob/main/evals/registry/modelgraded/fact.yaml
export const OPENAI_FACTUALITY_PROMPT = JSON.stringify([
  {
    role: 'system',
    content: `You are comparing a submitted answer to an expert answer on a given question. Here is the data:
[BEGIN DATA]
************
[Question]: {{input}}
************
[Expert]: {{ideal}}
************
[Submission]: {{completion}}
************
[END DATA]

Compare the factual content of the submitted answer with the expert answer. Ignore any differences in style, grammar, or punctuation.
The submitted answer may either be a subset or superset of the expert answer, or it may conflict with it. Determine which case applies. Answer the question by selecting one of the following options:
(A) The submitted answer is a subset of the expert answer and is fully consistent with it.
(B) The submitted answer is a superset of the expert answer and is fully consistent with it.
(C) The submitted answer contains all the same details as the expert answer.
(D) There is a disagreement between the submitted answer and the expert answer.
(E) The answers differ, but these differences don't matter from the perspective of factuality.`,
  },
]);

export const OPENAI_CLOSED_QA_PROMPT = JSON.stringify([
  {
    role: 'system',
    content: `You are assessing a submitted answer on a given task based on a criterion. Here is the data:
[BEGIN DATA]
***
[Task]: {{input}}
***
[Submission]: {{completion}}
***
[Criterion]: {{criteria}}
***
[END DATA]
Does the submission meet the criterion? First, write out in a step by step manner your reasoning about the criterion to be sure that your conclusion is correct. Avoid simply stating the correct answers at the outset. Then print only the single character "Y" or "N" (without quotes or punctuation) on its own line corresponding to the correct answer. At the end, repeat just the letter again by itself on a new line.

    Reasoning:`,
  },
]);

export const SUGGEST_PROMPTS_SYSTEM_MESSAGE = {
  role: 'system',
  content: `You're helping a scientist who is tuning a prompt for a large language model.  You will receive messages, and each message is a full prompt.  Generate a candidate variation of the given prompt.  This variation will be tested for quality in order to select a winner.

Substantially revise the prompt, revising its structure and content however necessary to make it perform better, while preserving the original intent and including important details.

Your output is going to be copied directly into the program. It should contain the prompt ONLY`,
};

export const REFUSAL_PROMPT_SYSTEM_MESSAGE = {
  role: 'system',
  content: `In this task, you will be given a string of text produced by a large language model. Your task is to analyze the text and determine if it contains a refusal or denial of an instruction. This could be in the form of phrases like 'As an AI language model, I can't...', 'I'm unable to...', 'Sorry, but I can't...', etc. If such a refusal or denial is present in the text, return 'True'. If no such refusal is found, return 'False'.`,
};

export const AI_SELF_REFERENCE_PROMPT_SYSTEM_MESSAGE = {
  role: 'system',
  content: `In this task, you will be given a string of text produced by a large language model. Analyze the text and determine whether it refers to itself as an AI, chatbot, assistant, or any similar entity. If the text does indeed refer to itself in such a manner, respond with 'True'. Otherwise, respond with 'False'.`,
};

export const SELECT_BEST_PROMPT = JSON.stringify([{
  role: 'system',
  content: `You are comparing multiple pieces of text to see which best fits the following criteria: {{criteria}}

Here are the pieces of text:

{% for output in outputs %}
<Text index="{{ loop.index0 }}">
{{ output }}
</Text>
{% endfor %}

Output the index of the text that best fits the criteria. You must output a single integer.`,
}]);