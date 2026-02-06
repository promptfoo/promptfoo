import * as fs from 'fs';

import chalk from 'chalk';
import { InvalidArgumentError } from 'commander';
import yaml from 'js-yaml';
import { synthesizeFromTestSuite } from '../../assertions/synthesis';
import { disableCache } from '../../cache';
import { generateAssertions } from '../../generation/assertions';
import logger from '../../logger';
import telemetry from '../../telemetry';
import { resolveConfigs } from '../../util/config/load';
import { printBorder, setupEnv } from '../../util/index';
import { promptfooCommand } from '../../util/promptfooCommand';
import type { Command } from 'commander';

import type { AssertionGenerationOptions } from '../../generation/types';
import type { Assertion, TestSuite, UnifiedConfig } from '../../types/index';

interface DatasetGenerateOptions {
  cache: boolean;
  config?: string;
  envFile?: string;
  instructions?: string;
  numAssertions?: string;
  output?: string;
  provider?: string;
  write: boolean;
  defaultConfig: Partial<UnifiedConfig>;
  defaultConfigPath: string | undefined;
  type: 'pi' | 'g-eval' | 'llm-rubric';
  // New options
  coverage?: boolean;
  validate?: boolean;
  negativeTests?: boolean;
  enhanced?: boolean;
}

export async function doGenerateAssertions(options: DatasetGenerateOptions): Promise<void> {
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
      'AssertionGeneration',
    );
    testSuite = resolved.testSuite;
  } else {
    throw new Error(
      `Could not find a config file. Pass --config path/to/promptfooconfig.yaml or run "${promptfooCommand(
        'init',
      )}" to create one.`,
    );
  }

  const startTime = Date.now();
  telemetry.record('command_used', {
    name: 'generate_assertions - started',
    numPrompts: testSuite.prompts.length,
    numTestsExisting: (testSuite.tests || []).length,
  });

  // Determine whether to use the enhanced generation system
  const useEnhanced =
    options.enhanced || options.coverage || options.validate || options.negativeTests;

  let results: Assertion[];
  let coverageScore: number | undefined;
  let validationAccuracy: number | undefined;

  if (useEnhanced) {
    logger.info('Using enhanced assertion generation...');

    const assertionOpts: Partial<AssertionGenerationOptions> = {
      instructions: options.instructions,
      numQuestions: Number.parseInt(options.numAssertions || '5', 10),
      provider: options.provider,
      type: options.type,
    };
    if (options.coverage) {
      assertionOpts.coverage = { enabled: true, extractRequirements: true, minCoverageScore: 0.8 };
    }
    if (options.validate) {
      assertionOpts.validation = {
        enabled: true,
        autoGenerateSamples: true,
        sampleCount: 5,
        sampleOutputs: [],
      };
    }
    if (options.negativeTests) {
      assertionOpts.negativeTests = {
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

    const genResult = await generateAssertions(
      testSuite.prompts,
      testSuite.tests || [],
      assertionOpts,
    );

    results = genResult.assertions;
    coverageScore = genResult.coverage?.overallScore;
    validationAccuracy = genResult.validation?.[0]?.accuracy;

    // Log enhanced generation details
    if (genResult.coverage) {
      logger.info(`Coverage score: ${(genResult.coverage.overallScore * 100).toFixed(1)}%`);
      if (genResult.coverage.gaps.length > 0) {
        logger.info(`Uncovered requirements: ${genResult.coverage.gaps.join(', ')}`);
      }
    }
    if (genResult.validation && genResult.validation.length > 0) {
      const avgAccuracy =
        genResult.validation.reduce((sum, v) => sum + v.accuracy, 0) / genResult.validation.length;
      logger.info(`Validation accuracy: ${(avgAccuracy * 100).toFixed(1)}%`);
    }
    if (genResult.negativeTests && genResult.negativeTests.length > 0) {
      logger.info(`Generated ${genResult.negativeTests.length} negative test assertions`);
      // Add negative tests to results
      results = [...results, ...genResult.negativeTests];
    }
  } else {
    // Use the original synthesis for backward compatibility
    results = await synthesizeFromTestSuite(testSuite, {
      instructions: options.instructions,
      numQuestions: Number.parseInt(options.numAssertions || '5', 10),
      provider: options.provider,
      type: options.type,
    });
  }

  const configAddition = {
    assert: results,
  };
  const yamlString = yaml.dump(configAddition);
  if (options.output) {
    // Should the output be written as a YAML or CSV?
    if (options.output.endsWith('.yaml')) {
      fs.writeFileSync(options.output, yamlString);
    } else {
      throw new Error(`Unsupported output file type: ${options.output}`);
    }
    printBorder();
    logger.info(`Wrote ${results.length} new assertions to ${options.output}`);
    printBorder();
  } else {
    printBorder();
    logger.info('New test Cases');
    printBorder();
    logger.info(yamlString);
  }

  printBorder();
  if (options.write && configPath) {
    const existingConfig = yaml.load(fs.readFileSync(configPath, 'utf8')) as Partial<UnifiedConfig>;
    // Handle the union type for tests (string | TestGeneratorConfig | Array<...>)
    const existingDefaultTest =
      typeof existingConfig.defaultTest === 'object' ? existingConfig.defaultTest : {};
    existingConfig.defaultTest = {
      ...existingDefaultTest,
      assert: [...(existingDefaultTest?.assert || []), ...configAddition.assert],
    };
    fs.writeFileSync(configPath, yaml.dump(existingConfig));
    logger.info(`Wrote ${results.length} new test cases to ${configPath}`);
    const runCommand = promptfooCommand('eval');
    logger.info(chalk.green(`Run ${chalk.bold(runCommand)} to run the generated assertions`));
  } else {
    logger.info(
      `Copy the above test cases or run ${chalk.greenBright(
        'promptfoo generate assertions --write',
      )} to write directly to the config`,
    );
  }

  telemetry.record('command_used', {
    duration: Math.round((Date.now() - startTime) / 1000),
    name: 'generate_assertions',
    numPrompts: testSuite.prompts.length,
    numTestsExisting: (testSuite.tests || []).length,
    numAssertionsGenerated: results.length,
    provider: options.provider || 'default',
    enhanced: useEnhanced || false,
    ...(coverageScore !== undefined && { coverageScore }),
    ...(validationAccuracy !== undefined && { validationAccuracy }),
  });
}

function validateAssertionType(value: string, _previous: string) {
  const allowedStrings = ['pi', 'g-eval', 'llm-rubric'];
  if (!allowedStrings.includes(value)) {
    throw new InvalidArgumentError(`Option --type must be one of: ${allowedStrings.join(', ')}.`);
  }
  return value;
}

export function generateAssertionsCommand(
  program: Command,
  defaultConfig: Partial<UnifiedConfig>,
  defaultConfigPath: string | undefined,
) {
  program
    .command('assertions')
    .description('Generate additional subjective/objective assertions')
    .option(
      '-t, --type [type]',
      'The type of natural language assertion to generate (pi, g-eval, or llm-rubric)',
      validateAssertionType,
      'pi',
    )
    .option(
      '-c, --config [path]',
      'Path to configuration file. Defaults to promptfooconfig.yaml. Requires at least 1 prompt to be defined.',
    )
    .option('-o, --output [path]', 'Path to output file. Supports YAML output')
    .option('-w, --write', 'Write results to promptfoo configuration file')
    .option('--numAssertions <amount>', 'Number of assertions to generate')
    .option(
      '--provider <provider>',
      `Provider to use for generating assertions. Defaults to the default grading provider.`,
    )
    .option(
      '-i, --instructions [instructions]',
      'Additional instructions to follow while generating assertions',
    )
    .option('--no-cache', 'Do not read or write results to disk cache', false)
    .option('--env-file, --env-path <path>', 'Path to .env file')
    // Enhanced generation options
    .option('--enhanced', 'Use enhanced generation with coverage analysis and validation')
    .option('--coverage', 'Enable coverage analysis to map assertions to requirements')
    .option('--validate', 'Validate assertions against sample outputs')
    .option('--negative-tests', 'Generate negative test assertions (should-not patterns)')
    .action((opts) => doGenerateAssertions({ ...opts, defaultConfig, defaultConfigPath }));
}
