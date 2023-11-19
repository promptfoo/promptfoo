import * as path from 'path';
import * as fs from 'fs';

import yaml from 'js-yaml';
import { parse as parsePath } from 'path';
import { parse as parseCsv } from 'csv-parse/sync';
import { globSync } from 'glob';

import { fetchCsvFromGoogleSheet } from './fetch';

import type { Assertion, CsvRow, TestCase, TestSuiteConfig } from './types';

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
          if (value.endsWith('.yaml') || value.endsWith('.yml')) {
            vars[key] = (
              yaml.load(fs.readFileSync(value.slice('file://'.length), 'utf-8')) as string
            ).trim();
          } else {
            vars[key] = fs.readFileSync(value.slice('file://'.length), 'utf-8').trim();
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

export function testCaseFromCsvRow(row: CsvRow): TestCase {
  const vars: Record<string, string> = {};
  const asserts: Assertion[] = [];
  for (const [key, value] of Object.entries(row)) {
    if (key.startsWith('__expected')) {
      if (value.trim() !== '') {
        const { assertionFromString } = require('./assertions');
        asserts.push(assertionFromString(value));
      }
    } else {
      vars[key] = value;
    }
  }

  return {
    vars,
    assert: asserts,
  };
}
