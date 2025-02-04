import $RefParser from '@apidevtools/json-schema-ref-parser';
import type { SingleBar } from 'cli-progress';
import { parse as parseCsv } from 'csv-parse/sync';
import dedent from 'dedent';
import * as fs from 'fs';
import { globSync } from 'glob';
import yaml from 'js-yaml';
import * as path from 'path';
import { parse as parsePath } from 'path';
import { testCaseFromCsvRow } from './csv';
import { getEnvBool, getEnvString } from './envars';
import { importModule } from './esm';
import { fetchCsvFromGoogleSheet } from './googleSheets';
import { fetchHuggingFaceDataset } from './integrations/huggingfaceDatasets';
import logger from './logger';
import { loadApiProvider } from './providers';
import { getDefaultProviders } from './providers/defaults';
import telemetry from './telemetry';
import type {
  CsvRow,
  TestCase,
  TestCaseWithVarsFile,
  TestSuite,
  TestSuiteConfig,
  VarMapping,
  ApiProvider,
  ProviderOptions,
} from './types';
import { retryWithDeduplication, sampleArray } from './util/generation';
import invariant from './util/invariant';
import { extractJsonObjects } from './util/json';
import { extractVariablesFromTemplates } from './util/templates';

function parseJson(json: string): any | undefined {
  try {
    return JSON.parse(json);
  } catch {
    return undefined;
  }
}

export async function readVarsFiles(
  pathOrGlobs: string | string[],
  basePath: string = '',
): Promise<Record<string, string | string[] | object>> {
  if (typeof pathOrGlobs === 'string') {
    pathOrGlobs = [pathOrGlobs];
  }

  const ret: Record<string, string | string[] | object> = {};
  for (const pathOrGlob of pathOrGlobs) {
    const resolvedPath = path.resolve(basePath, pathOrGlob);
    const paths = globSync(resolvedPath, {
      windowsPathsNoEscape: true,
    });

    for (const p of paths) {
      const yamlData = yaml.load(fs.readFileSync(p, 'utf-8'));
      Object.assign(ret, yamlData);
    }
  }
  return ret;
}

export async function readStandaloneTestsFile(
  varsPath: string,
  basePath: string = '',
): Promise<TestCase[]> {
  // This function is confusingly named - it reads a CSV, JSON, or YAML file of
  // TESTS or test equivalents.
  const resolvedVarsPath = path.resolve(basePath, varsPath.replace(/^file:\/\//, ''));
  const fileExtension = parsePath(resolvedVarsPath).ext.slice(1);
  let rows: CsvRow[] = [];

  if (varsPath.startsWith('https://docs.google.com/spreadsheets/')) {
    telemetry.recordAndSendOnce('feature_used', {
      feature: 'csv tests file - google sheet',
    });
    rows = await fetchCsvFromGoogleSheet(varsPath);
  } else if (fileExtension === 'csv') {
    telemetry.recordAndSendOnce('feature_used', {
      feature: 'csv tests file - local',
    });
    const delimiter = getEnvString('PROMPTFOO_CSV_DELIMITER', ',');
    rows = parseCsv(fs.readFileSync(resolvedVarsPath, 'utf-8'), {
      columns: true,
      bom: true,
      delimiter,
    });
  } else if (fileExtension === 'json') {
    telemetry.recordAndSendOnce('feature_used', {
      feature: 'json tests file',
    });
    rows = parseJson(fs.readFileSync(resolvedVarsPath, 'utf-8'));
  } else if (fileExtension === 'yaml' || fileExtension === 'yml') {
    telemetry.recordAndSendOnce('feature_used', {
      feature: 'yaml tests file',
    });
    rows = yaml.load(fs.readFileSync(resolvedVarsPath, 'utf-8')) as unknown as any;
  } else if (fileExtension === 'js' || fileExtension === 'ts' || fileExtension === 'mjs') {
    telemetry.recordAndSendOnce('feature_used', {
      feature: 'js tests file',
    });
    return await importModule(resolvedVarsPath);
  }

  return rows.map((row, idx) => {
    const test = testCaseFromCsvRow(row);
    test.description ||= `Row #${idx + 1}`;
    return test;
  });
}

async function loadTestWithVars(
  testCase: TestCaseWithVarsFile,
  testBasePath: string,
): Promise<TestCase> {
  const ret: TestCase = { ...testCase, vars: undefined };
  if (typeof testCase.vars === 'string' || Array.isArray(testCase.vars)) {
    ret.vars = await readVarsFiles(testCase.vars, testBasePath);
  } else {
    ret.vars = testCase.vars;
  }
  return ret;
}

export async function readTest(
  test: string | TestCaseWithVarsFile,
  basePath: string = '',
): Promise<TestCase> {
  let testCase: TestCase;

  if (typeof test === 'string') {
    const testFilePath = path.resolve(basePath, test);
    const testBasePath = path.dirname(testFilePath);
    const rawTestCase = yaml.load(fs.readFileSync(testFilePath, 'utf-8')) as TestCaseWithVarsFile;
    testCase = await loadTestWithVars(rawTestCase, testBasePath);
  } else {
    testCase = await loadTestWithVars(test, basePath);
  }

  if (testCase.provider && typeof testCase.provider !== 'function') {
    // Load provider
    if (typeof testCase.provider === 'string') {
      testCase.provider = await loadApiProvider(testCase.provider);
    } else if (typeof testCase.provider.id === 'string') {
      testCase.provider = await loadApiProvider(testCase.provider.id, {
        options: testCase.provider as ProviderOptions,
        basePath,
      });
    }
  }

  if (
    !testCase.assert &&
    !testCase.vars &&
    !testCase.options &&
    !testCase.metadata &&
    !testCase.provider &&
    !testCase.providerOutput &&
    typeof testCase.threshold !== 'number'
  ) {
    // Validate the shape of the test case
    // We skip validation when loading the default test case, since it may not have all the properties
    throw new Error(
      `Test case must contain one of the following properties: assert, vars, options, metadata, provider, providerOutput, threshold.\n\nInstead got:\n${JSON.stringify(
        testCase,
        null,
        2,
      )}`,
    );
  }

  return testCase;
}

export async function readTests(
  tests: TestSuiteConfig['tests'],
  basePath: string = '',
): Promise<TestCase[]> {
  const ret: TestCase[] = [];

  const loadTestsFromGlob = async (loadTestsGlob: string) => {
    if (loadTestsGlob.startsWith('huggingface://datasets/')) {
      telemetry.recordAndSendOnce('feature_used', {
        feature: 'huggingface dataset',
      });
      return await fetchHuggingFaceDataset(loadTestsGlob);
    }

    if (loadTestsGlob.startsWith('file://')) {
      loadTestsGlob = loadTestsGlob.slice('file://'.length);
    }
    const resolvedPath = path.resolve(basePath, loadTestsGlob);
    const testFiles = globSync(resolvedPath, {
      windowsPathsNoEscape: true,
    });

    if (loadTestsGlob.startsWith('https://docs.google.com/spreadsheets/')) {
      testFiles.push(loadTestsGlob);
    }

    const _deref = async (testCases: TestCase[], file: string) => {
      logger.debug(`Dereferencing test file: ${file}`);
      return (await $RefParser.dereference(testCases)) as TestCase[];
    };

    const ret: TestCase<Record<string, string | string[] | object>>[] = [];
    if (testFiles.length < 1) {
      logger.error(`No test files found for path: ${loadTestsGlob}`);
      return ret;
    }
    for (const testFile of testFiles) {
      let testCases: TestCase[] | undefined;
      if (
        testFile.endsWith('.csv') ||
        testFile.startsWith('https://docs.google.com/spreadsheets/')
      ) {
        testCases = await readStandaloneTestsFile(testFile, basePath);
      } else if (testFile.endsWith('.yaml') || testFile.endsWith('.yml')) {
        testCases = yaml.load(fs.readFileSync(testFile, 'utf-8')) as TestCase[];
        testCases = await _deref(testCases, testFile);
      } else if (testFile.endsWith('.jsonl')) {
        const fileContent = fs.readFileSync(testFile, 'utf-8');
        testCases = fileContent
          .split('\n')
          .filter((line) => line.trim())
          .map((line) => JSON.parse(line));
        testCases = await _deref(testCases, testFile);
      } else if (testFile.endsWith('.json')) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        testCases = await _deref(require(testFile), testFile);
      } else {
        throw new Error(`Unsupported file type for test file: ${testFile}`);
      }

      if (testCases) {
        if (!Array.isArray(testCases) && typeof testCases === 'object') {
          testCases = [testCases];
        }
        for (const testCase of testCases) {
          ret.push(await readTest(testCase, path.dirname(testFile)));
        }
      }
    }
    return ret;
  };

  if (typeof tests === 'string') {
    if (tests.endsWith('yaml') || tests.endsWith('yml')) {
      // Points to a tests file with multiple test cases
      return loadTestsFromGlob(tests);
    } else {
      // Points to a tests.{csv,json,yaml,yml,js} or Google Sheet
      return readStandaloneTestsFile(tests, basePath);
    }
  } else if (Array.isArray(tests)) {
    for (const globOrTest of tests) {
      if (typeof globOrTest === 'string') {
        // Resolve globs
        ret.push(...(await loadTestsFromGlob(globOrTest)));
      } else {
        // Load individual TestCase
        ret.push(await readTest(globOrTest, basePath));
      }
    }
  } else if (tests !== undefined && tests !== null) {
    logger.warn(dedent`
      Warning: Unsupported 'tests' format in promptfooconfig.yaml.
      Expected: string, string[], or TestCase[], but received: ${typeof tests}

      Please check your configuration file and ensure the 'tests' field is correctly formatted.
      For more information, visit: https://promptfoo.dev/docs/configuration/reference/#test-case
    `);
  }

  if (
    ret.some((testCase) => testCase.vars?.assert) &&
    !getEnvBool('PROMPTFOO_NO_TESTCASE_ASSERT_WARNING')
  ) {
    logger.warn(dedent`
      Warning: Found 'assert' key in vars. This is likely a mistake in your configuration.

      'assert' should be *unindented* so it is under the test itself, not vars. For example:

      tests:
        - vars:
            foo: bar
          assert:
            - type: contains
              value: "bar"

      To disable this message, set the environment variable PROMPTFOO_NO_TESTCASE_ASSERT_WARNING=1.
    `);
  }

  return ret;
}

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
