import dedent from 'dedent';
import cliState from '../cliState';
import logger from '../logger';
import { getDefaultProviders } from '../providers/defaults';
import { loadApiProvider } from '../providers/index';
import { retryWithDeduplication, sampleArray } from '../util/generation';
import invariant from '../util/invariant';
import { extractJsonObjects } from '../util/json';
import { extractVariablesFromTemplates } from '../util/templates';
import type { SingleBar } from 'cli-progress';

import type { ApiProvider, TestCase, TestSuite, VarMapping } from '../types/index';

interface SynthesizeOptions {
  instructions?: string;
  numPersonas?: number;
  numTestCasesPerPersona?: number;
  prompts: string[];
  provider?: string;
  tests: TestCase[];
}

export function generatePersonasPrompt(prompts: string[], numPersonas: number): string {
  const promptsString = dedent`<Prompts>
    ${prompts.map((prompt) => `<Prompt>\n${prompt}\n</Prompt>`).join('\n')}
    </Prompts>`;

  return dedent`
    Consider the following prompt${prompts.length > 1 ? 's' : ''} for an LLM application:

    ${promptsString}

    List up to ${numPersonas} user personas that would send ${prompts.length > 1 ? 'these prompts' : 'this prompt'}. Your response should be JSON of the form {personas: string[]}`;
}

export function testCasesPrompt(
  prompts: string[],
  persona: string,
  tests: TestCase[],
  numTestCasesPerPersona: number,
  variables: string[],
  instructions?: string,
): string {
  const promptsString = dedent`
    <Prompts>
    ${prompts
      .map(
        (prompt) => dedent`
      <Prompt>
      ${prompt}
      </Prompt>`,
      )
      .join('\n')}
    </Prompts>`;
  const existingTests = dedent`
    Here are some existing tests:
    ${sampleArray(tests, 100)
      .map((test) => {
        if (!test.vars) {
          return null;
        }
        return dedent`
          <Test>
          ${JSON.stringify(test.vars, null, 2)}
          </Test>`;
      })
      .filter(Boolean)
      .sort()
      .join('\n')}
  `;

  return dedent`
    Consider ${prompts.length > 1 ? 'these prompts' : 'this prompt'}, which contains some {{variables}}:
  ${promptsString}

  This is your persona:
  <Persona>
  ${persona}
  </Persona>

  ${existingTests}

  Fully embody this persona and determine a value for each variable, such that the prompt would be sent by this persona.

  You are a tester, so try to think of ${numTestCasesPerPersona} sets of values that would be interesting or unusual to test.${instructions ? ` ${instructions}` : ''}

  Your response should contain a JSON map of variable names to values, of the form {vars: {${Array.from(
    variables,
  )
    .map((varName) => `${varName}: string`)
    .join(', ')}}[]}`;
}

export function extractPersonas(output: string): string[] {
  // 1. Try direct JSON parse in case the response is a JSON array or object
  try {
    const parsed = JSON.parse(output);
    if (Array.isArray(parsed)) {
      const extracted = parsed
        .map((item) => {
          if (typeof item === 'string') {
            return item.trim();
          }
          if (typeof item === 'object' && item !== null) {
            const personaVal =
              (item as Record<string, unknown>).persona ||
              (item as Record<string, unknown>).name ||
              (item as Record<string, unknown>).description;
            if (typeof personaVal === 'string') {
              return personaVal.trim();
            }
          }
          return null;
        })
        .filter((item): item is string => Boolean(item));
      if (extracted.length > 0) {
        return extracted;
      }
    } else if (typeof parsed === 'object' && parsed !== null) {
      const obj = parsed as Record<string, unknown>;
      const rawPersonas =
        obj.personas ||
        obj.user_personas ||
        obj.persona_list ||
        obj.personas_list ||
        obj.results;
      if (Array.isArray(rawPersonas)) {
        const extracted = rawPersonas
          .map((item) => {
            if (typeof item === 'string') {
              return item.trim();
            }
            if (typeof item === 'object' && item !== null) {
              const personaVal =
                (item as Record<string, unknown>).persona ||
                (item as Record<string, unknown>).name ||
                (item as Record<string, unknown>).description;
              if (typeof personaVal === 'string') {
                return personaVal.trim();
              }
            }
            return null;
          })
          .filter((item): item is string => Boolean(item));
        if (extracted.length > 0) {
          return extracted;
        }
      }
    }
  } catch {
    // Fall back to extractJsonObjects
  }

  // 2. Try extracting JSON objects from markdown/text
  const respObjects = extractJsonObjects(output);
  for (const respObj of respObjects) {
    if (typeof respObj === 'object' && respObj !== null) {
      const obj = respObj as Record<string, unknown>;
      const rawPersonas =
        obj.personas ||
        obj.user_personas ||
        obj.persona_list ||
        obj.personas_list ||
        obj.results;
      if (Array.isArray(rawPersonas)) {
        const extracted = rawPersonas
          .map((item) => {
            if (typeof item === 'string') {
              return item.trim();
            }
            if (typeof item === 'object' && item !== null) {
              const personaVal =
                (item as Record<string, unknown>).persona ||
                (item as Record<string, unknown>).name ||
                (item as Record<string, unknown>).description;
              if (typeof personaVal === 'string') {
                return personaVal.trim();
              }
            }
            return null;
          })
          .filter((item): item is string => Boolean(item));
        if (extracted.length > 0) {
          return extracted;
        }
      }
    }
  }

  // 3. If respObjects is a list of individual objects extracted from a top-level array, e.g. [{persona: "A"}, {persona: "B"}]
  const extractedFromObjects = respObjects
    .map((item) => {
      if (typeof item === 'object' && item !== null) {
        const personaVal =
          (item as Record<string, unknown>).persona ||
          (item as Record<string, unknown>).name ||
          (item as Record<string, unknown>).description;
        if (typeof personaVal === 'string') {
          return personaVal.trim();
        }
      }
      return null;
    })
    .filter((item): item is string => Boolean(item));

  return extractedFromObjects;
}

export async function synthesize({
  prompts,
  instructions,
  tests,
  numPersonas,
  numTestCasesPerPersona,
  provider,
}: SynthesizeOptions) {
  if (prompts.length < 1) {
    throw new Error('Dataset synthesis requires at least one prompt.');
  }

  numPersonas = numPersonas || 5;
  numTestCasesPerPersona = numTestCasesPerPersona || 3;

  let progressBar: SingleBar | undefined;
  if (logger.level !== 'debug') {
    const cliProgress = await import('cli-progress');
    progressBar = new cliProgress.SingleBar(
      { gracefulExit: true },
      cliProgress.Presets.shades_classic,
    );
    const totalProgressSteps = 1 + numPersonas * numTestCasesPerPersona;
    progressBar.start(totalProgressSteps, 0);
  }

  logger.debug(
    `Starting dataset synthesis. We'll begin by generating up to ${numPersonas} personas. Each persona will be used to generate ${numTestCasesPerPersona} test cases.`,
  );

  logger.debug(
    `Generating user personas from ${prompts.length} prompt${prompts.length > 1 ? 's' : ''}...`,
  );

  let providerModel: ApiProvider;
  if (typeof provider === 'undefined') {
    providerModel = (await getDefaultProviders()).synthesizeProvider;
  } else {
    providerModel = await loadApiProvider(provider, { basePath: cliState.basePath });
  }

  const personasPrompt = generatePersonasPrompt(prompts, numPersonas);
  logger.debug(`Generated personas prompt:\n${personasPrompt}`);
  const resp = await providerModel.callApi(personasPrompt);
  logger.debug(`Received personas response:\n${resp.output}`);
  invariant(typeof resp.output !== 'undefined', 'resp.output must be defined');
  const output = typeof resp.output === 'string' ? resp.output : JSON.stringify(resp.output);
  const personas = extractPersonas(output);
  invariant(
    Array.isArray(personas) && personas.length > 0,
    `Expected at least one user persona in the response for personas, got: ${output}`,
  );
  logger.debug(
    `Generated ${personas.length} persona${personas.length === 1 ? '' : 's'}:\n${personas.map((p) => `  - ${p}`).join('\n')}`,
  );

  if (progressBar) {
    progressBar.increment();
  }

  // Extract variable names from the nunjucks template in the prompts
  const variables = extractVariablesFromTemplates(prompts);

  logger.debug(
    `Extracted ${variables.length} variable${variables.length === 1 ? '' : 's'} from prompt${prompts.length === 1 ? '' : 's'}:\n${variables
      .map((v) => `  - ${v}`)
      .join('\n')}`,
  );

  const batchSize = 20;
  const totalTestCases = numPersonas * numTestCasesPerPersona;

  const generateTestCasesForPersona = async (
    currentTestCases: VarMapping[],
  ): Promise<VarMapping[]> => {
    const remainingCount = totalTestCases - currentTestCases.length;
    const currentBatchSize = Math.min(remainingCount, batchSize);

    const persona = personas[currentTestCases.length % personas.length];
    logger.debug(
      `Generating ${currentBatchSize} test cases for persona ${
        (currentTestCases.length % personas.length) + 1
      } of ${personas.length}...`,
    );

    const personaPrompt = testCasesPrompt(
      prompts,
      persona,
      tests,
      currentBatchSize,
      variables,
      instructions,
    );
    logger.debug(`Generated persona prompt:\n${personaPrompt}`);

    const personaResponse = await providerModel.callApi(personaPrompt);
    logger.debug(`Received persona response:\n${personaResponse.output}`);

    const personaOutput =
      typeof personaResponse.output === 'string'
        ? personaResponse.output
        : JSON.stringify(personaResponse.output);
    const personaResponseObjects = extractJsonObjects(personaOutput);

    let vars: VarMapping[] = [];
    if (personaResponseObjects.length >= 1) {
      const parsed = personaResponseObjects[0] as { vars?: VarMapping[] };
      if (Array.isArray(parsed?.vars)) {
        vars = parsed.vars;
      } else {
        vars = personaResponseObjects.filter(
          (obj): obj is VarMapping => typeof obj === 'object' && obj !== null && !('vars' in obj),
        );
      }
    }
    logger.debug(`Received ${vars.length} test cases`);
    if (progressBar) {
      progressBar.increment(vars.length);
    }
    return vars;
  };

  let testCaseVars = await retryWithDeduplication(generateTestCasesForPersona, totalTestCases);

  logger.debug(`Generated ${testCaseVars.length} test cases`);

  if (testCaseVars.length > totalTestCases) {
    logger.debug(
      `Generated ${testCaseVars.length} test cases, but only ${totalTestCases} were requested. Sampling down to ${totalTestCases}...`,
    );
    testCaseVars = sampleArray(testCaseVars, totalTestCases);
  }

  if (progressBar) {
    progressBar.stop();
  }
  return testCaseVars;
}

export async function synthesizeFromTestSuite(
  testSuite: TestSuite,
  options: Partial<SynthesizeOptions>,
) {
  return synthesize({
    ...options,
    prompts: testSuite.prompts.map((prompt) => prompt.raw),
    tests: testSuite.tests || [],
  });
}
