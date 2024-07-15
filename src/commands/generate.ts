import chalk from 'chalk';
import { Command } from 'commander';
import dedent from 'dedent';
import * as fs from 'fs';
import yaml from 'js-yaml';
import { disableCache } from '../cache';
import { resolveConfigs } from '../config';
import logger from '../logger';
import { synthesizeFromTestSuite as redteamSynthesizeFromTestSuite } from '../redteam';
import {
  REDTEAM_MODEL,
  DEFAULT_PLUGINS as REDTEAM_DEFAULT_PLUGINS,
  ADDITIONAL_PLUGINS as REDTEAM_ADDITIONAL_PLUGINS,
} from '../redteam/constants';
import telemetry from '../telemetry';
import { synthesizeFromTestSuite } from '../testCases';
import { TestSuite, UnifiedConfig } from '../types';
import { printBorder, setupEnv } from '../util';

interface RedteamGenerateOptions {
  // Commander options
  addPlugins?: string[];
  cache: boolean;
  config?: string;
  envFile?: string;
  injectVar?: string;
  output?: string;
  plugins?: string[];
  provider?: string;
  purpose?: string;
  write: boolean;

  // Extras
  defaultConfig: Partial<UnifiedConfig>;
  defaultConfigPath: string | undefined;
}

export async function doGenerateRedteam({
  addPlugins,
  cache,
  config,
  envFile,
  injectVar,
  output,
  plugins,
  provider,
  purpose,
  write,
  defaultConfig,
  defaultConfigPath,
}: RedteamGenerateOptions) {
  setupEnv(envFile);
  if (!cache) {
    logger.info('Cache is disabled.');
    disableCache();
  }

  let testSuite: TestSuite;
  const configPath = config || defaultConfigPath;
  if (configPath) {
    const resolved = await resolveConfigs(
      {
        config: [configPath],
      },
      defaultConfig,
    );
    testSuite = resolved.testSuite;
  } else if (purpose) {
    // There is a purpose, so we can just have a dummy testsuite for standalone invocation
    testSuite = {
      prompts: [],
      providers: [],
      tests: [],
    };
  } else {
    logger.info(
      chalk.red(
        `\nCan't generate without configuration - run ${chalk.yellow.bold('promptfoo redteam init')} first`,
      ),
    );
    return;
  }

  const startTime = Date.now();
  telemetry.record('command_used', {
    name: 'generate redteam - started',
    numPrompts: testSuite.prompts.length,
    numTestsExisting: (testSuite.tests || []).length,
  });
  await telemetry.send();

  const redteamTests = await redteamSynthesizeFromTestSuite(testSuite, {
    purpose,
    injectVar,
    plugins:
      addPlugins && addPlugins.length > 0
        ? Array.from(plugins || REDTEAM_DEFAULT_PLUGINS).concat(addPlugins)
        : plugins,
    provider,
  });

  if (output) {
    const existingYaml = configPath
      ? (yaml.load(fs.readFileSync(configPath, 'utf8')) as Partial<UnifiedConfig>)
      : {};
    const updatedYaml = {
      ...existingYaml,
      tests: redteamTests,
      metadata: {
        ...existingYaml.metadata,
        redteam: true,
      },
    };
    fs.writeFileSync(output, yaml.dump(updatedYaml, { skipInvalid: true }));
    printBorder();
    logger.info(`Wrote ${redteamTests.length} new test cases to ${output}`);
    printBorder();
  } else if (write && configPath) {
    const existingConfig = yaml.load(fs.readFileSync(configPath, 'utf8')) as Partial<UnifiedConfig>;
    existingConfig.tests = [...(existingConfig.tests || []), ...redteamTests];
    fs.writeFileSync(configPath, yaml.dump(existingConfig));
    logger.info(`\nWrote ${redteamTests.length} new test cases to ${configPath}`);
    logger.info(
      '\n' + chalk.green(`Run ${chalk.bold('promptfoo eval')} to run the generated tests`),
    );
  } else {
    logger.info(yaml.dump(redteamTests, { skipInvalid: true }));
  }

  telemetry.record('command_used', {
    name: 'generate redteam',
    numPrompts: testSuite.prompts.length,
    numTestsExisting: (testSuite.tests || []).length,
    numTestsGenerated: redteamTests.length,
    duration: Math.round((Date.now() - startTime) / 1000),
  });
  await telemetry.send();
}

export function generateCommand(
  program: Command,
  defaultConfig: Partial<UnifiedConfig>,
  defaultConfigPath: string | undefined,
) {
  const generateCommand = program.command('generate').description('Generate synthetic data');

  generateCommand
    .command('dataset')
    .description('Generate test cases')
    .option(
      '-i, --instructions [instructions]',
      'Additional instructions to follow while generating test cases',
    )
    .option('-c, --config [path]', 'Path to configuration file. Defaults to promptfooconfig.yaml')
    .option('-o, --output [path]', 'Path to output file')
    .option('-w, --write', 'Write results to promptfoo configuration file')
    .option('--numPersonas <number>', 'Number of personas to generate', '5')
    .option('--numTestCasesPerPersona <number>', 'Number of test cases per persona', '3')
    .option('--no-cache', 'Do not read or write results to disk cache', false)
    .option('--env-file <path>', 'Path to .env file')
    .action(
      async (options: {
        config?: string;
        instructions?: string;
        output?: string;
        numPersonas: string;
        numTestCasesPerPersona: string;
        write: boolean;
        cache: boolean;
        envFile?: string;
      }) => {
        setupEnv(options.envFile);
        if (!options.cache) {
          logger.info('Cache is disabled.');
          disableCache();
        }

        let testSuite: TestSuite;
        const configPath = options.config || defaultConfigPath;
        if (configPath) {
          const resolved = await resolveConfigs(
            {
              config: [configPath],
            },
            defaultConfig,
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
          numPersonas: parseInt(options.numPersonas, 10),
          numTestCasesPerPersona: parseInt(options.numTestCasesPerPersona, 10),
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
          const existingConfig = yaml.load(
            fs.readFileSync(configPath, 'utf8'),
          ) as Partial<UnifiedConfig>;
          existingConfig.tests = [...(existingConfig.tests || []), ...configAddition.tests];
          fs.writeFileSync(configPath, yaml.dump(existingConfig));
          logger.info(`Wrote ${results.length} new test cases to ${configPath}`);
          logger.info(
            chalk.green(`Run ${chalk.bold('promptfoo eval')} to run the generated tests`),
          );
        } else {
          logger.info(
            `Copy the above test cases or run ${chalk.greenBright(
              'promptfoo generate dataset --write',
            )} to write directly to the config`,
          );
        }

        telemetry.record('command_used', {
          name: 'generate_dataset',
          numPrompts: testSuite.prompts.length,
          numTestsExisting: (testSuite.tests || []).length,
          numTestsGenerated: results.length,
          duration: Math.round((Date.now() - startTime) / 1000),
        });
        await telemetry.send();
      },
    );

  generateCommand
    .command('redteam')
    .description('Generate adversarial test cases')
    .option('-c, --config [path]', 'Path to configuration file. Defaults to promptfooconfig.yaml')
    .option('-o, --output [path]', 'Path to output file')
    .option('-w, --write', 'Write results to promptfoo configuration file')
    .option(
      '--purpose <purpose>',
      'Set the system purpose. If not set, the system purpose will be inferred from the config file',
    )
    .option(
      '--provider <provider>',
      `Provider to use for generating adversarial tests. Defaults to: ${REDTEAM_MODEL}`,
    )
    .option(
      '--injectVar <varname>',
      'Override the {{variable}} that represents user input in the prompt. Default value is inferred from your prompts',
    )
    .option(
      '--plugins <plugins>',
      dedent`Comma-separated list of plugins to use. Defaults to:
        \n- ${Array.from(REDTEAM_DEFAULT_PLUGINS).sort().join('\n- ')}\n\n
    `,
      (val) => val.split(',').map((x) => x.trim()),
    )
    .option(
      '--add-plugins <plugins>',
      dedent`Comma-separated list of plugins to run in addition to the default plugins:
        \n- ${REDTEAM_ADDITIONAL_PLUGINS.sort().join('\n- ')}\n\n
      `,
      (val) => val.split(',').map((x) => x.trim()),
    )
    .option('--no-cache', 'Do not read or write results to disk cache', false)
    .option('--env-file <path>', 'Path to .env file')
    .action((opts) => doGenerateRedteam({ ...opts, defaultConfig, defaultConfigPath }));
}
