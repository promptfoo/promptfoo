import fs from 'fs/promises';

import chalk from 'chalk';
import yaml from 'js-yaml';
import { disableCache } from '../../cache';
import { serializeObjectArrayAsCSV } from '../../csv';
import { getEnvString } from '../../envars';
import { generateDataset } from '../../generation/dataset';
import { generateTestSuite } from '../../generation/index';
import logger from '../../logger';
import telemetry from '../../telemetry';
import { synthesizeFromTestSuite } from '../../testCase/synthesis';
import { resolveConfigs } from '../../util/config/load';
import { printBorder, setupEnv } from '../../util/index';
import { promptfooCommand } from '../../util/promptfooCommand';
import {
  validateAssertionTypeOption,
  validatePositiveIntegerOption,
  validateProbabilityOption,
} from './options';
import type { Command } from 'commander';

import type { DatasetGenerationOptions } from '../../generation/types';
import type { Assertion, TestCase, TestSuite, UnifiedConfig } from '../../types/index';

interface DatasetGenerateOptions {
  cache: boolean;
  config?: string;
  envFile?: string;
  instructions?: string;
  numPersonas: string;
  numTestCasesPerPersona: string;
  output?: string;
  provider?: string;
  write: boolean;
  defaultConfig: Partial<UnifiedConfig>;
  defaultConfigPath: string | undefined;
  // Enhanced generation options
  edgeCases?: boolean;
  diversity?: boolean;
  diversityTarget?: string;
  iterative?: boolean;
  enhanced?: boolean;
  // Assertion generation options
  withAssertions?: boolean;
  assertions?: boolean; // Negated form from --no-assertions
  assertionType?: 'pi' | 'g-eval' | 'llm-rubric';
  numAssertions?: string;
}

type GeneratedConfigTest = {
  vars: Record<string, string>;
  metadata?: Record<string, unknown>;
};

type ConfigAddition = {
  tests: GeneratedConfigTest[];
  defaultTest?: { assert: Assertion[] };
};

interface GeneratedDatasetOutput {
  results: Record<string, string>[];
  configTests: GeneratedConfigTest[];
  diversityScore?: number;
  generatedAssertions?: Assertion[];
}

interface GenerationSettings {
  useEnhanced: boolean;
  shouldGenerateAssertions: boolean;
  hasPiAccess: boolean;
  effectiveAssertionType: 'pi' | 'g-eval' | 'llm-rubric';
  numAssertions: number;
}

function buildGeneratedConfigTests(
  testCases: Record<string, string>[],
  edgeCases: Array<{ vars: Record<string, string>; type: string; description: string }> = [],
): GeneratedConfigTest[] {
  return [
    ...testCases.map((vars) => ({ vars })),
    ...edgeCases.map((edgeCase) => ({
      vars: edgeCase.vars,
      metadata: {
        edgeCase: true,
        type: edgeCase.type,
        description: edgeCase.description,
      },
    })),
  ];
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

function getGenerationSettings(options: DatasetGenerateOptions): GenerationSettings {
  const useEnhanced =
    options.enhanced || options.edgeCases || options.diversity || options.iterative;
  const shouldGenerateAssertions = options.withAssertions ?? options.assertions ?? true;
  const hasPiAccess = !!getEnvString('WITHPI_API_KEY');
  return {
    useEnhanced: Boolean(useEnhanced),
    shouldGenerateAssertions,
    hasPiAccess,
    effectiveAssertionType: options.assertionType || (hasPiAccess ? 'pi' : 'llm-rubric'),
    numAssertions: Number.parseInt(options.numAssertions || '3', 10),
  };
}

function buildDatasetOptions(options: DatasetGenerateOptions): Partial<DatasetGenerationOptions> {
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
    datasetOptions.concepts = {
      maxTopics: 5,
      maxEntities: 10,
      extractRelationships: true,
    };
    datasetOptions.iterative = { enabled: true, maxRounds: 2, targetDiversity: 0.7 };
  }
  return datasetOptions;
}

function logEnhancedDetails(
  edgeCases: Array<unknown> | undefined,
  diversityScore: number | undefined,
  generatedAssertions?: Assertion[],
): void {
  if (edgeCases && edgeCases.length > 0) {
    logger.info(`Generated ${edgeCases.length} edge cases`);
  }
  if (diversityScore !== undefined) {
    logger.info(`Diversity score: ${(diversityScore * 100).toFixed(1)}%`);
  }
  if (generatedAssertions && generatedAssertions.length > 0) {
    logger.info(`Generated ${generatedAssertions.length} assertions`);
  }
}

async function generateEnhancedWithAssertions(
  testSuite: TestSuite,
  options: DatasetGenerateOptions,
  settings: GenerationSettings,
): Promise<GeneratedDatasetOutput> {
  logger.info('Using enhanced generation with assertions...');
  logger.info(
    settings.hasPiAccess
      ? 'Using PI-based assertions'
      : 'Using LLM-rubric assertions (set WITHPI_API_KEY for PI assertions)',
  );
  const genResult = await generateTestSuite(testSuite.prompts, testSuite.tests || [], {
    dataset: buildDatasetOptions(options),
    assertions: {
      instructions: options.instructions,
      type: settings.effectiveAssertionType,
      numAssertions: settings.numAssertions,
      provider: options.provider,
    },
  });
  const configTests = buildGeneratedConfigTests(
    genResult.dataset?.testCases || [],
    genResult.dataset?.edgeCases,
  );
  const generatedAssertions = genResult.assertions?.assertions;
  const diversityScore = genResult.dataset?.diversity?.score;
  logEnhancedDetails(genResult.dataset?.edgeCases, diversityScore, generatedAssertions);
  return {
    configTests,
    results: configTests.map((test) => test.vars),
    diversityScore,
    generatedAssertions,
  };
}

async function generateEnhancedDataset(
  testSuite: TestSuite,
  options: DatasetGenerateOptions,
): Promise<GeneratedDatasetOutput> {
  logger.info('Using enhanced dataset generation...');
  const genResult = await generateDataset(
    testSuite.prompts,
    testSuite.tests || [],
    buildDatasetOptions(options),
  );
  const configTests = buildGeneratedConfigTests(genResult.testCases, genResult.edgeCases);
  const diversityScore = genResult.diversity?.score;
  logEnhancedDetails(genResult.edgeCases, diversityScore);
  return {
    configTests,
    results: configTests.map((test) => test.vars),
    diversityScore,
  };
}

async function generateLegacyDataset(
  testSuite: TestSuite,
  options: DatasetGenerateOptions,
): Promise<GeneratedDatasetOutput> {
  const results = await synthesizeFromTestSuite(testSuite, {
    instructions: options.instructions,
    numPersonas: Number.parseInt(options.numPersonas, 10),
    numTestCasesPerPersona: Number.parseInt(options.numTestCasesPerPersona, 10),
    provider: options.provider,
  });
  return { configTests: buildGeneratedConfigTests(results), results };
}

async function generateOutput(
  testSuite: TestSuite,
  options: DatasetGenerateOptions,
  settings: GenerationSettings,
): Promise<GeneratedDatasetOutput> {
  if (settings.useEnhanced && settings.shouldGenerateAssertions) {
    return generateEnhancedWithAssertions(testSuite, options, settings);
  }
  if (settings.useEnhanced) {
    return generateEnhancedDataset(testSuite, options);
  }
  return generateLegacyDataset(testSuite, options);
}

function buildConfigAddition(generated: GeneratedDatasetOutput): ConfigAddition {
  const configAddition: ConfigAddition = { tests: generated.configTests };
  if (generated.generatedAssertions?.length) {
    configAddition.defaultTest = { assert: generated.generatedAssertions };
  }
  return configAddition;
}

function assertionsMessage(assertions?: Assertion[]): string {
  if (!assertions?.length) {
    return '';
  }
  return ` and ${assertions.length} assertion${assertions.length === 1 ? '' : 's'}`;
}

async function writeOutput(
  options: DatasetGenerateOptions,
  generated: GeneratedDatasetOutput,
  yamlString: string,
): Promise<void> {
  if (!options.output) {
    printBorder();
    logger.info('New test Cases');
    printBorder();
    logger.info(yamlString);
    return;
  }
  if (options.output.endsWith('.csv')) {
    await fs.writeFile(options.output, serializeObjectArrayAsCSV(generated.results));
    printBorder();
    logger.info(`Wrote ${generated.results.length} new test cases to ${options.output}`);
    if (generated.generatedAssertions?.length) {
      logger.info(
        chalk.yellow(
          'Note: CSV format does not support assertions. Use YAML output to include assertions.',
        ),
      );
    }
  } else if (options.output.endsWith('.yaml')) {
    await fs.writeFile(options.output, yamlString);
    printBorder();
    logger.info(
      `Wrote ${generated.results.length} new test cases${assertionsMessage(generated.generatedAssertions)} to ${options.output}`,
    );
  } else {
    throw new Error(`Unsupported output file type: ${options.output}`);
  }
  printBorder();
}

function asTestArray(
  tests: UnifiedConfig['tests'],
): Array<TestCase | string | GeneratedConfigTest> {
  if (Array.isArray(tests)) {
    return tests as Array<TestCase | string | GeneratedConfigTest>;
  }
  return tests ? [tests as TestCase | string] : [];
}

async function appendToConfig(
  configPath: string,
  configAddition: ConfigAddition,
  generated: GeneratedDatasetOutput,
): Promise<void> {
  const existingConfig = yaml.load(await fs.readFile(configPath, 'utf8')) as Partial<UnifiedConfig>;
  existingConfig.tests = [...asTestArray(existingConfig.tests), ...configAddition.tests];
  if (configAddition.defaultTest?.assert) {
    const existingDefaultTest =
      typeof existingConfig.defaultTest === 'object' && existingConfig.defaultTest !== null
        ? existingConfig.defaultTest
        : {};
    const existingAssertions = Array.isArray(
      (existingDefaultTest as { assert?: Assertion[] }).assert,
    )
      ? (existingDefaultTest as { assert: Assertion[] }).assert
      : [];
    existingConfig.defaultTest = {
      ...existingDefaultTest,
      assert: [...existingAssertions, ...configAddition.defaultTest.assert],
    };
  }
  await fs.writeFile(configPath, yaml.dump(existingConfig));
  logger.info(
    `Wrote ${generated.results.length} new test cases${assertionsMessage(generated.generatedAssertions)} to ${configPath}`,
  );
  logger.info(
    chalk.green(`Run ${chalk.bold(promptfooCommand('eval'))} to run the generated tests`),
  );
}

async function finishOutput(
  options: DatasetGenerateOptions,
  configPath: string,
  generated: GeneratedDatasetOutput,
): Promise<void> {
  const configAddition = buildConfigAddition(generated);
  await writeOutput(options, generated, yaml.dump(configAddition));
  printBorder();
  if (!options.write) {
    logger.info(
      `Copy the above test cases or run ${chalk.greenBright(
        'promptfoo generate dataset --write',
      )} to write directly to the config`,
    );
    return;
  }
  await appendToConfig(configPath, configAddition, generated);
}

export async function doGenerateDataset(options: DatasetGenerateOptions): Promise<void> {
  validatePositiveIntegerOption(options.numPersonas, '--numPersonas');
  validatePositiveIntegerOption(options.numTestCasesPerPersona, '--numTestCasesPerPersona');
  validatePositiveIntegerOption(options.numAssertions, '--num-assertions');
  validateProbabilityOption(options.diversityTarget, '--diversity-target');
  validateAssertionTypeOption(options.assertionType, '--assertion-type');

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
    name: 'generate_dataset - started',
    numPrompts: testSuite.prompts.length,
    numTestsExisting: (testSuite.tests || []).length,
  });

  const settings = getGenerationSettings(options);
  const generated = await generateOutput(testSuite, options, settings);
  await finishOutput(options, configPath, generated);

  telemetry.record('command_used', {
    duration: Math.round((Date.now() - startTime) / 1000),
    name: 'generate_dataset',
    numPrompts: testSuite.prompts.length,
    numTestsExisting: (testSuite.tests || []).length,
    numTestsGenerated: generated.results.length,
    provider: options.provider || 'default',
    enhanced: settings.useEnhanced,
    withAssertions: settings.shouldGenerateAssertions,
    numAssertionsGenerated: generated.generatedAssertions?.length || 0,
    ...(settings.shouldGenerateAssertions && {
      assertionType: settings.effectiveAssertionType,
    }),
    ...(generated.diversityScore !== undefined && { diversityScore: generated.diversityScore }),
  });
}

export function generateDatasetCommand(
  program: Command,
  defaultConfig: Partial<UnifiedConfig>,
  defaultConfigPath: string | undefined,
) {
  program
    .command('dataset')
    .description('Generate test cases')
    .option(
      '-i, --instructions [instructions]',
      'Additional instructions to follow while generating test cases',
    )
    .option('-c, --config [path]', 'Path to configuration file. Defaults to promptfooconfig.yaml')
    .option('-o, --output [path]', 'Path to output file. Supports CSV and YAML output.')
    .option('-w, --write', 'Write results to promptfoo configuration file')
    .option(
      '--provider <provider>',
      `Provider to use for generating adversarial tests. Defaults to the default grading provider.`,
    )
    .option('--numPersonas <number>', 'Number of personas to generate', '5')
    .option('--numTestCasesPerPersona <number>', 'Number of test cases per persona', '3')
    .option('--no-cache', 'Do not read or write results to disk cache', false)
    .option('--env-file, --env-path <path>', 'Path to .env file')
    // Enhanced generation options
    .option('--enhanced', 'Use enhanced persona-based dataset generation')
    .option('--edge-cases', 'Include edge case generation (boundary, format, empty, special chars)')
    .option('--diversity', 'Enable diversity measurement and optimization')
    .option('--diversity-target <number>', 'Target diversity score (0-1)', '0.7')
    .option('--iterative', 'Use iterative generation to fill coverage gaps')
    // Assertion generation options
    .option('--with-assertions', 'Also generate assertions (default: true with --enhanced)')
    .option('--no-assertions', 'Skip assertion generation')
    .option(
      '--assertion-type <type>',
      'Assertion type: pi, g-eval, or llm-rubric (auto-detected based on WITHPI_API_KEY)',
    )
    .option('--num-assertions <number>', 'Number of assertions to generate', '3')
    .action((opts) => doGenerateDataset({ ...opts, defaultConfig, defaultConfigPath }));
}
