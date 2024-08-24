import chalk from 'chalk';
import type { Command } from 'commander';
import dedent from 'dedent';
import * as fs from 'fs';
import yaml from 'js-yaml';
import path from 'path';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { disableCache } from '../../cache';
import { resolveConfigs } from '../../config';
import logger from '../../logger';
import { synthesize } from '../../redteam';
import {
  REDTEAM_MODEL,
  DEFAULT_PLUGINS as REDTEAM_DEFAULT_PLUGINS,
  ADDITIONAL_PLUGINS as REDTEAM_ADDITIONAL_PLUGINS,
  DEFAULT_STRATEGIES,
  ADDITIONAL_STRATEGIES,
} from '../../redteam/constants';
import telemetry from '../../telemetry';
import type { TestSuite, UnifiedConfig } from '../../types';
import type { RedteamStrategyObject, SynthesizeOptions } from '../../types/redteam';
import type { RedteamConfig, RedteamGenerateOptions } from '../../types/redteam';
import { printBorder, setupEnv } from '../../util';
import { writePromptfooConfig } from '../../util/config';
import { RedteamGenerateOptionsSchema, RedteamConfigSchema } from '../../validators/redteam';

export async function doGenerateRedteam(options: RedteamGenerateOptions) {
  setupEnv(options.envFile);
  if (!options.cache) {
    logger.info('Cache is disabled.');
    disableCache();
  }

  let testSuite: TestSuite;
  let redteamConfig: RedteamConfig | undefined;
  const configPath = options.config || options.defaultConfigPath;
  if (configPath) {
    const resolved = await resolveConfigs(
      {
        config: [configPath],
      },
      options.defaultConfig,
    );
    testSuite = resolved.testSuite;
    redteamConfig = resolved.config.redteam;
  } else if (options.purpose) {
    // There is a purpose, so we can just have a dummy test suite for standalone invocation
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

  if (!process.env.OPENAI_API_KEY && !redteamConfig?.provider) {
    logger.warn(
      dedent`\n${chalk.bold('Warning: OPENAI_API_KEY environment variable is not set.')}
      
      Please set this environment variable in order to generate tests.
      
      For more info on configuring custom providers, see the documentation: https://www.promptfoo.dev/docs/red-team/configuration/\n
      `,
    );
  }

  let plugins =
    redteamConfig?.plugins && redteamConfig.plugins.length > 0
      ? redteamConfig.plugins
      : Array.from(REDTEAM_DEFAULT_PLUGINS).map((plugin) => ({
          id: plugin,
          numTests: options.numTests ?? redteamConfig?.numTests,
        }));
  // override plugins with command line options
  if (Array.isArray(options.plugins) && options.plugins.length > 0) {
    plugins = options.plugins.map((plugin) => ({
      id: plugin.id,
      numTests: plugin.numTests || options.numTests || redteamConfig?.numTests,
      ...(plugin.config && { config: plugin.config }),
    }));
  }
  invariant(plugins && Array.isArray(plugins) && plugins.length > 0, 'No plugins found');

  let strategies: (string | { id: string })[] =
    redteamConfig?.strategies ?? DEFAULT_STRATEGIES.map((s) => ({ id: s }));
  if (options.strategies) {
    strategies = options.strategies;
  }
  const strategyObjs: RedteamStrategyObject[] = strategies.map((s) =>
    typeof s === 'string' ? { id: s } : s,
  );

  logger.debug(`plugins: ${plugins.map((p) => p.id).join(', ')}`);
  logger.debug(`strategies: ${strategyObjs.map((s) => s.id ?? s).join(', ')}`);

  const config = {
    injectVar: redteamConfig?.injectVar || options.injectVar,
    language: redteamConfig?.language || options.language,
    maxConcurrency: options.maxConcurrency,
    numTests: redteamConfig?.numTests ?? options.numTests,
    plugins,
    provider: redteamConfig?.provider || options.provider,
    purpose: redteamConfig?.purpose || options.purpose,
    strategies: strategyObjs,
  };
  const parsedConfig = RedteamConfigSchema.safeParse(config);
  if (!parsedConfig.success) {
    logger.error('Invalid redteam configuration:');
    logger.error(parsedConfig.error.toString());
    throw new Error('Invalid redteam configuration');
  }

  const {
    testCases: redteamTests,
    purpose,
    entities,
  } = await synthesize({
    ...parsedConfig.data,
    language: config.language,
    numTests: config.numTests,
    prompts: testSuite.prompts.map((prompt) => prompt.raw),
    maxConcurrency: config.maxConcurrency,
  } as SynthesizeOptions);

  const updatedRedteamConfig = {
    purpose,
    entities,
    strategies: strategyObjs || [],
    plugins: plugins || [],
  };

  if (options.output) {
    const existingYaml = configPath
      ? (yaml.load(fs.readFileSync(configPath, 'utf8')) as Partial<UnifiedConfig>)
      : {};
    const updatedYaml: Partial<UnifiedConfig> = {
      ...existingYaml,
      defaultTest: {
        ...(existingYaml.defaultTest || {}),
        metadata: {
          ...(existingYaml.defaultTest?.metadata || {}),
          purpose,
          entities,
        },
      },
      tests: redteamTests,
      redteam: { ...(existingYaml.redteam || {}), ...updatedRedteamConfig },
    };
    writePromptfooConfig(updatedYaml, options.output);
    printBorder();
    const relativeOutputPath = path.relative(process.cwd(), options.output);
    logger.info(`Wrote ${redteamTests.length} new test cases to ${relativeOutputPath}`);
    logger.info(
      '\n' +
        chalk.green(
          `Run ${chalk.bold(`promptfoo eval -c ${relativeOutputPath}`)} to run the red team!`,
        ),
    );
    printBorder();
  } else if (options.write && configPath) {
    const existingConfig = yaml.load(fs.readFileSync(configPath, 'utf8')) as Partial<UnifiedConfig>;
    existingConfig.defaultTest = {
      ...(existingConfig.defaultTest || {}),
      metadata: {
        ...(existingConfig.defaultTest?.metadata || {}),
        purpose,
        entities,
      },
    };
    existingConfig.tests = [...(existingConfig.tests || []), ...redteamTests];
    existingConfig.redteam = { ...(existingConfig.redteam || {}), ...updatedRedteamConfig };
    writePromptfooConfig(existingConfig, configPath);
    logger.info(
      `\nWrote ${redteamTests.length} new test cases to ${path.relative(process.cwd(), configPath)}`,
    );
    const command = configPath.endsWith('promptfooconfig.yaml')
      ? 'promptfoo eval'
      : `promptfoo eval -c ${path.relative(process.cwd(), configPath)}`;
    logger.info('\n' + chalk.green(`Run ${chalk.bold(`${command}`)} to run the red team!`));
  } else {
    writePromptfooConfig({ tests: redteamTests }, 'redteam.yaml');
  }

  telemetry.record('command_used', {
    duration: Math.round((Date.now() - startTime) / 1000),
    name: 'generate redteam',
    numPrompts: testSuite.prompts.length,
    numTestsExisting: (testSuite.tests || []).length,
    numTestsGenerated: redteamTests.length,
  });
  await telemetry.send();
}

export function generateRedteamCommand(
  program: Command,
  command: 'redteam' | 'generate',
  defaultConfig: Partial<UnifiedConfig>,
  defaultConfigPath: string | undefined,
) {
  program
    .command(command) // generate or redteam depending on if called from redteam or generate
    .description('Generate adversarial test cases')
    .option('-c, --config [path]', 'Path to configuration file. Defaults to promptfooconfig.yaml')
    .option('-o, --output [path]', 'Path to output file')
    .option('-w, --write', 'Write results to promptfoo configuration file', false)
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
      dedent`Comma-separated list of plugins to use. Use 'default' to include default plugins. 
      
        Defaults to:
        - default (includes: ${Array.from(REDTEAM_DEFAULT_PLUGINS).sort().join(', ')})

        Optional:
        - ${Array.from(REDTEAM_ADDITIONAL_PLUGINS).sort().join(', ')}
      `,
      (val) => val.split(',').map((x) => x.trim()),
    )
    .option(
      '--strategies <strategies>',
      dedent`Comma-separated list of strategies to use. Use 'default' to include default strategies. 
      
        Defaults to:
        - default (includes: ${Array.from(DEFAULT_STRATEGIES).sort().join(', ')})

        Optional:
        - ${Array.from(ADDITIONAL_STRATEGIES).sort().join(', ')}
      `,
      (val) => val.split(',').map((x) => x.trim()),
    )
    .option(
      '-n, --num-tests <number>',
      'Number of test cases to generate per plugin',
      (val) => (Number.isInteger(val) ? val : Number.parseInt(val, 10)),
      undefined,
    )
    .option(
      '--language <language>',
      'Specify the language for generated tests. Defaults to English',
    )
    .option('--no-cache', 'Do not read or write results to disk cache', false)
    .option('--env-file <path>', 'Path to .env file')
    .option(
      '-j, --max-concurrency <number>',
      'Maximum number of concurrent API calls',
      (val) => Number.parseInt(val, 10),
      defaultConfig.evaluateOptions?.maxConcurrency,
    )
    .action((opts: Partial<RedteamGenerateOptions>): void => {
      try {
        let overrides: Record<string, any> = {};
        if (opts.plugins && opts.plugins.length > 0) {
          const parsed = RedteamConfigSchema.safeParse({
            plugins: opts.plugins,
            strategies: opts.strategies,
            numTests: opts.numTests,
          });
          if (!parsed.success) {
            logger.error('Invalid options:');
            parsed.error.errors.forEach((err: z.ZodIssue) => {
              logger.error(`  ${err.path.join('.')}: ${err.message}`);
            });
            process.exit(1);
          }
          overrides = parsed.data;
        }
        if (!opts.write && !opts.output) {
          logger.info('No output file specified, writing to redteam.yaml in the current directory');
          opts.output = 'redteam.yaml';
        }
        const validatedOpts = RedteamGenerateOptionsSchema.parse({
          ...opts,
          defaultConfig,
          defaultConfigPath,
          ...(overrides.plugins ? { plugins: overrides.plugins } : {}),
          ...(overrides.strategies ? { strategies: overrides.strategies } : {}),
        });
        doGenerateRedteam(validatedOpts);
      } catch (error) {
        if (error instanceof z.ZodError) {
          logger.error('Invalid options:');
          error.errors.forEach((err: z.ZodIssue) => {
            logger.error(`  ${err.path.join('.')}: ${err.message}`);
          });
        } else {
          logger.error('An unexpected error occurred:', error);
        }
        process.exit(1);
      }
    });
}
