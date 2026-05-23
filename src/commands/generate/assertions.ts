import fs from 'fs/promises';

import chalk from 'chalk';
import { InvalidArgumentError } from 'commander';
import yaml from 'js-yaml';
import { synthesizeFromTestSuite } from '../../assertions/synthesis';
import { disableCache } from '../../cache';
import { getEnvString } from '../../envars';
import { generateAssertions } from '../../generation/assertions';
import logger from '../../logger';
import telemetry from '../../telemetry';
import { resolveConfigs } from '../../util/config/load';
import { printBorder, setupEnv } from '../../util/index';
import { promptfooCommand } from '../../util/promptfooCommand';
import type { Command } from 'commander';

import type { AssertionGenerationOptions, AssertionGenerationResult } from '../../generation/types';
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
  type?: 'pi' | 'g-eval' | 'llm-rubric';
  // New options
  coverage?: boolean;
  validate?: boolean;
  negativeTests?: boolean;
  enhanced?: boolean;
}

interface GeneratedAssertions {
  results: Assertion[];
  enhanced: boolean;
  coverageScore?: number;
  validationAccuracy?: number;
}

function getConfigPath(options: DatasetGenerateOptions): string {
  const configPath = options.config || options.defaultConfigPath;
  if (!configPath) {
    throw new Error(
      `Could not find a config file. Pass --config path/to/promptfooconfig.yaml or run "${promptfooCommand(
        'init',
      )}" to create one.`,
    );
  }
  return configPath;
}

function getEffectiveAssertionType(
  options: DatasetGenerateOptions,
): 'pi' | 'g-eval' | 'llm-rubric' {
  return options.type || (getEnvString('WITHPI_API_KEY') ? 'pi' : 'llm-rubric');
}

function buildEnhancedOptions(
  options: DatasetGenerateOptions,
  type: 'pi' | 'g-eval' | 'llm-rubric',
): Partial<AssertionGenerationOptions> {
  const assertionOptions: Partial<AssertionGenerationOptions> = {
    instructions: options.instructions,
    numQuestions: Number.parseInt(options.numAssertions || '5', 10),
    provider: options.provider,
    type,
  };
  if (options.coverage) {
    assertionOptions.coverage = { enabled: true, extractRequirements: true, minCoverageScore: 0.8 };
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

function logEnhancedResults(result: AssertionGenerationResult): Assertion[] {
  if (result.coverage) {
    logger.info(`Coverage score: ${(result.coverage.overallScore * 100).toFixed(1)}%`);
    if (result.coverage.gaps.length > 0) {
      logger.info(`Uncovered requirements: ${result.coverage.gaps.join(', ')}`);
    }
  }
  if (result.validation && result.validation.length > 0) {
    const avgAccuracy =
      result.validation.reduce((sum, validation) => sum + validation.accuracy, 0) /
      result.validation.length;
    logger.info(`Validation accuracy: ${(avgAccuracy * 100).toFixed(1)}%`);
  }
  if (result.negativeTests && result.negativeTests.length > 0) {
    logger.info(`Generated ${result.negativeTests.length} negative test assertions`);
    return [...result.assertions, ...result.negativeTests];
  }
  return result.assertions;
}

async function generateResults(
  testSuite: TestSuite,
  options: DatasetGenerateOptions,
): Promise<GeneratedAssertions> {
  const type = getEffectiveAssertionType(options);
  const enhanced = Boolean(
    options.enhanced || options.coverage || options.validate || options.negativeTests,
  );
  if (!enhanced) {
    const results = await synthesizeFromTestSuite(testSuite, {
      instructions: options.instructions,
      numQuestions: Number.parseInt(options.numAssertions || '5', 10),
      provider: options.provider,
      type,
    });
    return { results, enhanced };
  }

  logger.info('Using enhanced assertion generation...');
  const result = await generateAssertions(
    testSuite.prompts,
    testSuite.tests || [],
    buildEnhancedOptions(options, type),
  );
  return {
    results: logEnhancedResults(result),
    enhanced,
    coverageScore: result.coverage?.overallScore,
    validationAccuracy: result.validation?.[0]?.accuracy,
  };
}

async function writeOutput(output: string | undefined, yamlString: string, count: number) {
  if (output) {
    if (!output.endsWith('.yaml')) {
      throw new Error(`Unsupported output file type: ${output}`);
    }
    await fs.writeFile(output, yamlString);
    printBorder();
    logger.info(`Wrote ${count} new assertions to ${output}`);
    printBorder();
    return;
  }

  printBorder();
  logger.info('New test Cases');
  printBorder();
  logger.info(yamlString);
}

async function appendToConfig(configPath: string, results: Assertion[]) {
  const existingConfig = yaml.load(await fs.readFile(configPath, 'utf8')) as Partial<UnifiedConfig>;
  const existingDefaultTest =
    typeof existingConfig.defaultTest === 'object' ? existingConfig.defaultTest : {};
  existingConfig.defaultTest = {
    ...existingDefaultTest,
    assert: [...(existingDefaultTest?.assert || []), ...results],
  };
  await fs.writeFile(configPath, yaml.dump(existingConfig));
  logger.info(`Wrote ${results.length} new assertions to ${configPath}`);
  const runCommand = promptfooCommand('eval');
  logger.info(chalk.green(`Run ${chalk.bold(runCommand)} to run the generated assertions`));
}

async function finishOutput(
  options: DatasetGenerateOptions,
  configPath: string,
  results: Assertion[],
): Promise<void> {
  await writeOutput(options.output, yaml.dump({ assert: results }), results.length);
  printBorder();
  if (!options.write) {
    logger.info(
      `Copy the above test cases or run ${chalk.greenBright(
        'promptfoo generate assertions --write',
      )} to write directly to the config`,
    );
    return;
  }
  await appendToConfig(configPath, results);
}

export async function doGenerateAssertions(options: DatasetGenerateOptions): Promise<void> {
  setupEnv(options.envFile);
  if (!options.cache) {
    logger.info('Cache is disabled.');
    disableCache();
  }

  const configPath = getConfigPath(options);
  const testSuite = (
    await resolveConfigs({ config: [configPath] }, options.defaultConfig, 'AssertionGeneration')
  ).testSuite;
  const startTime = Date.now();
  telemetry.record('command_used', {
    name: 'generate_assertions - started',
    numPrompts: testSuite.prompts.length,
    numTestsExisting: (testSuite.tests || []).length,
  });

  const generated = await generateResults(testSuite, options);
  await finishOutput(options, configPath, generated.results);

  telemetry.record('command_used', {
    duration: Math.round((Date.now() - startTime) / 1000),
    name: 'generate_assertions',
    numPrompts: testSuite.prompts.length,
    numTestsExisting: (testSuite.tests || []).length,
    numAssertionsGenerated: generated.results.length,
    provider: options.provider || 'default',
    enhanced: generated.enhanced,
    ...(generated.coverageScore !== undefined && { coverageScore: generated.coverageScore }),
    ...(generated.validationAccuracy !== undefined && {
      validationAccuracy: generated.validationAccuracy,
    }),
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
      'The type of natural language assertion to generate (pi, g-eval, or llm-rubric; defaults based on WITHPI_API_KEY)',
      validateAssertionType,
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
    .option('--enhanced', 'Use enhanced assertion generation')
    .option('--coverage', 'Enable coverage analysis to map assertions to requirements')
    .option('--validate', 'Validate assertions against sample outputs')
    .option('--negative-tests', 'Generate negative test assertions (should-not patterns)')
    .action((opts) => doGenerateAssertions({ ...opts, defaultConfig, defaultConfigPath }));
}
