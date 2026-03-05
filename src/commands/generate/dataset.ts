import * as fs from 'fs';

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

export async function doGenerateDataset(options: DatasetGenerateOptions): Promise<void> {
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
    throw new Error(
      `Could not find a config file. Pass --config path/to/promptfooconfig.yaml or run "${promptfooCommand(
        'init',
      )}" to create one.`,
    );
  }

  const startTime = Date.now();
  telemetry.record('command_used', {
    name: 'generate_dataset - started',
    numPrompts: testSuite.prompts.length,
    numTestsExisting: (testSuite.tests || []).length,
  });

  // Determine whether to use the enhanced generation system
  const useEnhanced =
    options.enhanced || options.edgeCases || options.diversity || options.iterative;

  // Determine whether to generate assertions (default: true, unless --no-assertions)
  const shouldGenerateAssertions = options.withAssertions ?? options.assertions ?? true;

  // Detect PI access and determine assertion type
  const hasPiAccess = !!getEnvString('WITHPI_API_KEY');
  const effectiveAssertionType: 'pi' | 'g-eval' | 'llm-rubric' =
    options.assertionType || (hasPiAccess ? 'pi' : 'llm-rubric');
  const numAssertions = Number.parseInt(options.numAssertions || '3', 10);

  let results: Record<string, string>[];
  let diversityScore: number | undefined;
  let generatedAssertions: Assertion[] | undefined;

  if (shouldGenerateAssertions && useEnhanced) {
    // Use combined generation for test cases + assertions
    logger.info('Using enhanced generation with assertions...');
    if (hasPiAccess) {
      logger.info('Using PI-based assertions');
    } else {
      logger.info('Using LLM-rubric assertions (set WITHPI_API_KEY for PI assertions)');
    }

    const datasetOpts: Partial<DatasetGenerationOptions> = {
      instructions: options.instructions,
      numPersonas: Number.parseInt(options.numPersonas, 10),
      numTestCasesPerPersona: Number.parseInt(options.numTestCasesPerPersona, 10),
      provider: options.provider,
    };
    if (options.edgeCases) {
      datasetOpts.edgeCases = {
        enabled: true,
        types: ['boundary', 'format', 'empty', 'special-chars'],
        count: 10,
        includeAdversarial: false,
      };
    }
    if (options.diversity) {
      datasetOpts.diversity = {
        enabled: true,
        targetScore: options.diversityTarget ? Number.parseFloat(options.diversityTarget) : 0.7,
        measureMethod: 'text',
      };
    }
    if (options.iterative) {
      datasetOpts.iterative = { enabled: true, maxRounds: 2, targetDiversity: 0.7 };
    }

    const genResult = await generateTestSuite(testSuite.prompts, testSuite.tests || [], {
      dataset: datasetOpts,
      assertions: {
        type: effectiveAssertionType,
        numAssertions,
      },
    });

    results = genResult.dataset?.testCases || [];
    diversityScore = genResult.dataset?.diversity?.score;
    generatedAssertions = genResult.assertions?.assertions;

    // Log generation details
    if (genResult.dataset?.edgeCases && genResult.dataset.edgeCases.length > 0) {
      logger.info(`Generated ${genResult.dataset.edgeCases.length} edge cases`);
    }
    if (genResult.dataset?.diversity) {
      logger.info(`Diversity score: ${(genResult.dataset.diversity.score * 100).toFixed(1)}%`);
    }
    if (generatedAssertions && generatedAssertions.length > 0) {
      logger.info(`Generated ${generatedAssertions.length} assertions`);
    }
  } else if (useEnhanced) {
    logger.info('Using enhanced dataset generation...');

    const datasetOpts: Partial<DatasetGenerationOptions> = {
      instructions: options.instructions,
      numPersonas: Number.parseInt(options.numPersonas, 10),
      numTestCasesPerPersona: Number.parseInt(options.numTestCasesPerPersona, 10),
      provider: options.provider,
    };
    if (options.edgeCases) {
      datasetOpts.edgeCases = {
        enabled: true,
        types: ['boundary', 'format', 'empty', 'special-chars'],
        count: 10,
        includeAdversarial: false,
      };
    }
    if (options.diversity) {
      datasetOpts.diversity = {
        enabled: true,
        targetScore: options.diversityTarget ? Number.parseFloat(options.diversityTarget) : 0.7,
        measureMethod: 'text',
      };
    }
    if (options.iterative) {
      datasetOpts.iterative = { enabled: true, maxRounds: 2, targetDiversity: 0.7 };
    }

    const genResult = await generateDataset(testSuite.prompts, testSuite.tests || [], datasetOpts);

    results = genResult.testCases;
    diversityScore = genResult.diversity?.score;

    // Log enhanced generation details
    if (genResult.edgeCases && genResult.edgeCases.length > 0) {
      logger.info(`Generated ${genResult.edgeCases.length} edge cases`);
    }
    if (genResult.diversity) {
      logger.info(`Diversity score: ${(genResult.diversity.score * 100).toFixed(1)}%`);
    }
  } else {
    // Use the original synthesis for backward compatibility
    results = await synthesizeFromTestSuite(testSuite, {
      instructions: options.instructions,
      numPersonas: Number.parseInt(options.numPersonas, 10),
      numTestCasesPerPersona: Number.parseInt(options.numTestCasesPerPersona, 10),
      provider: options.provider,
    });
  }

  // Build config addition with test cases and optionally assertions
  const configAddition: {
    tests: Array<{ vars: Record<string, string> }>;
    defaultTest?: { assert: Assertion[] };
  } = {
    tests: results.map((result) => ({ vars: result })),
  };
  if (generatedAssertions && generatedAssertions.length > 0) {
    configAddition.defaultTest = { assert: generatedAssertions };
  }
  const yamlString = yaml.dump(configAddition);
  if (options.output) {
    // Should the output be written as a YAML or CSV?
    if (options.output.endsWith('.csv')) {
      // Note: CSV output only contains test cases, not assertions
      fs.writeFileSync(options.output, serializeObjectArrayAsCSV(results));
      printBorder();
      logger.info(`Wrote ${results.length} new test cases to ${options.output}`);
      if (generatedAssertions && generatedAssertions.length > 0) {
        logger.info(
          chalk.yellow(
            'Note: CSV format does not support assertions. Use YAML output to include assertions.',
          ),
        );
      }
    } else if (options.output.endsWith('.yaml')) {
      fs.writeFileSync(options.output, yamlString);
      printBorder();
      const assertionMsg =
        generatedAssertions && generatedAssertions.length > 0
          ? ` and ${generatedAssertions.length} assertion${generatedAssertions.length === 1 ? '' : 's'}`
          : '';
      logger.info(`Wrote ${results.length} new test cases${assertionMsg} to ${options.output}`);
    } else {
      throw new Error(`Unsupported output file type: ${options.output}`);
    }
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
    const existingTests = existingConfig.tests;
    let testsArray: Array<TestCase | string | { vars: Record<string, string> }> = [];
    if (Array.isArray(existingTests)) {
      testsArray = existingTests as typeof testsArray;
    } else if (existingTests) {
      testsArray = [existingTests as TestCase | string];
    }
    existingConfig.tests = [...testsArray, ...configAddition.tests];

    // Add generated assertions to defaultTest.assert if present
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

    fs.writeFileSync(configPath, yaml.dump(existingConfig));
    const assertionMsg =
      generatedAssertions && generatedAssertions.length > 0
        ? ` and ${generatedAssertions.length} assertion${generatedAssertions.length === 1 ? '' : 's'}`
        : '';
    logger.info(`Wrote ${results.length} new test cases${assertionMsg} to ${configPath}`);
    const runCommand = promptfooCommand('eval');
    logger.info(chalk.green(`Run ${chalk.bold(runCommand)} to run the generated tests`));
  } else {
    logger.info(
      `Copy the above test cases or run ${chalk.greenBright(
        'promptfoo generate dataset --write',
      )} to write directly to the config`,
    );
  }

  telemetry.record('command_used', {
    duration: Math.round((Date.now() - startTime) / 1000),
    name: 'generate_dataset',
    numPrompts: testSuite.prompts.length,
    numTestsExisting: (testSuite.tests || []).length,
    numTestsGenerated: results.length,
    provider: options.provider || 'default',
    enhanced: useEnhanced || false,
    withAssertions: shouldGenerateAssertions,
    numAssertionsGenerated: generatedAssertions?.length || 0,
    ...(shouldGenerateAssertions && { assertionType: effectiveAssertionType }),
    ...(diversityScore !== undefined && { diversityScore }),
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
    .option('--enhanced', 'Use enhanced generation with concepts, personas, and diversity')
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
