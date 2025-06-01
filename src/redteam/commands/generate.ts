import chalk from 'chalk';
import type { Command } from 'commander';
import { createHash } from 'crypto';
import dedent from 'dedent';
import * as fs from 'fs';
import yaml from 'js-yaml';
import path from 'path';
import { z } from 'zod';
import { fromError } from 'zod-validation-error';
import { synthesize } from '../';
import { disableCache } from '../../cache';
import cliState from '../../cliState';
import { VERSION } from '../../constants';
import { getEnvBool } from '../../envars';
import { getAuthor, getUserEmail } from '../../globalConfig/accounts';
import { cloudConfig } from '../../globalConfig/cloud';
import logger from '../../logger';
import { loadApiProviders } from '../../providers';
import telemetry from '../../telemetry';
import type { ApiProvider, TestSuite, UnifiedConfig } from '../../types';
import { isRunningUnderNpx, printBorder, setupEnv } from '../../util';
import { resolveConfigs } from '../../util/config/load';
import { writePromptfooConfig } from '../../util/config/manage';
import invariant from '../../util/invariant';
import { RedteamConfigSchema, RedteamGenerateOptionsSchema } from '../../validators/redteam';
import {
  ADDITIONAL_PLUGINS as REDTEAM_ADDITIONAL_PLUGINS,
  ADDITIONAL_STRATEGIES,
  DEFAULT_PLUGINS as REDTEAM_DEFAULT_PLUGINS,
  DEFAULT_STRATEGIES,
  REDTEAM_MODEL,
} from '../constants';
import { shouldGenerateRemote, neverGenerateRemote } from '../remoteGeneration';
import type {
  RedteamCliGenerateOptions,
  RedteamFileConfig,
  RedteamStrategyObject,
  SynthesizeOptions,
} from '../types';
import {
  type TargetPurposeDiscoveryResult,
  doTargetPurposeDiscovery,
  mergeTargetPurposeDiscoveryResults,
} from './discover';

function getConfigHash(configPath: string): string {
  const content = fs.readFileSync(configPath, 'utf8');
  return createHash('md5').update(`${VERSION}:${content}`).digest('hex');
}

function createHeaderComments({
  title,
  timestampLabel,
  author,
  cloudHost,
  testCasesCount,
  plugins,
  strategies,
  isUpdate = false,
}: {
  title: string;
  timestampLabel: string;
  author: string | null;
  cloudHost: string | null;
  testCasesCount: number;
  plugins: Array<{ id: string }>;
  strategies: Array<{ id: string }>;
  isUpdate?: boolean;
}): string[] {
  const sectionLabel = isUpdate ? 'Changes:' : 'Test Configuration:';
  const countLabel = isUpdate
    ? `Added ${testCasesCount} new test cases`
    : `Total cases: ${testCasesCount}`;

  return [
    `===================================================================`,
    title,
    `===================================================================`,
    `${timestampLabel} ${new Date().toISOString()}`,
    author ? `Author:    ${author}` : undefined,
    cloudHost ? `Cloud:     ${cloudHost}` : `Cloud:     Not logged in`,
    ``,
    sectionLabel,
    `  ${countLabel}`,
    `  Plugins:     ${plugins.map((p) => p.id).join(', ')}`,
    `  Strategies:  ${strategies.map((s) => s.id).join(', ')}`,
    `===================================================================`,
  ].filter(Boolean) as string[];
}

export async function doGenerateRedteam(
  options: Partial<RedteamCliGenerateOptions>,
): Promise<Partial<UnifiedConfig> | null> {
  setupEnv(options.envFile);
  if (!options.cache) {
    logger.info('Cache is disabled');
    disableCache();
  }

  let testSuite: TestSuite;
  let redteamConfig: RedteamFileConfig | undefined;
  const configPath = options.config || options.defaultConfigPath;
  const outputPath = options.output || 'redteam.yaml';

  // Check for updates to the config file and decide whether to generate
  let shouldGenerate = options.force;
  if (!options.force && fs.existsSync(outputPath) && configPath && fs.existsSync(configPath)) {
    // Skip hash check for .burp files since they're not YAML
    if (!outputPath.endsWith('.burp')) {
      const redteamContent = yaml.load(
        fs.readFileSync(outputPath, 'utf8'),
      ) as Partial<UnifiedConfig>;
      const storedHash = redteamContent.metadata?.configHash;
      const currentHash = getConfigHash(configPath);

      shouldGenerate = storedHash !== currentHash;
      if (!shouldGenerate) {
        logger.warn(
          'No changes detected in redteam configuration. Skipping generation (use --force to generate anyway)',
        );
        return redteamContent;
      }
    }
  } else {
    shouldGenerate = true;
  }

  let targetPurposeDiscoveryResult: TargetPurposeDiscoveryResult | undefined;
  if (configPath) {
    const resolved = await resolveConfigs(
      {
        config: [configPath],
      },
      options.defaultConfig || {},
    );
    testSuite = resolved.testSuite;
    redteamConfig = resolved.config.redteam;

    if (
      !getEnvBool('PROMPTFOO_DISABLE_REDTEAM_TARGET_DISCOVERY_AGENT', false) &&
      !neverGenerateRemote() &&
      resolved.config.providers &&
      Array.isArray(resolved.config.providers)
    ) {
      invariant(
        resolved.config.providers.length > 0,
        'At least one provider must be provided in the config file',
      );
      const providers = await loadApiProviders(resolved.config.providers);
      try {
        if (testSuite.prompts.length > 1) {
          logger.warn(
            'More than one prompt provided, only the first prompt will be used for purpose discovery',
          );
        }
        logger.info('Starting Target Discovery Agent');
        targetPurposeDiscoveryResult = await doTargetPurposeDiscovery(
          providers[0],
          testSuite.prompts[0],
        );
      } catch (error) {
        logger.error(
          `Target Discovery Agent failed from error, skipping: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
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
        `\nCan't generate without configuration - run ${chalk.yellow.bold(
          isRunningUnderNpx() ? 'npx promptfoo redteam init' : 'promptfoo redteam init',
        )} first`,
      ),
    );
    return null;
  }

  const mergedPurpose = mergeTargetPurposeDiscoveryResults(
    redteamConfig?.purpose ?? options.purpose,
    targetPurposeDiscoveryResult,
  );

  const startTime = Date.now();
  telemetry.record('command_used', {
    name: 'generate redteam - started',
    numPrompts: testSuite.prompts.length,
    numTestsExisting: (testSuite.tests || []).length,
    plugins: redteamConfig?.plugins?.map((p) => (typeof p === 'string' ? p : p.id)) || [],
    strategies: redteamConfig?.strategies?.map((s) => (typeof s === 'string' ? s : s.id)) || [],
  });
  await telemetry.send();

  let plugins;

  // If plugins are defined in the config file
  if (redteamConfig?.plugins && redteamConfig.plugins.length > 0) {
    plugins = redteamConfig.plugins.map((plugin) => {
      // Base configuration that all plugins will have
      const pluginConfig: {
        id: string;
        numTests: number | undefined;
        config?: Record<string, any>;
      } = {
        // Handle both string-style ('pluginName') and object-style ({ id: 'pluginName' }) plugins
        id: typeof plugin === 'string' ? plugin : plugin.id,
        // Use plugin-specific numTests if available, otherwise fall back to global settings
        numTests:
          (typeof plugin === 'object' && plugin.numTests) ||
          options.numTests ||
          redteamConfig?.numTests,
      };

      // If plugin has additional config options, include them
      if (typeof plugin === 'object' && plugin.config) {
        pluginConfig.config = plugin.config;
      }

      return pluginConfig;
    });
  } else {
    // If no plugins specified, use default plugins
    plugins = Array.from(REDTEAM_DEFAULT_PLUGINS).map((plugin) => ({
      id: plugin,
      numTests: options.numTests ?? redteamConfig?.numTests,
    }));
  }

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

  try {
    logger.debug(`plugins: ${plugins.map((p) => p.id).join(', ')}`);
    logger.debug(`strategies: ${strategyObjs.map((s) => s.id ?? s).join(', ')}`);
  } catch (error) {
    logger.error('Error logging plugins and strategies. One did not have a valid id.');
    logger.error(`Error details: ${error instanceof Error ? error.message : String(error)}`);
  }

  const config = {
    injectVar: redteamConfig?.injectVar || options.injectVar,
    language: redteamConfig?.language || options.language,
    maxConcurrency: options.maxConcurrency,
    numTests: redteamConfig?.numTests ?? options.numTests,
    entities: redteamConfig?.entities,
    plugins,
    provider: redteamConfig?.provider || options.provider,
    purpose: mergedPurpose,
    strategies: strategyObjs,
    delay: redteamConfig?.delay || options.delay,
    sharing: redteamConfig?.sharing || options.sharing,
    excludeTargetOutputFromAgenticAttackGeneration:
      redteamConfig?.excludeTargetOutputFromAgenticAttackGeneration,
  };
  const parsedConfig = RedteamConfigSchema.safeParse(config);
  if (!parsedConfig.success) {
    logger.error('Invalid redteam configuration:');
    logger.error(fromError(parsedConfig.error).toString());
    throw new Error('Invalid redteam configuration');
  }

  const targetLabels = testSuite.providers
    .map((provider: ApiProvider) => provider?.label)
    .filter(Boolean);

  const {
    testCases: redteamTests,
    purpose,
    entities,
    injectVar: finalInjectVar,
  } = await synthesize({
    ...parsedConfig.data,
    language: config.language,
    numTests: config.numTests,
    prompts: testSuite.prompts.map((prompt) => prompt.raw),
    maxConcurrency: config.maxConcurrency,
    delay: config.delay,
    abortSignal: options.abortSignal,
    targetLabels,
    showProgressBar: options.progressBar !== false,
  } as SynthesizeOptions);

  if (redteamTests.length === 0) {
    logger.warn('No test cases generated. Please check for errors and try again.');
    return null;
  }

  const updatedRedteamConfig = {
    purpose,
    entities,
    strategies: strategyObjs || [],
    plugins: plugins || [],
    sharing: config.sharing,
  };

  let ret: Partial<UnifiedConfig> | undefined;
  if (options.output && options.output.endsWith('.burp')) {
    // Write in Burp Intruder compatible format
    const outputLines = redteamTests
      .map((test) => {
        const value = String(test.vars?.[finalInjectVar] ?? '');
        if (options.burpEscapeJson) {
          return encodeURIComponent(JSON.stringify(value).slice(1, -1));
        }
        return encodeURIComponent(value);
      })
      .filter((line) => line.length > 0)
      .join('\n');
    fs.writeFileSync(options.output, outputLines);
    logger.info(
      chalk.green(`Wrote ${redteamTests.length} test cases to ${chalk.bold(options.output)}`),
    );
    // No need to return anything, Burp outputs are only invoked via command line.
    return {};
  } else if (options.output) {
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
      metadata: {
        ...(existingYaml.metadata || {}),
        ...(configPath && redteamTests.length > 0
          ? { configHash: getConfigHash(configPath) }
          : { configHash: 'force-regenerate' }),
        ...(targetPurposeDiscoveryResult ? { targetPurposeDiscoveryResult } : {}),
      },
    };
    const author = getAuthor();
    const userEmail = getUserEmail();
    const cloudHost = userEmail ? cloudConfig.getApiHost() : null;
    const headerComments = createHeaderComments({
      title: 'REDTEAM CONFIGURATION',
      timestampLabel: 'Generated:',
      author,
      cloudHost,
      testCasesCount: redteamTests.length,
      plugins,
      strategies: strategyObjs,
    });

    ret = writePromptfooConfig(updatedYaml, options.output, headerComments);
    printBorder();
    const relativeOutputPath = path.relative(process.cwd(), options.output);
    logger.info(`Wrote ${redteamTests.length} test cases to ${relativeOutputPath}`);
    if (!options.inRedteamRun) {
      // Provider cleanup step
      try {
        const provider = testSuite.providers[0] as ApiProvider;
        if (provider && typeof provider.cleanup === 'function') {
          const cleanupResult = provider.cleanup();
          if (cleanupResult instanceof Promise) {
            await cleanupResult;
          }
        }
      } catch (cleanupErr) {
        logger.warn(`Error during provider cleanup: ${cleanupErr}`);
      }

      const commandPrefix = isRunningUnderNpx() ? 'npx promptfoo' : 'promptfoo';
      logger.info(
        '\n' +
          chalk.green(
            `Run ${chalk.bold(
              relativeOutputPath === 'redteam.yaml'
                ? `${commandPrefix} redteam eval`
                : `${commandPrefix} redteam eval -c ${relativeOutputPath}`,
            )} to run the red team!`,
          ),
      );
    }
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
    // Add the result of target purpose discovery to metadata if available
    existingConfig.metadata = {
      ...(existingConfig.metadata || {}),
      configHash: getConfigHash(configPath),
      ...(targetPurposeDiscoveryResult ? { targetPurposeDiscoveryResult } : {}),
    };
    const author = getAuthor();
    const userEmail = getUserEmail();
    const cloudHost = userEmail ? cloudConfig.getApiHost() : null;
    const headerComments = createHeaderComments({
      title: 'REDTEAM CONFIGURATION UPDATE',
      timestampLabel: 'Updated:',
      author,
      cloudHost,
      testCasesCount: redteamTests.length,
      plugins,
      strategies: strategyObjs,
      isUpdate: true,
    });

    ret = writePromptfooConfig(existingConfig, configPath, headerComments);
    logger.info(
      `\nWrote ${redteamTests.length} new test cases to ${path.relative(process.cwd(), configPath)}`,
    );
    const commandPrefix = isRunningUnderNpx() ? 'npx promptfoo' : 'promptfoo';
    const command = configPath.endsWith('promptfooconfig.yaml')
      ? `${commandPrefix} eval`
      : `${commandPrefix} eval -c ${path.relative(process.cwd(), configPath)}`;
    logger.info('\n' + chalk.green(`Run ${chalk.bold(`${command}`)} to run the red team!`));
  } else {
    const author = getAuthor();
    const userEmail = getUserEmail();
    const cloudHost = userEmail ? cloudConfig.getApiHost() : null;
    const headerComments = createHeaderComments({
      title: 'REDTEAM CONFIGURATION',
      timestampLabel: 'Generated:',
      author,
      cloudHost,
      testCasesCount: redteamTests.length,
      plugins,
      strategies: strategyObjs,
    });

    ret = writePromptfooConfig({ tests: redteamTests }, 'redteam.yaml', headerComments);
  }

  telemetry.record('command_used', {
    duration: Math.round((Date.now() - startTime) / 1000),
    name: 'generate redteam',
    numPrompts: testSuite.prompts.length,
    numTestsExisting: (testSuite.tests || []).length,
    numTestsGenerated: redteamTests.length,
    plugins: plugins.map((p) => p.id),
    strategies: strategies.map((s) => (typeof s === 'string' ? s : s.id)),
  });
  await telemetry.send();
  return ret;
}

export function redteamGenerateCommand(
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
    .option(
      '-j, --max-concurrency <number>',
      'Maximum number of concurrent API calls',
      (val) => Number.parseInt(val, 10),
      defaultConfig.evaluateOptions?.maxConcurrency || 5,
    )
    .option('--delay <number>', 'Delay in milliseconds between plugin API calls', (val) =>
      Number.parseInt(val, 10),
    )
    .option('--remote', 'Force remote inference wherever possible', false)
    .option('--force', 'Force generation even if no changes are detected', false)
    .option('--no-progress-bar', 'Do not show progress bar')
    .option('--burp-escape-json', 'Escape quotes in Burp payloads', false)
    .action((opts: Partial<RedteamCliGenerateOptions>): void => {
      if (opts.remote) {
        cliState.remote = true;
      }
      if (shouldGenerateRemote()) {
        logger.debug('Remote generation enabled');
      } else {
        logger.debug('Remote generation disabled');
      }

      try {
        let overrides: Partial<RedteamFileConfig> = {};
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
          ...overrides,
          defaultConfig,
          defaultConfigPath,
        });
        doGenerateRedteam(validatedOpts);
      } catch (error) {
        if (error instanceof z.ZodError) {
          logger.error('Invalid options:');
          error.errors.forEach((err: z.ZodIssue) => {
            logger.error(`  ${err.path.join('.')}: ${err.message}`);
          });
        } else {
          logger.error(
            `An unexpected error occurred during generation: ${error instanceof Error ? error.message : String(error)}\n${
              error instanceof Error ? error.stack : ''
            }`,
          );
        }
        process.exit(1);
      }
    });
}
