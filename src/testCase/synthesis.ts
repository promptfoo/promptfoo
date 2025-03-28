import type { SingleBar } from 'cli-progress';
import dedent from 'dedent';
import logger from '../logger';
import { loadApiProvider } from '../providers';
import { getDefaultProviders } from '../providers/defaults';
import type { TestCase, TestSuite, VarMapping, ApiProvider } from '../types';
import { retryWithDeduplication, sampleArray } from '../util/generation';
import invariant from '../util/invariant';
import { extractJsonObjects } from '../util/json';
import { extractVariablesFromTemplates } from '../util/templates';

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
          return;
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
    progressBar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
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
    providerModel = await loadApiProvider(provider);
  }

  const personasPrompt = generatePersonasPrompt(prompts, numPersonas);
  logger.debug(`Generated personas prompt:\n${personasPrompt}`);
  const resp = await providerModel.callApi(personasPrompt);
  logger.debug(`Received personas response:\n${resp.output}`);
  invariant(typeof resp.output !== 'undefined', 'resp.output must be defined');
  const output = typeof resp.output === 'string' ? resp.output : JSON.stringify(resp.output);
  const respObjects = extractJsonObjects(output);
  invariant(
    respObjects.length >= 1,
    `Expected at least one JSON object in the response for personas, got ${respObjects.length}`,
  );
  const personas = (respObjects[0] as { personas: string[] }).personas;
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

    const personaResponseObjects = extractJsonObjects(personaResponse.output as string);

    invariant(
      personaResponseObjects.length >= 1,
      `Expected at least one JSON object in the response for persona ${persona}, got ${personaResponseObjects.length}`,
    );
    const parsed = personaResponseObjects[0] as { vars: VarMapping[] };
    logger.debug(`Received ${parsed.vars?.length} test cases`);
    if (progressBar) {
      progressBar.increment(parsed.vars?.length);
    }
    return parsed.vars || [];
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
