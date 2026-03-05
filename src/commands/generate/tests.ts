import * as fs from 'fs';

import chalk from 'chalk';
import { InvalidArgumentError } from 'commander';
import yaml from 'js-yaml';
import { disableCache } from '../../cache';
import { generateTestSuite } from '../../generation/index';
import logger from '../../logger';
import telemetry from '../../telemetry';
import { resolveConfigs } from '../../util/config/load';
import { printBorder, setupEnv } from '../../util/index';
import { promptfooCommand } from '../../util/promptfooCommand';
import type { Command } from 'commander';

import type { AssertionGenerationOptions, DatasetGenerationOptions } from '../../generation/types';
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
  type: 'pi' | 'g-eval' | 'llm-rubric';
  coverage?: boolean;
  validate?: boolean;
  negativeTests?: boolean;

  // Combined control options
  datasetOnly?: boolean;
  assertionsOnly?: boolean;
  parallel?: boolean;
}

export async function doGenerateTests(options: TestsGenerateOptions): Promise<void> {
  setupEnv(options.envFile);
  if (!options.cache) {
    logger.info('Cache is disabled.');
    disableCache();
  }

  let testSuite: TestSuite;
  const configPath = options.config || options.defaultConfigPath;
  if (configPath) {
    const resolved = await resolveConfigs(
      {
        config: [configPath],
      },
      options.defaultConfig,
      'DatasetGeneration',
    );
    testSuite = resolved.testSuite;
  } else {
    throw new Error('Could not find config file. Please use `--config`');
  }

  const startTime = Date.now();
  telemetry.record('command_used', {
    name: 'generate_tests - started',
    numPrompts: testSuite.prompts.length,
    numTestsExisting: (testSuite.tests || []).length,
  });

  // Build dataset options
  let datasetOptions: Partial<DatasetGenerationOptions> | undefined;
  if (options.datasetOnly || !options.assertionsOnly) {
    datasetOptions = {
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
  }

  // Build assertion options
  let assertionOptions: Partial<AssertionGenerationOptions> | undefined;
  if (options.assertionsOnly || !options.datasetOnly) {
    assertionOptions = {
      instructions: options.instructions,
      numQuestions: Number.parseInt(options.numAssertions || '5', 10),
      provider: options.provider,
      type: options.type,
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
  }

  const result = await generateTestSuite(testSuite.prompts, testSuite.tests || [], {
    dataset: datasetOptions,
    assertions: assertionOptions,
    parallel: options.parallel ?? false,
    skipDataset: options.assertionsOnly ?? false,
    skipAssertions: options.datasetOnly ?? false,
  });

  // Prepare output - use explicit type to avoid union issues with defaultTest
  const configAddition: {
    tests?: Array<{ vars: Record<string, string>; metadata?: Record<string, unknown> }>;
    defaultTest?: { assert: Assertion[] };
  } = {};
  let testCasesCount = 0;
  let assertionsCount = 0;

  if (result.dataset) {
    // Merge main test cases and edge cases into output
    const mainTests = result.dataset.testCases.map((tc) => ({ vars: tc }));
    const edgeTests =
      result.dataset.edgeCases?.map((ec) => ({
        vars: ec.vars,
        metadata: { edgeCase: true, type: ec.type, description: ec.description },
      })) || [];

    configAddition.tests = [...mainTests, ...edgeTests];
    testCasesCount = mainTests.length + edgeTests.length;
    logger.info(`Generated ${testCasesCount} test cases`);

    if (edgeTests.length > 0) {
      logger.info(`  - Including ${edgeTests.length} edge cases`);
    }
    if (result.dataset.diversity) {
      logger.info(`  - Diversity score: ${(result.dataset.diversity.score * 100).toFixed(1)}%`);
    }
  }

  if (result.assertions) {
    // Add negative tests to assertions if present
    const allAssertions = result.assertions.negativeTests
      ? [...result.assertions.assertions, ...result.assertions.negativeTests]
      : result.assertions.assertions;

    configAddition.defaultTest = {
      assert: allAssertions,
    };
    assertionsCount = allAssertions.length;
    logger.info(`Generated ${assertionsCount} assertions`);

    if (result.assertions.coverage) {
      logger.info(
        `  - Coverage score: ${(result.assertions.coverage.overallScore * 100).toFixed(1)}%`,
      );
      if (result.assertions.coverage.gaps.length > 0) {
        logger.info(
          `  - Uncovered requirements: ${result.assertions.coverage.gaps.slice(0, 3).join(', ')}${result.assertions.coverage.gaps.length > 3 ? '...' : ''}`,
        );
      }
    }
    if (result.assertions.negativeTests && result.assertions.negativeTests.length > 0) {
      logger.info(`  - Including ${result.assertions.negativeTests.length} negative tests`);
    }
  }

  const yamlString = yaml.dump(configAddition);

  if (options.output) {
    if (options.output.endsWith('.yaml') || options.output.endsWith('.yml')) {
      fs.writeFileSync(options.output, yamlString);
    } else {
      throw new Error(`Unsupported output file type: ${options.output}. Use .yaml or .yml`);
    }
    printBorder();
    logger.info(`Wrote test suite to ${options.output}`);
    logger.info(`  - ${testCasesCount} test cases`);
    logger.info(`  - ${assertionsCount} assertions`);
    printBorder();
  } else {
    printBorder();
    logger.info('Generated Test Suite');
    printBorder();
    logger.info(yamlString);
  }

  printBorder();
  if (options.write && configPath) {
    const existingConfig = yaml.load(fs.readFileSync(configPath, 'utf8')) as Partial<UnifiedConfig>;

    // Add test cases
    if (configAddition.tests && Array.isArray(configAddition.tests)) {
      const existingTests = existingConfig.tests;
      type TestArrayItem = TestCase | string | { vars: Record<string, string> };
      let testsArray: TestArrayItem[] = [];
      if (Array.isArray(existingTests)) {
        testsArray = existingTests as TestArrayItem[];
      } else if (typeof existingTests === 'string') {
        // If it's a path string, keep it as a single element
        testsArray = [existingTests];
      } else if (existingTests && typeof existingTests === 'object') {
        testsArray = [existingTests as TestCase];
      }
      existingConfig.tests = [...testsArray, ...configAddition.tests];
    }

    // Add assertions
    if (configAddition.defaultTest?.assert) {
      const existingDefaultTest =
        typeof existingConfig.defaultTest === 'object' && existingConfig.defaultTest !== null
          ? existingConfig.defaultTest
          : {};
      const existingAssert = Array.isArray((existingDefaultTest as { assert?: Assertion[] }).assert)
        ? (existingDefaultTest as { assert: Assertion[] }).assert
        : [];
      existingConfig.defaultTest = {
        ...existingDefaultTest,
        assert: [...existingAssert, ...configAddition.defaultTest.assert],
      };
    }

    fs.writeFileSync(configPath, yaml.dump(existingConfig));
    logger.info(`Wrote test suite to ${configPath}`);
    logger.info(`  - ${testCasesCount} test cases`);
    logger.info(`  - ${assertionsCount} assertions`);
    const runCommand = promptfooCommand('eval');
    logger.info(chalk.green(`Run ${chalk.bold(runCommand)} to run the generated tests`));
  } else {
    logger.info(
      `Copy the above or run ${chalk.greenBright(
        'promptfoo generate tests --write',
      )} to write directly to the config`,
    );
  }

  telemetry.record('command_used', {
    duration: Math.round((Date.now() - startTime) / 1000),
    name: 'generate_tests',
    numPrompts: testSuite.prompts.length,
    numTestsExisting: (testSuite.tests || []).length,
    numTestsGenerated: testCasesCount,
    numAssertionsGenerated: assertionsCount,
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
      'Assertion type (pi, g-eval, llm-rubric)',
      validateAssertionType,
      'pi',
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
