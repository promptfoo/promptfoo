import chalk from 'chalk';
import type { Command } from 'commander';
import * as fs from 'fs';
import yaml from 'js-yaml';
import { disableCache } from '../../cache';
import logger from '../../logger';
import telemetry from '../../telemetry';
import { synthesizeFromTestSuite } from '../../testCases';
import type { TestSuite, UnifiedConfig } from '../../types';
import { isRunningUnderNpx, printBorder, setupEnv } from '../../util';
import { resolveConfigs } from '../../util/config/load';

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
}

async function doGenerateDataset(options: DatasetGenerateOptions): Promise<void> {
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
    );
    testSuite = resolved.testSuite;
  } else {
    throw new Error('Could not find config file. Please use `--config`');
  }

  const startTime = Date.now();
  telemetry.record('command_used', {
    name: 'generate_dataset - started',
    numPrompts: testSuite.prompts.length,
    numTestsExisting: (testSuite.tests || []).length,
  });
  await telemetry.send();

  const results = await synthesizeFromTestSuite(testSuite, {
    instructions: options.instructions,
    numPersonas: Number.parseInt(options.numPersonas, 10),
    numTestCasesPerPersona: Number.parseInt(options.numTestCasesPerPersona, 10),
    provider: options.provider,
  });
  const configAddition = { tests: results.map((result) => ({ vars: result })) };
  const yamlString = yaml.dump(configAddition);
  if (options.output) {
    fs.writeFileSync(options.output, yamlString);
    printBorder();
    logger.info(`Wrote ${results.length} new test cases to ${options.output}`);
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
    existingConfig.tests = [...(existingConfig.tests || []), ...configAddition.tests];
    fs.writeFileSync(configPath, yaml.dump(existingConfig));
    logger.info(`Wrote ${results.length} new test cases to ${configPath}`);
    const runCommand = isRunningUnderNpx() ? 'npx promptfoo eval' : 'promptfoo eval';
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
  });
  await telemetry.send();
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
    .option('-o, --output [path]', 'Path to output file')
    .option('-w, --write', 'Write results to promptfoo configuration file')
    .option(
      '--provider <provider>',
      `Provider to use for generating adversarial tests. Defaults to the default grading provider.`,
    )
    .option('--numPersonas <number>', 'Number of personas to generate', '5')
    .option('--numTestCasesPerPersona <number>', 'Number of test cases per persona', '3')
    .option('--no-cache', 'Do not read or write results to disk cache', false)
    .option('--env-file, --env-path <path>', 'Path to .env file')
    .action((opts) => doGenerateDataset({ ...opts, defaultConfig, defaultConfigPath }));
}
