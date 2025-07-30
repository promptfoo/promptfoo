import { createHash } from 'crypto';
import * as fs from 'fs';
import path from 'path';

import chalk from 'chalk';
import dedent from 'dedent';
import yaml from 'js-yaml';
import { z } from 'zod';
import { fromError } from 'zod-validation-error';
import { disableCache } from '../../cache';
import cliState from '../../cliState';
import { VERSION } from '../../constants';
import { getAuthor, getUserEmail } from '../../globalConfig/accounts';
import { cloudConfig } from '../../globalConfig/cloud';
import logger from '../../logger';
import { getProviderIds } from '../../providers';
import { isPromptfooSampleTarget } from '../../providers/shared';
import telemetry from '../../telemetry';
import { isRunningUnderNpx, printBorder, setupEnv } from '../../util';
import {
  getCloudDatabaseId,
  getPluginSeverityOverridesFromCloud,
  isCloudProvider,
} from '../../util/cloud';
import { resolveConfigs } from '../../util/config/load';
import { writePromptfooConfig } from '../../util/config/manage';
import invariant from '../../util/invariant';
import { RedteamConfigSchema, RedteamGenerateOptionsSchema } from '../../validators/redteam';
import { synthesize } from '../';
import {
  ADDITIONAL_STRATEGIES,
  DEFAULT_STRATEGIES,
  type Plugin,
  ADDITIONAL_PLUGINS as REDTEAM_ADDITIONAL_PLUGINS,
  DEFAULT_PLUGINS as REDTEAM_DEFAULT_PLUGINS,
  REDTEAM_MODEL,
  type Severity,
} from '../constants';
import { extractMcpToolsInfo } from '../extraction/mcpTools';
import { shouldGenerateRemote } from '../remoteGeneration';
import type { Command } from 'commander';

import type { ApiProvider, TestSuite, UnifiedConfig } from '../../types';
import type {
  RedteamCliGenerateOptions,
  RedteamFileConfig,
  RedteamStrategyObject,
  SynthesizeOptions,
} from '../types';

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

  let pluginSeverityOverrides: Map<Plugin, Severity> = new Map();
  let pluginSeverityOverridesId: string | undefined;

  if (configPath) {
    const resolved = await resolveConfigs(
      {
        config: [configPath],
      },
      options.defaultConfig || {},
    );
    testSuite = resolved.testSuite;
    redteamConfig = resolved.config.redteam;

    try {
      // If the provider is a cloud provider, check for plugin severity overrides:
      const providerId = getProviderIds(resolved.config.providers!)[0];
      if (isCloudProvider(providerId)) {
        const cloudId = getCloudDatabaseId(providerId);
        const overrides = await getPluginSeverityOverridesFromCloud(cloudId);
        if (overrides) {
          pluginSeverityOverrides = new Map(
            Object.entries(overrides.severities) as [Plugin, Severity][],
          );
          pluginSeverityOverridesId = overrides.id;
        }
      }
    } catch (error) {
      logger.error(
        `Plugin severity override check failed: ${error instanceof Error ? error.message : String(error)}`,
      );
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

  const startTime = Date.now();
  telemetry.record('command_used', {
    name: 'generate redteam - started',
    numPrompts: testSuite.prompts.length,
    numTestsExisting: (testSuite.tests || []).length,
    plugins: redteamConfig?.plugins?.map((p) => (typeof p === 'string' ? p : p.id)) || [],
    strategies: redteamConfig?.strategies?.map((s) => (typeof s === 'string' ? s : s.id)) || [],
    isPromptfooSampleTarget: testSuite.providers.some(isPromptfooSampleTarget),
  });

  let plugins;

  // If plugins are defined in the config file
  if (redteamConfig?.plugins && redteamConfig.plugins.length > 0) {
    plugins = redteamConfig.plugins.map((plugin) => {
      // Base configuration that all plugins will have
      const pluginConfig: {
        id: string;
        numTests: number | undefined;
        config?: Record<string, any>;
        severity?: Severity;
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
      if (typeof plugin === 'object') {
        if (plugin.config) {
          pluginConfig.config = plugin.config;
        }
        if (plugin.severity) {
          pluginConfig.severity = plugin.severity;
        }
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
    plugins = options.plugins.map((plugin) => {
      const pluginConfig = {
        id: plugin.id,
        numTests: plugin.numTests || options.numTests || redteamConfig?.numTests,
        ...(plugin.config && { config: plugin.config }),
      };
      return pluginConfig;
    });
  }
  invariant(plugins && Array.isArray(plugins) && plugins.length > 0, 'No plugins found');

  // Apply plugin severity overrides
  if (pluginSeverityOverrides.size > 0) {
    let intersectionCount = 0;
    plugins = plugins.map((plugin) => {
      if (pluginSeverityOverrides.has(plugin.id as Plugin)) {
        intersectionCount++;
        return {
          ...plugin,
          severity: pluginSeverityOverrides.get(plugin.id as Plugin),
        };
      }
      return plugin;
    });

    logger.info(`Applied ${intersectionCount} custom plugin severity levels`);
  }

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
    purpose: redteamConfig?.purpose ?? options.purpose,
    strategies: strategyObjs,
    delay: redteamConfig?.delay || options.delay,
    sharing: redteamConfig?.sharing || options.sharing,
    excludeTargetOutputFromAgenticAttackGeneration:
      redteamConfig?.excludeTargetOutputFromAgenticAttackGeneration,
    ...(redteamConfig?.testGenerationInstructions
      ? { testGenerationInstructions: redteamConfig.testGenerationInstructions }
      : {}),
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

  // Extract MCP tools information and add to purpose
  let enhancedPurpose = parsedConfig.data.purpose || '';
  let augmentedTestGenerationInstructions = config.testGenerationInstructions ?? '';
  try {
    const mcpToolsInfo = await extractMcpToolsInfo(testSuite.providers);
    if (mcpToolsInfo) {
      enhancedPurpose = enhancedPurpose
        ? `${enhancedPurpose}\n\n${mcpToolsInfo}\n\n`
        : mcpToolsInfo;
      logger.info('Added MCP tools information to red team purpose');
      augmentedTestGenerationInstructions += `\nGenerate every test case prompt as a json string encoding the tool call and parameters, and choose a specific function to call. The specific format should be: {"tool": "function_name", "args": {...}}.`;
    }
  } catch (error) {
    logger.warn(
      `Failed to extract MCP tools information: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const {
    testCases: redteamTests,
    purpose,
    entities,
    injectVar: finalInjectVar,
  } = await synthesize({
    ...parsedConfig.data,
    purpose: enhancedPurpose,
    language: config.language,
    numTests: config.numTests,
    prompts: testSuite.prompts.map((prompt) => prompt.raw),
    maxConcurrency: config.maxConcurrency,
    delay: config.delay,
    abortSignal: options.abortSignal,
    targetLabels,
    showProgressBar: options.progressBar !== false,
    testGenerationInstructions: augmentedTestGenerationInstructions,
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
    const existingDefaultTest =
      typeof existingYaml.defaultTest === 'object' ? existingYaml.defaultTest : {};
    const updatedYaml: Partial<UnifiedConfig> = {
      ...existingYaml,
      defaultTest: {
        ...existingDefaultTest,
        metadata: {
          ...(existingDefaultTest?.metadata || {}),
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
        ...(pluginSeverityOverridesId ? { pluginSeverityOverridesId } : {}),
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

    // Provider cleanup step. Note that this should always be run,
    // since the providers are re-initialized when running the red team,
    // hence it's safe and necessary to clean-up, particularly for MCP servers
    try {
      logger.debug('Cleaning up provider');
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

    if (!options.inRedteamRun) {
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
    const existingTests = existingConfig.tests;
    let testsArray: any[] = [];
    if (Array.isArray(existingTests)) {
      testsArray = existingTests;
    } else if (existingTests) {
      testsArray = [existingTests];
    }
    const existingConfigDefaultTest =
      typeof existingConfig.defaultTest === 'object' ? existingConfig.defaultTest : {};
    existingConfig.defaultTest = {
      ...existingConfigDefaultTest,
      metadata: {
        ...(existingConfigDefaultTest?.metadata || {}),
        purpose,
        entities,
      },
    };
    existingConfig.tests = [...testsArray, ...redteamTests];
    existingConfig.redteam = { ...(existingConfig.redteam || {}), ...updatedRedteamConfig };
    // Add the config hash to metadata
    existingConfig.metadata = {
      ...(existingConfig.metadata || {}),
      configHash: getConfigHash(configPath),
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
    isPromptfooSampleTarget: testSuite.providers.some(isPromptfooSampleTarget),
  });

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
