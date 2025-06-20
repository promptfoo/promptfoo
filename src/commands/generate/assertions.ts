import chalk from 'chalk';
import type { Command } from 'commander';
import { InvalidArgumentError } from 'commander';
import * as fs from 'fs';
import yaml from 'js-yaml';
import { synthesizeFromTestSuite } from '../../assertions/synthesis';
import { disableCache } from '../../cache';
import logger from '../../logger';
import telemetry from '../../telemetry';
import { type TestSuite, type UnifiedConfig } from '../../types';
import { isRunningUnderNpx, printBorder, setupEnv } from '../../util';
import { resolveConfigs } from '../../util/config/load';

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
    throw new Error('Could not find config file. Please use `--config`');
  }

  const startTime = Date.now();
  telemetry.record('command_used', {
    name: 'generate_assertions - started',
    numPrompts: testSuite.prompts.length,
    numTestsExisting: (testSuite.tests || []).length,
  });
  await telemetry.send();

  const results = await synthesizeFromTestSuite(testSuite, {
    instructions: options.instructions,
    numQuestions: Number.parseInt(options.numAssertions || '5', 10),
    provider: options.provider,
    type: options.type,
  });
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
    existingConfig.defaultTest = {
      ...existingConfig.defaultTest,
      assert: [...(existingConfig.defaultTest?.assert || []), ...configAddition.assert],
    };
    fs.writeFileSync(configPath, yaml.dump(existingConfig));
    logger.info(`Wrote ${results.length} new test cases to ${configPath}`);
    const runCommand = isRunningUnderNpx() ? 'npx promptfoo eval' : 'promptfoo eval';
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
  });
  await telemetry.send();
}

function validateAssertionType(value: string, previous: string) {
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
    .action((opts) => doGenerateAssertions({ ...opts, defaultConfig, defaultConfigPath }));
}
