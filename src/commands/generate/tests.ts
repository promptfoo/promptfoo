import * as fs from 'fs';

import chalk from 'chalk';
import { InvalidArgumentError } from 'commander';
import yaml from 'js-yaml';
import { disableCache } from '../../cache';
import { getEnvString } from '../../envars';
import { generateTestSuite } from '../../generation/index';
import logger from '../../logger';
import telemetry from '../../telemetry';
import { resolveConfigs } from '../../util/config/load';
import { printBorder, setupEnv } from '../../util/index';
import { promptfooCommand } from '../../util/promptfooCommand';
import {
  validateExclusiveGenerationModes,
  validatePositiveIntegerOption,
  validateProbabilityOption,
} from './options';
import type { Command } from 'commander';

import type {
  AssertionGenerationOptions,
  AssertionGenerationResult,
  DatasetGenerationOptions,
  DatasetGenerationResult,
  TestSuiteGenerationResult,
} from '../../generation/types';
import type { Assertion, TestCase, TestSuite, UnifiedConfig } from '../../types/index';

interface TestsGenerateOptions {
  // Common options
  cache: boolean;
  config?: string;
  envFile?: string;
  instructions?: string;
  output?: string;
  provider?: string;
  write: boolean;
  defaultConfig: Partial<UnifiedConfig>;
  defaultConfigPath: string | undefined;

  // Dataset options
  numPersonas: string;
  numTestCasesPerPersona: string;
  edgeCases?: boolean;
  diversity?: boolean;
  diversityTarget?: string;
  iterative?: boolean;

  // Assertion options
  numAssertions?: string;
  type?: 'pi' | 'g-eval' | 'llm-rubric';
  coverage?: boolean;
  validate?: boolean;
  negativeTests?: boolean;

  // Combined control options
  datasetOnly?: boolean;
  assertionsOnly?: boolean;
  parallel?: boolean;
}

type ConfigAddition = {
  tests?: Array<{ vars: Record<string, string>; metadata?: Record<string, unknown> }>;
  defaultTest?: { assert: Assertion[] };
};

type TestArrayItem = TestCase | string | { vars: Record<string, string> };

interface GeneratedSuiteOutput {
  configAddition: ConfigAddition;
  testCasesCount: number;
  assertionsCount: number;
}

function getConfigPath(options: TestsGenerateOptions): string {
  const configPath = options.config || options.defaultConfigPath;
  if (!configPath) {
    throw new Error('Could not find config file. Please use `--config`');
  }
  return configPath;
}

function getEffectiveAssertionType(options: TestsGenerateOptions): 'pi' | 'g-eval' | 'llm-rubric' {
  return options.type || (getEnvString('WITHPI_API_KEY') ? 'pi' : 'llm-rubric');
}

function buildDatasetOptions(
  options: TestsGenerateOptions,
): Partial<DatasetGenerationOptions> | undefined {
  if (!(options.datasetOnly || !options.assertionsOnly)) {
    return undefined;
  }

  const datasetOptions: Partial<DatasetGenerationOptions> = {
    instructions: options.instructions,
    numPersonas: Number.parseInt(options.numPersonas, 10),
    numTestCasesPerPersona: Number.parseInt(options.numTestCasesPerPersona, 10),
    provider: options.provider,
  };
  if (options.edgeCases) {
    datasetOptions.edgeCases = {
      enabled: true,
      types: ['boundary', 'format', 'empty', 'special-chars'],
      count: 10,
      includeAdversarial: false,
    };
  }
  if (options.diversity) {
    datasetOptions.diversity = {
      enabled: true,
      targetScore: options.diversityTarget ? Number.parseFloat(options.diversityTarget) : 0.7,
      measureMethod: 'text',
    };
  }
  if (options.iterative) {
    datasetOptions.iterative = { enabled: true, maxRounds: 2, targetDiversity: 0.7 };
  }
  return datasetOptions;
}

function buildAssertionOptions(
  options: TestsGenerateOptions,
): Partial<AssertionGenerationOptions> | undefined {
  if (!(options.assertionsOnly || !options.datasetOnly)) {
    return undefined;
  }

  const assertionOptions: Partial<AssertionGenerationOptions> = {
    instructions: options.instructions,
    numQuestions: Number.parseInt(options.numAssertions || '5', 10),
    provider: options.provider,
    type: getEffectiveAssertionType(options),
  };
  if (options.coverage) {
    assertionOptions.coverage = {
      enabled: true,
      extractRequirements: true,
      minCoverageScore: 0.8,
    };
  }
  if (options.validate) {
    assertionOptions.validation = {
      enabled: true,
      autoGenerateSamples: true,
      sampleCount: 5,
      sampleOutputs: [],
    };
  }
  if (options.negativeTests) {
    assertionOptions.negativeTests = {
      enabled: true,
      types: [
        'should-not-contain',
        'should-not-hallucinate',
        'should-not-expose',
        'should-not-repeat',
        'should-not-exceed-length',
      ],
      count: 5,
    };
  }
  return assertionOptions;
}

function addDatasetOutput(
  configAddition: ConfigAddition,
  dataset: DatasetGenerationResult,
): number {
  const mainTests = dataset.testCases.map((vars) => ({ vars }));
  const edgeTests =
    dataset.edgeCases?.map((edgeCase) => ({
      vars: edgeCase.vars,
      metadata: {
        edgeCase: true,
        type: edgeCase.type,
        description: edgeCase.description,
      },
    })) || [];
  configAddition.tests = [...mainTests, ...edgeTests];
  const count = configAddition.tests.length;
  logger.info(`Generated ${count} test cases`);
  if (edgeTests.length > 0) {
    logger.info(`  - Including ${edgeTests.length} edge cases`);
  }
  if (dataset.diversity) {
    logger.info(`  - Diversity score: ${(dataset.diversity.score * 100).toFixed(1)}%`);
  }
  return count;
}

function addAssertionOutput(
  configAddition: ConfigAddition,
  assertions: AssertionGenerationResult,
): number {
  const allAssertions = assertions.negativeTests
    ? [...assertions.assertions, ...assertions.negativeTests]
    : assertions.assertions;
  configAddition.defaultTest = { assert: allAssertions };
  logger.info(`Generated ${allAssertions.length} assertions`);
  if (assertions.coverage) {
    logger.info(`  - Coverage score: ${(assertions.coverage.overallScore * 100).toFixed(1)}%`);
    if (assertions.coverage.gaps.length > 0) {
      logger.info(
        `  - Uncovered requirements: ${assertions.coverage.gaps.slice(0, 3).join(', ')}${assertions.coverage.gaps.length > 3 ? '...' : ''}`,
      );
    }
  }
  if (assertions.negativeTests && assertions.negativeTests.length > 0) {
    logger.info(`  - Including ${assertions.negativeTests.length} negative tests`);
  }
  return allAssertions.length;
}

function prepareOutput(result: TestSuiteGenerationResult): GeneratedSuiteOutput {
  const configAddition: ConfigAddition = {};
  return {
    configAddition,
    testCasesCount: result.dataset ? addDatasetOutput(configAddition, result.dataset) : 0,
    assertionsCount: result.assertions ? addAssertionOutput(configAddition, result.assertions) : 0,
  };
}

function writeOutput(output: string | undefined, generated: GeneratedSuiteOutput): void {
  const yamlString = yaml.dump(generated.configAddition);
  if (output) {
    if (!output.endsWith('.yaml') && !output.endsWith('.yml')) {
      throw new Error(`Unsupported output file type: ${output}. Use .yaml or .yml`);
    }
    fs.writeFileSync(output, yamlString);
    printBorder();
    logger.info(`Wrote test suite to ${output}`);
    logger.info(`  - ${generated.testCasesCount} test cases`);
    logger.info(`  - ${generated.assertionsCount} assertions`);
    printBorder();
    return;
  }
  printBorder();
  logger.info('Generated Test Suite');
  printBorder();
  logger.info(yamlString);
}

function asTestArray(tests: UnifiedConfig['tests']): TestArrayItem[] {
  if (Array.isArray(tests)) {
    return tests as TestArrayItem[];
  }
  if (typeof tests === 'string') {
    return [tests];
  }
  return tests && typeof tests === 'object' ? [tests as TestCase] : [];
}

function appendToConfig(configPath: string, generated: GeneratedSuiteOutput): void {
  const existingConfig = yaml.load(fs.readFileSync(configPath, 'utf8')) as Partial<UnifiedConfig>;
  if (generated.configAddition.tests) {
    existingConfig.tests = [
      ...asTestArray(existingConfig.tests),
      ...generated.configAddition.tests,
    ];
  }
  if (generated.configAddition.defaultTest?.assert) {
    const existingDefaultTest =
      typeof existingConfig.defaultTest === 'object' && existingConfig.defaultTest !== null
        ? existingConfig.defaultTest
        : {};
    const existingAssert = Array.isArray((existingDefaultTest as { assert?: Assertion[] }).assert)
      ? (existingDefaultTest as { assert: Assertion[] }).assert
      : [];
    existingConfig.defaultTest = {
      ...existingDefaultTest,
      assert: [...existingAssert, ...generated.configAddition.defaultTest.assert],
    };
  }
  fs.writeFileSync(configPath, yaml.dump(existingConfig));
  logger.info(`Wrote test suite to ${configPath}`);
  logger.info(`  - ${generated.testCasesCount} test cases`);
  logger.info(`  - ${generated.assertionsCount} assertions`);
  const runCommand = promptfooCommand('eval');
  logger.info(chalk.green(`Run ${chalk.bold(runCommand)} to run the generated tests`));
}

function finishOutput(
  options: TestsGenerateOptions,
  configPath: string,
  generated: GeneratedSuiteOutput,
): void {
  writeOutput(options.output, generated);
  printBorder();
  if (!options.write) {
    logger.info(
      `Copy the above or run ${chalk.greenBright(
        'promptfoo generate tests --write',
      )} to write directly to the config`,
    );
    return;
  }
  appendToConfig(configPath, generated);
}

export async function doGenerateTests(options: TestsGenerateOptions): Promise<void> {
  validatePositiveIntegerOption(options.numPersonas, '--numPersonas');
  validatePositiveIntegerOption(options.numTestCasesPerPersona, '--numTestCasesPerPersona');
  validatePositiveIntegerOption(options.numAssertions, '--numAssertions');
  validateProbabilityOption(options.diversityTarget, '--diversity-target');
  validateExclusiveGenerationModes(options.datasetOnly, options.assertionsOnly);

  setupEnv(options.envFile);
  if (!options.cache) {
    logger.info('Cache is disabled.');
    disableCache();
  }

  const configPath = getConfigPath(options);
  const testSuite: TestSuite = (
    await resolveConfigs({ config: [configPath] }, options.defaultConfig, 'DatasetGeneration')
  ).testSuite;
  const startTime = Date.now();
  telemetry.record('command_used', {
    name: 'generate_tests - started',
    numPrompts: testSuite.prompts.length,
    numTestsExisting: (testSuite.tests || []).length,
  });

  const result = await generateTestSuite(testSuite.prompts, testSuite.tests || [], {
    dataset: buildDatasetOptions(options),
    assertions: buildAssertionOptions(options),
    parallel: options.parallel ?? false,
    skipDataset: options.assertionsOnly ?? false,
    skipAssertions: options.datasetOnly ?? false,
  });
  const generated = prepareOutput(result);
  finishOutput(options, configPath, generated);

  telemetry.record('command_used', {
    duration: Math.round((Date.now() - startTime) / 1000),
    name: 'generate_tests',
    numPrompts: testSuite.prompts.length,
    numTestsExisting: (testSuite.tests || []).length,
    numTestsGenerated: generated.testCasesCount,
    numAssertionsGenerated: generated.assertionsCount,
    provider: options.provider || 'default',
    parallel: options.parallel || false,
    datasetOnly: options.datasetOnly || false,
    assertionsOnly: options.assertionsOnly || false,
  });
}

function validateAssertionType(value: string, _previous: string) {
  const allowedStrings = ['pi', 'g-eval', 'llm-rubric'];
  if (!allowedStrings.includes(value)) {
    throw new InvalidArgumentError(`Option --type must be one of: ${allowedStrings.join(', ')}.`);
  }
  return value;
}

export function generateTestsCommand(
  program: Command,
  defaultConfig: Partial<UnifiedConfig>,
  defaultConfigPath: string | undefined,
) {
  program
    .command('tests')
    .description('Generate complete test suite (datasets + assertions)')
    .option('-c, --config [path]', 'Path to configuration file. Defaults to promptfooconfig.yaml')
    .option('-o, --output [path]', 'Path to output file (YAML)')
    .option('-w, --write', 'Write results to promptfoo configuration file')
    .option(
      '--provider <provider>',
      'Provider for generation. Defaults to the default grading provider.',
    )
    .option('-i, --instructions [instructions]', 'Additional instructions for generation')
    .option('--no-cache', 'Do not read or write results to disk cache', false)
    .option('--env-file, --env-path <path>', 'Path to .env file')

    // Dataset options
    .option('--numPersonas <number>', 'Number of personas to generate', '5')
    .option('--numTestCasesPerPersona <number>', 'Number of test cases per persona', '3')
    .option('--edge-cases', 'Include edge case generation')
    .option('--diversity', 'Enable diversity optimization')
    .option('--diversity-target <number>', 'Target diversity score (0-1)', '0.7')
    .option('--iterative', 'Use iterative generation to fill coverage gaps')

    // Assertion options
    .option('--numAssertions <amount>', 'Number of assertions to generate', '5')
    .option(
      '-t, --type [type]',
      'Assertion type (pi, g-eval, llm-rubric; defaults based on WITHPI_API_KEY)',
      validateAssertionType,
    )
    .option('--coverage', 'Enable coverage analysis')
    .option('--validate', 'Validate assertions against sample outputs')
    .option('--negative-tests', 'Generate negative test assertions')

    // Combined-specific options
    .option('--dataset-only', 'Generate only datasets (skip assertions)')
    .option('--assertions-only', 'Generate only assertions (skip datasets)')
    .option('--parallel', 'Run dataset and assertion generation in parallel')

    .action(async (opts) => {
      try {
        await doGenerateTests({ ...opts, defaultConfig, defaultConfigPath });
      } catch (error) {
        logger.error(`Failed to generate tests: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    });
}
