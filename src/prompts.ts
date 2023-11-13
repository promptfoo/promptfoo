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

const PROMPT_DELIMITER = '---';

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

export const ANSWER_RELEVANCY_GENERATE = {
  role: 'system',
  content: `Your job is to generate a potential question for a given answer. For each input, output ONLY the question`,
};

export const CONTEXT_RECALL = `Given a context, and an answer, analyze each sentence in the answer and classify if the sentence can be attributed to the given context or not.
Think in steps and reason before coming to conclusion.

context: Albert Einstein (14 March 1879 – 18 April 1955) was a German-born theoretical physicist,widely held to be one of the greatest and most influential scientists of all time. Best known for developing the theory of relativity, he also made important contributions to quantum mechanics, and was thus a central figure in the revolutionary reshaping of the scientific understanding of nature that modern physics accomplished in the first decades of the twentieth century. His mass–energy equivalence formula E = mc2, which arises from relativity theory, has been called "the world's most famous equation". He received the 1921 Nobel Prize in Physics "for his services to theoretical physics, and especially for his discovery of the law of the photoelectric effect", a pivotal step in the development of quantum theory. His work is also known for its influence on the philosophy of science. In a 1999 poll of 130 leading physicists worldwide by the British journal Physics World, Einstein was ranked the greatest physicist of all time. His intellectual achievements and originality have made Einstein synonymous with genius.
answer: Albert Einstein born in 14 March 1879 was  German-born theoretical physicist, widely held to be one of the greatest and most influential scientists of all time. He received the 1921 Nobel Prize in Physics "for his services to theoretical physics. He published 4 papers in 1905.  Einstein moved to Switzerland in 1895
classification
1. Albert Einstein born in 14 March 1879 was  German-born theoretical physicist, widely held to be one of the greatest and most influential scientists of all time. The date of birth of Einstein is mentioned clearly in the context. So [Attributed]
2. He received the 1921 Nobel Prize in Physics "for his services to theoretical physics. The exact sentence is present in the given context. So [Attributed]
3. He published 4 papers in 1905. There is no mention about papers he wrote in given the context. So [Not Attributed]
4. Einstein moved to Switzerland in 1895. There is not supporting evidence for this in the given the context. So [Not Attributed]

context:{{context}}
answer:{{groundTruth}}
classification:
`;

export const CONTEXT_RECALL_ATTRIBUTED_TOKEN = '[Attributed]';

export const CONTEXT_RELEVANCE = `Please extract relevant sentences from the provided context that is absolutely required answer the following query. If no relevant sentences are found, or if you believe the query cannot be answered from the given context, return the phrase "Insufficient Information".  While extracting candidate sentences you're not allowed to make any changes to sentences from given context.

query: {{query}}
context: {{context}}
candidate sentences:
`;

export const CONTEXT_RELEVANCE_BAD = 'Insufficient Information';

export const CONTEXT_FAITHFULNESS_LONGFORM = `Given a question and answer, create one or more statements from each sentence in the given answer.
question: Who was  Albert Einstein and what is he best known for?
answer: He was a German-born theoretical physicist, widely acknowledged to be one of the greatest and most influential physicists of all time. He was best known for developing the theory of relativity, he also made important contributions to the development of the theory of quantum mechanics.
statements:\nAlbert Einstein was born in Germany.\nAlbert Einstein was best known for his theory of relativity.
question: Cadmium Chloride is slightly soluble in this chemical, it is also called what?
answer: alcohol
statements:\nCadmium Chloride is slightly soluble in alcohol.
question: Were Shahul and Jithin of the same nationality?
answer: They were from different countries.
statements:\nShahul and Jithin were from different countries.
question:{{question}}
answer: {{answer}}
statements:\n`;

export const CONTEXT_FAITHFULNESS_NLI_STATEMENTS = `Prompt: Natural language inference
Consider the given context and following statements, then determine whether they are supported by the information present in the context.Provide a brief explanation for each statement before arriving at the verdict (Yes/No). Provide a final verdict for each statement in order at the end in the given format. Do not deviate from the specified format.

Context:\nJohn is a student at XYZ University. He is pursuing a degree in Computer Science. He is enrolled in several courses this semester, including Data Structures, Algorithms, and Database Management. John is a diligent student and spends a significant amount of time studying and completing assignments. He often stays late in the library to work on his projects.
statements:\n1. John is majoring in Biology.\n2. John is taking a course on Artificial Intelligence.\n3. John is a dedicated student.\n4. John has a part-time job.\n5. John is interested in computer programming.\n
Answer:
1. John is majoring in Biology.
Explanation: John's major is explicitly mentioned as Computer Science. There is no information suggesting he is majoring in Biology.  Verdict: No.
2. John is taking a course on Artificial Intelligence.
Explanation: The context mentions the courses John is currently enrolled in, and Artificial Intelligence is not mentioned. Therefore, it cannot be deduced that John is taking a course on AI. Verdict: No.
3. John is a dedicated student.
Explanation: The prompt states that he spends a significant amount of time studying and completing assignments. Additionally, it mentions that he often stays late in the library to work on his projects, which implies dedication. Verdict: Yes.
4. John has a part-time job.
Explanation: There is no information given in the context about John having a part-time job. Therefore, it cannot be deduced that John has a part-time job.  Verdict: No.
5. John is interested in computer programming.
Explanation: The context states that John is pursuing a degree in Computer Science, which implies an interest in computer programming. Verdict: Yes.
Final verdict for each statement in order: No. No. Yes. No. Yes.
context:\n{{context}}
statements:\n{{statements}}
Answer:
`;
