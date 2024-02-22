import * as path from 'path';
import * as fs from 'fs';

import yaml from 'js-yaml';
import { parse as parsePath } from 'path';
import { parse as parseCsv } from 'csv-parse/sync';
import { globSync } from 'glob';

import logger from './logger';
import { fetchCsvFromGoogleSheet } from './fetch';
import { OpenAiChatCompletionProvider } from './providers/openai';
import { testCaseFromCsvRow } from './csv';

import type {
  Assertion,
  CsvRow,
  TestCase,
  TestSuite,
  TestSuiteConfig,
  UnifiedConfig,
  VarMapping,
} from './types';

function parseJson(json: string): any | undefined {
  try {
    return JSON.parse(json);
  } catch (err) {
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
    const paths = globSync(resolvedPath);

    for (const p of paths) {
      const yamlData = yaml.load(fs.readFileSync(p, 'utf-8'));
      Object.assign(ret, yamlData);
    }
  }

  return ret;
}

export async function readTestsFile(varsPath: string, basePath: string = ''): Promise<CsvRow[]> {
  // This function is confusingly named - it reads a CSV, JSON, or YAML file of
  // TESTS or test equivalents.
  const resolvedVarsPath = path.resolve(basePath, varsPath);
  const fileExtension = parsePath(varsPath).ext.slice(1);
  let rows: CsvRow[] = [];

  if (varsPath.startsWith('https://docs.google.com/spreadsheets/')) {
    const csvData = await fetchCsvFromGoogleSheet(varsPath);
    rows = parseCsv(csvData, { columns: true });
  } else if (fileExtension === 'csv') {
    rows = parseCsv(fs.readFileSync(resolvedVarsPath, 'utf-8'), { columns: true });
  } else if (fileExtension === 'json') {
    rows = parseJson(fs.readFileSync(resolvedVarsPath, 'utf-8'));
  } else if (fileExtension === 'yaml' || fileExtension === 'yml') {
    rows = yaml.load(fs.readFileSync(resolvedVarsPath, 'utf-8')) as unknown as any;
  }

  return rows;
}

type TestCaseWithVarsFile = TestCase<
  Record<string, string | string[] | object> | string | string[]
>;
export async function readTest(
  test: string | TestCaseWithVarsFile,
  basePath: string = '',
): Promise<TestCase> {
  const loadTestWithVars = async (
    testCase: TestCaseWithVarsFile,
    testBasePath: string,
  ): Promise<TestCase> => {
    const ret: TestCase = { ...testCase, vars: undefined };
    if (typeof testCase.vars === 'string' || Array.isArray(testCase.vars)) {
      ret.vars = await readVarsFiles(testCase.vars, testBasePath);
    } else if (typeof testCase.vars === 'object') {
      const vars: Record<string, string | string[] | object> = {};
      for (const [key, value] of Object.entries(testCase.vars)) {
        if (typeof value === 'string' && value.startsWith('file://')) {
          // Load file from disk.
          const filePath = path.resolve(testBasePath, value.slice('file://'.length));
          if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
            vars[key] = (yaml.load(fs.readFileSync(filePath, 'utf-8')) as string).trim();
          } else {
            vars[key] = fs.readFileSync(filePath, 'utf-8').trim();
          }
        } else {
          // This is a normal key:value.
          vars[key] = value;
        }
      }
      ret.vars = vars;
    }
    return ret;
  };

  let testCase: TestCase;

  if (typeof test === 'string') {
    const testFilePath = path.resolve(basePath, test);
    const testBasePath = path.dirname(testFilePath);
    const rawTestCase = yaml.load(fs.readFileSync(testFilePath, 'utf-8')) as TestCaseWithVarsFile;
    testCase = await loadTestWithVars(rawTestCase, testBasePath);
  } else {
    testCase = await loadTestWithVars(test, basePath);
  }

  // Validation of the shape of test
  if (!testCase.assert && !testCase.vars && !testCase.options) {
    throw new Error(
      `Test case must have either assert, vars, or options property. Instead got ${JSON.stringify(
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
    const resolvedPath = path.resolve(basePath, loadTestsGlob);
    const testFiles = globSync(resolvedPath);
    const ret = [];
    for (const testFile of testFiles) {
      const testFileContent = yaml.load(fs.readFileSync(testFile, 'utf-8')) as TestCase[];
      for (const testCase of testFileContent) {
        ret.push(await readTest(testCase, path.dirname(testFile)));
      }
    }
    return ret;
  };

  if (typeof tests === 'string') {
    if (tests.endsWith('yaml') || tests.endsWith('yml')) {
      // Points to a tests file with multiple test cases
      return loadTestsFromGlob(tests);
    } else {
      // Points to a legacy vars.csv
      const vars = await readTestsFile(tests, basePath);
      return vars.map((row, idx) => {
        const test = testCaseFromCsvRow(row);
        test.description = `Row #${idx + 1}`;
        return test;
      });
    }
  } else if (Array.isArray(tests)) {
    for (const globOrTest of tests) {
      if (typeof globOrTest === 'string') {
        // Resolve globs
        ret.push(...(await loadTestsFromGlob(globOrTest)));
      } else {
        // It's just a TestCase
        ret.push(await readTest(globOrTest, basePath));
      }
    }
  }

  return ret;
}

interface SynthesizeOptions {
  prompts: string[];
  instructions?: string;
  tests: TestCase[];
  numPersonas?: number;
  numTestCasesPerPersona?: number;
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

export async function synthesize({
  prompts,
  instructions,
  tests,
  numPersonas,
  numTestCasesPerPersona,
}: SynthesizeOptions) {
  if (prompts.length < 1) {
    throw new Error('Dataset synthesis requires at least one prompt.');
  }

  numPersonas = numPersonas || 5;
  numTestCasesPerPersona = numTestCasesPerPersona || 3;

  logger.info(
    `Starting dataset synthesis. We'll begin by generating up to ${numPersonas} personas. Each persona will be used to generate ${numTestCasesPerPersona} test cases.`,
  );

  // Consider the following prompt for an LLM application: {{prompt}}. List up to 5 user personas that would send this prompt.
  logger.info(`\nGenerating user personas from ${prompts.length} prompts...`);
  const provider = new OpenAiChatCompletionProvider('gpt-4-1106-preview', {
    config: {
      temperature: 1.0,
      response_format: {
        type: 'json_object',
      },
    },
  });
  const promptsString = `<Prompts>
${prompts.map((prompt) => `<Prompt>\n${prompt}\n</Prompt>`).join('\n')}
</Prompts>`;
  const resp = await provider.callApi(
    `Consider the following prompt${prompts.length > 1 ? 's' : ''} for an LLM application:
${promptsString}

List up to ${numPersonas} user personas that would send ${
      prompts.length > 1 ? 'these prompts' : 'this prompt'
    }. Your response should be JSON of the form {personas: string[]}`,
  );

  const personas = (JSON.parse(resp.output as string) as { personas: string[] }).personas;
  logger.info(
    `\nGenerated ${personas.length} personas:\n${personas.map((p) => `  - ${p}`).join('\n')}`,
  );

  // Extract variable names from the nunjucks template in the prompts
  const variableRegex = /{{\s*(\w+)\s*}}/g;
  const variables = new Set();
  for (const prompt of prompts) {
    let match;
    while ((match = variableRegex.exec(prompt)) !== null) {
      variables.add(match[1]);
    }
  }
  logger.info(
    `\nExtracted ${variables.size} variables from prompts:\n${Array.from(variables)
      .map((v) => `  - ${v}`)
      .join('\n')}`,
  );

  const existingTests =
    `Here are some existing tests:` +
    tests
      .map((test) => {
        if (!test.vars) {
          return;
        }
        return `<Test>
${JSON.stringify(test.vars, null, 2)}
</Test>
    `;
      })
      .filter(Boolean)
      .slice(0, 100)
      .join('\n');

  // For each user persona, we will generate a map of variable names to values
  const testCaseVars: VarMapping[] = [];
  for (let i = 0; i < personas.length; i++) {
    const persona = personas[i];
    logger.info(`\nGenerating test cases for persona ${i + 1}...`);
    // Construct the prompt for the LLM to generate variable values
    const personaPrompt = `Consider ${
      prompts.length > 1 ? 'these prompts' : 'this prompt'
    }, which contains some {{variables}}: 
${promptsString}

This is your persona:
<Persona>
${persona}
</Persona>

${existingTests}

Fully embody this persona and determine a value for each variable, such that the prompt would be sent by this persona.

You are a tester, so try to think of ${numTestCasesPerPersona} sets of values that would be interesting or unusual to test. ${
      instructions || ''
    }

Your response should contain a JSON map of variable names to values, of the form {vars: {${Array.from(
      variables,
    )
      .map((varName) => `${varName}: string`)
      .join(', ')}}[]}`;
    // Call the LLM API with the constructed prompt
    const personaResponse = await provider.callApi(personaPrompt);
    const parsed = JSON.parse(personaResponse.output as string) as {
      vars: VarMapping[];
    };
    for (const vars of parsed.vars) {
      logger.info(`${JSON.stringify(vars, null, 2)}`);
      testCaseVars.push(vars);
    }
  }

  // Dedup testCaseVars
  const uniqueTestCaseStrings = new Set(testCaseVars.map((testCase) => JSON.stringify(testCase)));
  const dedupedTestCaseVars: VarMapping[] = Array.from(uniqueTestCaseStrings).map((testCase) =>
    JSON.parse(testCase),
  );
  return dedupedTestCaseVars;
}
