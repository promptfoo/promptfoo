import chalk from 'chalk';
import { Command } from 'commander';
import dedent from 'dedent';
import * as fs from 'fs';
import yaml from 'js-yaml';
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
} from '../../redteam/constants';
import {
  RedteamConfig,
  RedteamGenerateOptions,
  RedteamGenerateOptionsSchema,
  redteamConfigSchema,
} from '../../redteam/types';
import telemetry from '../../telemetry';
import { TestSuite, UnifiedConfig } from '../../types';
import { printBorder, setupEnv } from '../../util';

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

  let plugins: { name: string; numTests: number }[] =
    redteamConfig?.plugins ||
    Array.from(REDTEAM_DEFAULT_PLUGINS).map((plugin) => ({
      name: plugin,
      numTests: options.numTests,
    }));

  // override plugins with command line options
  if (options.plugins) {
    plugins = options.plugins.map((plugin) => ({
      name: plugin.id,
      numTests: plugin.numTests || options.numTests,
    }));
  }
  if (options.addPlugins && options.addPlugins.length > 0) {
    plugins = [
      ...new Set([
        ...plugins,
        ...options.addPlugins.map((plugin) => ({
          name: plugin,
          numTests: options.numTests,
        })),
      ]),
    ];
  }
  invariant(plugins && Array.isArray(plugins) && plugins.length > 0, 'No plugins found');

  const redteamTests = await synthesize({
    purpose: redteamConfig?.purpose || options.purpose,
    injectVar: redteamConfig?.injectVar?.[0] || options.injectVar,
    plugins,
    provider: redteamConfig?.provider || options.provider,
    prompts: testSuite.prompts.map((prompt) => prompt.raw),
  });

  if (options.output) {
    const existingYaml = configPath
      ? (yaml.load(fs.readFileSync(configPath, 'utf8')) as Partial<UnifiedConfig>)
      : {};
    const updatedYaml: Partial<UnifiedConfig> = {
      ...existingYaml,
      tests: redteamTests,
      metadata: {
        ...existingYaml.metadata,
        redteam: true,
      },
    };
    fs.writeFileSync(options.output, yaml.dump(updatedYaml, { skipInvalid: true }));
    printBorder();
    logger.info(`Wrote ${redteamTests.length} new test cases to ${options.output}`);
    printBorder();
  } else if (options.write && configPath) {
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
  defaultConfig: Partial<UnifiedConfig>,
  defaultConfigPath: string | undefined,
) {
  program
    .command('redteam')
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
    .option('-n, --num-tests <number>', 'Number of test cases to generate per plugin', parseInt, 5)
    .option('--no-cache', 'Do not read or write results to disk cache', false)
    .option('--env-file <path>', 'Path to .env file')
    .action((opts: Partial<RedteamGenerateOptions>): void => {
      try {
        const plugins = redteamConfigSchema.safeParse({
          plugins: opts.plugins,
        }).data?.plugins;
        const validatedOpts = RedteamGenerateOptionsSchema.parse({
          ...opts,
          defaultConfig,
          defaultConfigPath,
        });
        doGenerateRedteam({
          ...validatedOpts,
          plugins,
        });
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
