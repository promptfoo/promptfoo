import { createHash } from 'crypto';
import * as fs from 'fs';
import path from 'path';

import chalk from 'chalk';
import dedent from 'dedent';
import yaml from 'js-yaml';
import { z } from 'zod';
import { disableCache } from '../../cache';
import cliState from '../../cliState';
import { CLOUD_PROVIDER_PREFIX, DEFAULT_MAX_CONCURRENCY, VERSION } from '../../constants';
import {
  checkEmailStatusAndMaybeExit,
  getAuthor,
  getUserEmail,
  promptForEmailUnverified,
} from '../../globalConfig/accounts';
import { cloudConfig } from '../../globalConfig/cloud';
import logger from '../../logger';
import { getProviderIds } from '../../providers/index';
import { isPromptfooSampleTarget } from '../../providers/shared';
import telemetry from '../../telemetry';
import { EMAIL_OK_STATUS } from '../../types/email';
import {
  checkCloudPermissions,
  getCloudDatabaseId,
  getConfigFromCloud,
  getPluginSeverityOverridesFromCloud,
  isCloudProvider,
  resolveTeamId,
} from '../../util/cloud';
import { resolveConfigs } from '../../util/config/load';
import { writePromptfooConfig } from '../../util/config/writer';
import { getCustomPolicies } from '../../util/generation';
import { printBorder, setupEnv } from '../../util/index';
import invariant from '../../util/invariant';
import { promptfooCommand } from '../../util/promptfooCommand';
import { isUuid } from '../../util/uuid';
import { RedteamConfigSchema, RedteamGenerateOptionsSchema } from '../../validators/redteam';
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
import { synthesize } from '../index';
import { determinePolicyTypeFromId, isValidPolicyObject } from '../plugins/policy/utils';
import { neverGenerateRemote, shouldGenerateRemote } from '../remoteGeneration';
import { PartialGenerationError } from '../types';
import type { Command } from 'commander';

import type { ApiProvider, TestSuite, UnifiedConfig } from '../../types/index';
import type {
  FailedPluginInfo,
  PolicyObject,
  RedteamCliGenerateOptions,
  RedteamFileConfig,
  RedteamPluginObject,
  RedteamStrategyObject,
  SynthesizeOptions,
} from '../types';

/**
 * Handles failed plugins based on strict mode.
 * In strict mode, throws PartialGenerationError.
 * In non-strict mode (default), logs a warning and returns false to continue.
 * @returns true if we should stop (error thrown), false to continue
 */
function handleFailedPlugins(failedPlugins: FailedPluginInfo[], strict: boolean): void {
  if (failedPlugins.length === 0) {
    return;
  }

  const pluginList = failedPlugins.map((p) => `  - ${p.pluginId} (0/${p.requested} tests)`);
  const warningMessage = dedent`
    ${chalk.yellow('⚠️  Warning:')} Test case generation failed for ${failedPlugins.length} plugin(s):
    ${pluginList.join('\n')}

    ${chalk.dim('Possible causes:')}
      - API rate limiting or connectivity issues
      - Invalid plugin configuration
      - Provider errors during generation

    ${chalk.dim('To troubleshoot:')}
      - Run with --verbose flag to see detailed error messages
      - Check API keys and provider configuration
      - Retry the scan after resolving any reported errors
  `;

  if (strict) {
    // In strict mode, throw to stop the scan
    throw new PartialGenerationError(failedPlugins);
  }

  // In non-strict mode (default), log warning and continue
  logger.warn(warningMessage);
  logger.warn(
    chalk.yellow(
      `Continuing with partial results. Use ${chalk.bold('--strict')} flag to fail on plugin generation errors.`,
    ),
  );
}

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

/**
 * Writes a cloud config to a temporary file and returns the file path.
 */
function writeCloudConfigToTempFile(configFromCloud: Record<string, any>): string {
  const filename = `redteam-generate-${Date.now()}.yaml`;
  const tmpFile = path.join('', filename);
  fs.mkdirSync(path.dirname(tmpFile), { recursive: true });
  fs.writeFileSync(tmpFile, yaml.dump(configFromCloud));
  logger.debug(`Using Promptfoo Cloud-originated config at ${tmpFile}`);
  return tmpFile;
}

/**
 * Checks if generation should proceed by comparing config hashes.
 * Returns the existing config if unchanged, or null to indicate generation should proceed.
 */
function checkShouldGenerate(
  options: Partial<RedteamCliGenerateOptions>,
  configPath: string | undefined,
  outputPath: string,
): { skip: true; content: Partial<UnifiedConfig> } | { skip: false } {
  if (options.force || options.configFromCloud) {
    return { skip: false };
  }
  if (!fs.existsSync(outputPath) || !configPath || !fs.existsSync(configPath)) {
    return { skip: false };
  }
  if (outputPath.endsWith('.burp')) {
    return { skip: false };
  }
  const redteamContent = yaml.load(fs.readFileSync(outputPath, 'utf8')) as Partial<UnifiedConfig>;
  const storedHash = redteamContent.metadata?.configHash;
  const currentHash = getConfigHash(configPath);
  if (storedHash === currentHash) {
    logger.warn(
      'No changes detected in redteam configuration. Skipping generation (use --force to generate anyway)',
    );
    return { skip: true, content: redteamContent };
  }
  return { skip: false };
}

/**
 * Resolves configuration from a config path file.
 * Returns the resolved test suite, redteam config, and plugin severity overrides.
 */
async function resolveConfigFromPath(
  configPath: string,
  options: Partial<RedteamCliGenerateOptions>,
): Promise<{
  testSuite: TestSuite;
  redteamConfig: RedteamFileConfig | undefined;
  commandLineOptions: Record<string, any> | undefined;
  resolvedConfig: Partial<UnifiedConfig>;
  pluginSeverityOverrides: Map<Plugin, Severity>;
  pluginSeverityOverridesId: string | undefined;
}> {
  const resolved = await resolveConfigs({ config: [configPath] }, options.defaultConfig || {});
  const { testSuite, config: resolvedConfig, commandLineOptions } = resolved;
  const redteamConfig = resolvedConfig.redteam;

  await checkCloudPermissions(resolvedConfig);

  if (redteamConfig && testSuite.tests && testSuite.tests.length > 0) {
    logger.warn(
      chalk.yellow(
        dedent`
          ⚠️  Warning: Found both 'tests' section and 'redteam' configuration in your config file.

          The 'tests' section is ignored when generating red team tests. Red team automatically
          generates its own test cases based on the plugins and strategies you've configured.

          If you want to use custom test variables with red team, consider:
          1. Using the \`defaultTest\` key to set your vars
          2. Using environment variables with {{env.VAR_NAME}} syntax
          3. Using a transformRequest function in your target config
          4. Using multiple target configurations
        `,
      ),
    );
  }

  let pluginSeverityOverrides: Map<Plugin, Severity> = new Map();
  let pluginSeverityOverridesId: string | undefined;

  try {
    const providerId = getProviderIds(resolvedConfig.providers!)[0];
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

  return {
    testSuite,
    redteamConfig,
    commandLineOptions,
    resolvedConfig,
    pluginSeverityOverrides,
    pluginSeverityOverridesId,
  };
}

/**
 * Resolves the plugins from config and/or command-line options.
 */
function resolvePlugins(
  options: Partial<RedteamCliGenerateOptions>,
  redteamConfig: RedteamFileConfig | undefined,
): RedteamPluginObject[] {
  // Override with command-line options if provided
  if (Array.isArray(options.plugins) && options.plugins.length > 0) {
    return options.plugins.map((plugin) => ({
      id: plugin.id,
      numTests: plugin.numTests || options.numTests || redteamConfig?.numTests,
      ...(plugin.config && { config: plugin.config }),
    }));
  }

  // Use plugins from config if defined
  if (redteamConfig?.plugins && redteamConfig.plugins.length > 0) {
    return redteamConfig.plugins.map((plugin) => {
      const pluginConfig: {
        id: string;
        numTests: number | undefined;
        config?: Record<string, any>;
        severity?: Severity;
      } = {
        id: typeof plugin === 'string' ? plugin : plugin.id,
        numTests:
          (typeof plugin === 'object' && plugin.numTests) ||
          options.numTests ||
          redteamConfig?.numTests,
      };
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
  }

  // Default plugins
  return Array.from(REDTEAM_DEFAULT_PLUGINS).map((plugin) => ({
    id: plugin,
    numTests: options.numTests ?? redteamConfig?.numTests,
  }));
}

/**
 * Applies plugin severity overrides to the plugin list.
 */
function applyPluginSeverityOverrides(
  plugins: RedteamPluginObject[],
  pluginSeverityOverrides: Map<Plugin, Severity>,
): RedteamPluginObject[] {
  if (pluginSeverityOverrides.size === 0) {
    return plugins;
  }
  let intersectionCount = 0;
  const result = plugins.map((plugin) => {
    if (pluginSeverityOverrides.has(plugin.id as Plugin)) {
      intersectionCount++;
      return { ...plugin, severity: pluginSeverityOverrides.get(plugin.id as Plugin) };
    }
    return plugin;
  });
  logger.info(`Applied ${intersectionCount} custom plugin severity levels`);
  return result;
}

/**
 * Resolves reusable policy references by fetching their texts from cloud.
 */
async function resolveCloudPolicyRefs(plugins: RedteamPluginObject[]): Promise<void> {
  const policyPluginsWithRefs = plugins.filter(
    (plugin) =>
      plugin.config?.policy &&
      isValidPolicyObject(plugin.config?.policy) &&
      determinePolicyTypeFromId(plugin.config.policy.id) === 'reusable',
  );
  if (policyPluginsWithRefs.length === 0) {
    return;
  }

  const teamId = (await resolveTeamId()).id;
  const policiesById = await getCustomPolicies(policyPluginsWithRefs, teamId);

  for (const policyPlugin of policyPluginsWithRefs) {
    const policyId = (policyPlugin.config!.policy! as PolicyObject).id;
    const policyData = policiesById.get(policyId);
    if (policyData) {
      policyPlugin.config!.policy = {
        id: policyId,
        name: policyData.name,
        text: policyData.text,
      } as PolicyObject;
      if (policyPlugin.severity == null) {
        policyPlugin.severity = policyData.severity;
      }
    }
  }
}

/**
 * Extracts target IDs from resolved config providers.
 */
function extractTargetIds(resolvedConfig: Partial<UnifiedConfig> | undefined): string[] {
  if (!Array.isArray(resolvedConfig?.providers)) {
    return [];
  }
  return resolvedConfig.providers
    .filter((target) => typeof target !== 'function')
    .map((target) => {
      if (typeof target === 'string') {
        return target;
      }
      const providerObj = target as { id?: string };
      return providerObj.id;
    })
    .filter((id): id is string => typeof id === 'string');
}

/**
 * Enhances purpose and test generation instructions with MCP tool info.
 */
async function enhanceWithMcpTools(
  providers: TestSuite['providers'],
  basePurpose: string,
  baseInstructions: string,
): Promise<{ enhancedPurpose: string; augmentedTestGenerationInstructions: string }> {
  let enhancedPurpose = basePurpose;
  let augmentedTestGenerationInstructions = baseInstructions;
  try {
    const mcpToolsInfo = await extractMcpToolsInfo(providers);
    if (mcpToolsInfo) {
      enhancedPurpose = enhancedPurpose
        ? `${enhancedPurpose}\n\n${mcpToolsInfo}\n\n`
        : mcpToolsInfo;
      logger.info('Added MCP tools information to red team purpose');
      augmentedTestGenerationInstructions +=
        `\nGenerate every test case prompt as a json string encoding the tool call and parameters, ` +
        `and choose a specific function to call. The specific format should be: {"tool": "function_name", "args": {...}}.`;
    }
  } catch (error) {
    logger.warn(
      `Failed to extract MCP tools information: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return { enhancedPurpose, augmentedTestGenerationInstructions };
}

/**
 * Generates tests across multiple contexts.
 */
async function generateTestsForContexts(
  contexts: NonNullable<RedteamFileConfig['contexts']>,
  parsedConfig: any,
  targetInputs: any,
  config: any,
  options: Partial<RedteamCliGenerateOptions>,
  targetIds: string[],
  enhancedPurpose: string,
  augmentedTestGenerationInstructions: string,
): Promise<{
  redteamTests: any[];
  purpose: string;
  entities: string[];
  finalInjectVar: string;
  failedPlugins: { pluginId: string; requested: number }[];
}> {
  logger.info(`Generating tests for ${contexts.length} contexts...`);
  const allFailedPlugins: { pluginId: string; requested: number }[] = [];
  let redteamTests: any[] = [];
  let entities: string[] = [];
  let finalInjectVar = '';

  for (const context of contexts) {
    logger.info(`  Generating tests for context: ${context.id}`);
    const contextPurpose = context.purpose + (enhancedPurpose ? `\n\n${enhancedPurpose}` : '');

    const contextResult = await synthesize({
      ...parsedConfig.data,
      inputs: targetInputs,
      purpose: contextPurpose,
      numTests: config.numTests,
      prompts: config.prompts,
      maxConcurrency: config.maxConcurrency,
      delay: config.delay,
      abortSignal: options.abortSignal,
      targetIds,
      showProgressBar: options.progressBar !== false,
      testGenerationInstructions: augmentedTestGenerationInstructions,
    } as SynthesizeOptions);

    if (contextResult.failedPlugins.length > 0) {
      allFailedPlugins.push(...contextResult.failedPlugins);
    }

    const taggedTests = contextResult.testCases.map((test: any) => ({
      ...test,
      vars: { ...test.vars, ...(context.vars || {}) },
      metadata: {
        ...test.metadata,
        purpose: context.purpose,
        contextId: context.id,
        contextVars: context.vars,
      },
    }));

    redteamTests = redteamTests.concat(taggedTests);
    if (!entities.length) {
      entities = contextResult.entities;
    }
    if (!finalInjectVar) {
      finalInjectVar = contextResult.injectVar;
    }
  }

  logger.info(
    `Generated ${redteamTests.length} total test cases across ${contexts.length} contexts`,
  );
  return {
    redteamTests,
    purpose: contexts[0].purpose,
    entities,
    finalInjectVar,
    failedPlugins: allFailedPlugins,
  };
}

/**
 * Writes output in Burp Intruder format.
 */
function writeBurpOutput(
  outputPath: string,
  redteamTests: any[],
  finalInjectVar: string,
  burpEscapeJson: boolean | undefined,
): Partial<UnifiedConfig> {
  const outputLines = redteamTests
    .map((test) => {
      const value = String(test.vars?.[finalInjectVar] ?? '');
      if (burpEscapeJson) {
        return encodeURIComponent(JSON.stringify(value).slice(1, -1));
      }
      return encodeURIComponent(value);
    })
    .filter((line) => line.length > 0)
    .join('\n');
  fs.writeFileSync(outputPath, outputLines);
  logger.info(chalk.green(`Wrote ${redteamTests.length} test cases to ${chalk.bold(outputPath)}`));
  return {};
}

/**
 * Writes output to a specified output path (non-Burp, non-write mode).
 */
function writeOutputFile(
  options: Partial<RedteamCliGenerateOptions>,
  configPath: string | undefined,
  redteamTests: any[],
  purpose: string,
  entities: string[],
  updatedRedteamConfig: any,
  plugins: RedteamPluginObject[],
  strategyObjs: RedteamStrategyObject[],
  pluginSeverityOverridesId: string | undefined,
): Partial<UnifiedConfig> {
  const existingYaml = configPath
    ? (yaml.load(fs.readFileSync(configPath, 'utf8')) as Partial<UnifiedConfig>)
    : {};
  const existingDefaultTest =
    typeof existingYaml.defaultTest === 'object' ? existingYaml.defaultTest : {};
  const updatedYaml: Partial<UnifiedConfig> = {
    ...existingYaml,
    ...(options.description ? { description: options.description } : {}),
    defaultTest: {
      ...existingDefaultTest,
      metadata: { ...(existingDefaultTest?.metadata || {}), purpose, entities },
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

  const ret = writePromptfooConfig(updatedYaml, options.output!, headerComments);
  printBorder();
  const relativeOutputPath = path.relative(process.cwd(), options.output!);
  logger.info(`Wrote ${redteamTests.length} test cases to ${relativeOutputPath}`);

  if (!options.inRedteamRun) {
    logger.info(
      '\n' +
        chalk.green(
          `Run ${chalk.bold(
            relativeOutputPath === 'redteam.yaml'
              ? promptfooCommand('redteam eval')
              : promptfooCommand(`redteam eval -c ${relativeOutputPath}`),
          )} to run the red team!`,
        ),
    );
  }
  printBorder();
  return ret;
}

/**
 * Writes output by appending to the config file (--write mode).
 */
function writeToConfigFile(
  configPath: string,
  options: Partial<RedteamCliGenerateOptions>,
  redteamTests: any[],
  purpose: string,
  entities: string[],
  updatedRedteamConfig: any,
  plugins: RedteamPluginObject[],
  strategyObjs: RedteamStrategyObject[],
): Partial<UnifiedConfig> {
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
    metadata: { ...(existingConfigDefaultTest?.metadata || {}), purpose, entities },
  };
  if (options.description) {
    existingConfig.description = options.description;
  }
  existingConfig.tests = [...testsArray, ...redteamTests];
  existingConfig.redteam = { ...(existingConfig.redteam || {}), ...updatedRedteamConfig };
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

  const ret = writePromptfooConfig(existingConfig, configPath, headerComments);
  logger.info(
    `\nWrote ${redteamTests.length} new test cases to ${path.relative(process.cwd(), configPath)}`,
  );
  const command = configPath.endsWith('promptfooconfig.yaml')
    ? promptfooCommand('eval')
    : promptfooCommand(`eval -c ${path.relative(process.cwd(), configPath)}`);
  logger.info('\n' + chalk.green(`Run ${chalk.bold(`${command}`)} to run the red team!`));
  return ret;
}

/**
 * Writes output to the default redteam.yaml (fallback mode).
 */
function writeDefaultOutput(
  options: Partial<RedteamCliGenerateOptions>,
  redteamTests: any[],
  plugins: RedteamPluginObject[],
  strategyObjs: RedteamStrategyObject[],
): Partial<UnifiedConfig> {
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
  return writePromptfooConfig(
    {
      ...(options.description ? { description: options.description } : {}),
      tests: redteamTests,
    },
    'redteam.yaml',
    headerComments,
  );
}

/**
 * Cleans up the test suite provider.
 */
async function cleanupTestSuiteProvider(testSuite: TestSuite): Promise<void> {
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
}

export async function doGenerateRedteam(
  options: Partial<RedteamCliGenerateOptions>,
): Promise<Partial<UnifiedConfig> | null> {
  setupEnv(options.envFile);
  if (!options.cache) {
    logger.info('Cache is disabled');
    disableCache();
  }

  let configPath = options.config || options.defaultConfigPath;
  const outputPath = options.output || 'redteam.yaml';

  if (options.configFromCloud) {
    configPath = writeCloudConfigToTempFile(options.configFromCloud as Record<string, any>);
  }

  const generateCheck = checkShouldGenerate(options, configPath, outputPath);
  if (generateCheck.skip) {
    return generateCheck.content;
  }

  const initialized = await initTestSuite(options, configPath);
  if (!initialized) {
    return null;
  }

  const {
    testSuite,
    redteamConfig,
    commandLineOptions,
    resolvedConfig,
    pluginSeverityOverrides,
    pluginSeverityOverridesId,
  } = initialized;

  await validateEmailForRemoteGen();

  const startTime = Date.now();
  const telemetryPlugins =
    redteamConfig?.plugins?.map((p) => (typeof p === 'string' ? p : p.id)) || [];
  const telemetryStrategies =
    redteamConfig?.strategies?.map((s) => (typeof s === 'string' ? s : s.id)) || [];
  telemetry.record('command_used', {
    name: 'generate redteam - started',
    numPrompts: testSuite.prompts.length,
    numTestsExisting: (testSuite.tests || []).length,
    plugins: telemetryPlugins,
    strategies: telemetryStrategies,
    isPromptfooSampleTarget: testSuite.providers.some(isPromptfooSampleTarget),
  });
  telemetry.record('redteam generate', {
    phase: 'started',
    numPrompts: testSuite.prompts.length,
    numTestsExisting: (testSuite.tests || []).length,
    plugins: telemetryPlugins,
    strategies: telemetryStrategies,
    isPromptfooSampleTarget: testSuite.providers.some(isPromptfooSampleTarget),
  });

  let plugins = resolvePlugins(options, redteamConfig);
  plugins = applyPluginSeverityOverrides(plugins, pluginSeverityOverrides);
  await resolveCloudPolicyRefs(plugins);
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

  const targetInputs = testSuite.providers[0]?.inputs;
  const config = buildSynthesizeConfig(
    options,
    redteamConfig,
    commandLineOptions,
    plugins,
    strategyObjs,
    targetInputs,
  );
  const parsedConfig = RedteamConfigSchema.safeParse(config);
  if (!parsedConfig.success) {
    const errorMessage = z.prettifyError(parsedConfig.error);
    throw new Error(`Invalid redteam configuration:\n${errorMessage}`);
  }

  const targetIds = extractTargetIds(resolvedConfig);
  logger.debug(
    `Extracted ${targetIds.length} target IDs from config providers: ${JSON.stringify(targetIds)}`,
  );

  const { enhancedPurpose, augmentedTestGenerationInstructions } = await enhanceWithMcpTools(
    testSuite.providers,
    parsedConfig.data.purpose || '',
    config.testGenerationInstructions ?? '',
  );

  const contexts = redteamConfig?.contexts;
  const promptStrings = testSuite.prompts.map((prompt) => prompt.raw);
  const synthesizeBaseConfig = {
    ...parsedConfig.data,
    inputs: targetInputs,
    numTests: config.numTests,
    prompts: promptStrings,
    maxConcurrency: config.maxConcurrency,
    delay: config.delay,
    abortSignal: options.abortSignal,
    targetIds,
    showProgressBar: options.progressBar !== false,
    testGenerationInstructions: augmentedTestGenerationInstructions,
  };

  let redteamTests: any[];
  let purpose: string;
  let entities: string[];
  let finalInjectVar: string;
  let failedPlugins: { pluginId: string; requested: number }[];

  if (contexts && contexts.length > 0) {
    const contextResult = await generateTestsForContexts(
      contexts,
      parsedConfig,
      targetInputs,
      { ...config, prompts: promptStrings },
      options,
      targetIds,
      enhancedPurpose,
      augmentedTestGenerationInstructions,
    );
    ({ redteamTests, purpose, entities, finalInjectVar, failedPlugins } = contextResult);
  } else {
    const result = await synthesize({
      ...synthesizeBaseConfig,
      purpose: enhancedPurpose,
    } as SynthesizeOptions);
    redteamTests = result.testCases;
    purpose = result.purpose;
    entities = result.entities;
    finalInjectVar = result.injectVar;
    failedPlugins = result.failedPlugins;
  }

  try {
    handleFailedPlugins(failedPlugins, options.strict ?? false);

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
      ...(contexts && contexts.length > 0 ? { contexts } : {}),
    };

    const ret = writeGeneratedTests(
      options,
      configPath,
      redteamTests,
      purpose,
      entities,
      finalInjectVar,
      updatedRedteamConfig,
      plugins,
      strategyObjs,
      pluginSeverityOverridesId,
    );

    recordCompletedTelemetry(testSuite, redteamTests, plugins, strategies, startTime);

    return ret;
  } finally {
    await cleanupTestSuiteProvider(testSuite);
  }
}

/**
 * Initializes the test suite from config or purpose.
 * Returns null if generation should be aborted (error logged).
 */
async function initTestSuite(
  options: Partial<RedteamCliGenerateOptions>,
  configPath: string | undefined,
): Promise<{
  testSuite: TestSuite;
  redteamConfig: RedteamFileConfig | undefined;
  commandLineOptions: Record<string, any> | undefined;
  resolvedConfig: Partial<UnifiedConfig> | undefined;
  pluginSeverityOverrides: Map<Plugin, Severity>;
  pluginSeverityOverridesId: string | undefined;
} | null> {
  if (configPath) {
    const resolved = await resolveConfigFromPath(configPath, options);
    return resolved;
  }
  if (options.purpose) {
    return {
      testSuite: { prompts: [], providers: [], tests: [] },
      redteamConfig: undefined,
      commandLineOptions: undefined,
      resolvedConfig: undefined,
      pluginSeverityOverrides: new Map(),
      pluginSeverityOverridesId: undefined,
    };
  }
  logger.info(
    chalk.red(
      `\nCan't generate without configuration - run ${chalk.yellow.bold(
        promptfooCommand('redteam init'),
      )} first`,
    ),
  );
  return null;
}

/**
 * Validates the user's email for remote generation if needed.
 */
async function validateEmailForRemoteGen(): Promise<void> {
  if (neverGenerateRemote()) {
    return;
  }
  let hasValidEmail = false;
  while (!hasValidEmail) {
    const { emailNeedsValidation } = await promptForEmailUnverified();
    const res = await checkEmailStatusAndMaybeExit({ validate: emailNeedsValidation });
    hasValidEmail = res === EMAIL_OK_STATUS;
  }
}

/**
 * Builds the synthesize config object from options and redteam config.
 */
function buildSynthesizeConfig(
  options: Partial<RedteamCliGenerateOptions>,
  redteamConfig: RedteamFileConfig | undefined,
  commandLineOptions: Record<string, any> | undefined,
  plugins: RedteamPluginObject[],
  strategyObjs: RedteamStrategyObject[],
  targetInputs: any,
) {
  return {
    injectVar: redteamConfig?.injectVar || options.injectVar,
    inputs: targetInputs,
    language: redteamConfig?.language || options.language,
    maxConcurrency:
      options.maxConcurrency ?? commandLineOptions?.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY,
    numTests: redteamConfig?.numTests ?? options.numTests,
    entities: redteamConfig?.entities,
    plugins,
    provider: redteamConfig?.provider || options.provider,
    purpose: redteamConfig?.purpose ?? options.purpose,
    strategies: strategyObjs,
    delay: redteamConfig?.delay || options.delay || commandLineOptions?.delay,
    sharing: redteamConfig?.sharing || options.sharing,
    excludeTargetOutputFromAgenticAttackGeneration:
      redteamConfig?.excludeTargetOutputFromAgenticAttackGeneration,
    ...(redteamConfig?.testGenerationInstructions
      ? { testGenerationInstructions: redteamConfig.testGenerationInstructions }
      : {}),
  };
}

/**
 * Dispatches output writing to the appropriate handler based on options.
 */
function writeGeneratedTests(
  options: Partial<RedteamCliGenerateOptions>,
  configPath: string | undefined,
  redteamTests: any[],
  purpose: string,
  entities: string[],
  finalInjectVar: string,
  updatedRedteamConfig: any,
  plugins: RedteamPluginObject[],
  strategyObjs: RedteamStrategyObject[],
  pluginSeverityOverridesId: string | undefined,
): Partial<UnifiedConfig> | undefined {
  if (options.output && options.output.endsWith('.burp')) {
    return writeBurpOutput(options.output, redteamTests, finalInjectVar, options.burpEscapeJson);
  }
  if (options.output) {
    return writeOutputFile(
      options,
      configPath,
      redteamTests,
      purpose,
      entities,
      updatedRedteamConfig,
      plugins,
      strategyObjs,
      pluginSeverityOverridesId,
    );
  }
  if (options.write && configPath) {
    return writeToConfigFile(
      configPath,
      options,
      redteamTests,
      purpose,
      entities,
      updatedRedteamConfig,
      plugins,
      strategyObjs,
    );
  }
  return writeDefaultOutput(options, redteamTests, plugins, strategyObjs);
}

/**
 * Records telemetry for completed generation.
 */
function recordCompletedTelemetry(
  testSuite: TestSuite,
  redteamTests: any[],
  plugins: RedteamPluginObject[],
  strategies: (string | { id: string })[],
  startTime: number,
): void {
  const commonPayload = {
    duration: Math.round((Date.now() - startTime) / 1000),
    numPrompts: testSuite.prompts.length,
    numTestsExisting: (testSuite.tests || []).length,
    numTestsGenerated: redteamTests.length,
    plugins: plugins.map((p) => p.id),
    strategies: strategies.map((s) => (typeof s === 'string' ? s : s.id)),
    isPromptfooSampleTarget: testSuite.providers.some(isPromptfooSampleTarget),
  };
  telemetry.record('command_used', { name: 'generate redteam', ...commonPayload });
  telemetry.record('redteam generate', { phase: 'completed', ...commonPayload });
}

/**
 * Resolves cloud config and handles the --target flag, mutating opts in place.
 * Returns false if the caller should abort (error already logged).
 */
async function resolveCloudConfigOpts(opts: Partial<RedteamCliGenerateOptions>): Promise<boolean> {
  if (opts.config && isUuid(opts.config)) {
    // target flag is mutually inclusive with a cloud config UUID
    if (opts.target && !isUuid(opts.target)) {
      throw new Error('Invalid target ID, it must be a valid UUID');
    }
    const configObj = await getConfigFromCloud(opts.config, opts.target);

    // backwards compatible for old cloud servers
    if (
      opts.target &&
      isUuid(opts.target) &&
      (!configObj.targets || configObj.targets?.length === 0)
    ) {
      configObj.targets = [{ id: `${CLOUD_PROVIDER_PREFIX}${opts.target}`, config: {} }];
    }
    opts.configFromCloud = configObj;
    opts.config = undefined;
    return true;
  }

  if (opts.target) {
    logger.error(
      `Target ID (-t) can only be used when -c is used with a cloud config UUID. To use a cloud target inside of a config set the id of the target to ${CLOUD_PROVIDER_PREFIX}${opts.target}.`,
    );
    process.exitCode = 1;
    return false;
  }

  return true;
}

/**
 * Validates plugin options from command line and returns overrides.
 * Returns null if validation failed (error already logged).
 */
function validatePluginOptions(
  opts: Partial<RedteamCliGenerateOptions>,
): Partial<RedteamFileConfig> | null {
  if (!opts.plugins || opts.plugins.length === 0) {
    return {};
  }

  const parsed = RedteamConfigSchema.safeParse({
    plugins: opts.plugins,
    strategies: opts.strategies,
    numTests: opts.numTests,
  });

  if (!parsed.success) {
    logger.error('Invalid options:');
    parsed.error.issues.forEach((err: z.ZodIssue) => {
      logger.error(`  ${err.path.join('.')}: ${err.message}`);
    });
    process.exitCode = 1;
    return null;
  }

  return parsed.data;
}

/**
 * The action handler for the redteam generate command.
 */
async function runRedteamGenerateAction(
  opts: Partial<RedteamCliGenerateOptions>,
  defaultConfig: Partial<UnifiedConfig>,
  defaultConfigPath: string | undefined,
): Promise<void> {
  const shouldContinue = await resolveCloudConfigOpts(opts);
  if (!shouldContinue) {
    return;
  }

  if (opts.remote) {
    cliState.remote = true;
  }
  if (opts.maxConcurrency !== undefined) {
    cliState.maxConcurrency = opts.maxConcurrency;
  }
  logger.debug(shouldGenerateRemote() ? 'Remote generation enabled' : 'Remote generation disabled');

  try {
    const overrides = validatePluginOptions(opts);
    if (overrides === null) {
      return;
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
    await doGenerateRedteam(validatedOpts);
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.error('Invalid options:');
      error.issues.forEach((err: z.ZodIssue) => {
        logger.error(`  ${err.path.join('.')}: ${err.message}`);
      });
    } else {
      logger.error(
        error instanceof Error && error.stack
          ? error.stack
          : `An unexpected error occurred during generation: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    process.exitCode = 1;
  } finally {
    cliState.maxConcurrency = undefined;
  }
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
    .option(
      '-c, --config [path]',
      'Path to configuration file or cloud config UUID. Defaults to promptfooconfig.yaml',
    )
    .option('-o, --output [path]', 'Path to output file')
    .option('-w, --write', 'Write results to promptfoo configuration file', false)
    .option('-t, --target <id>', 'Cloud provider target ID to run the scan on')
    .option('-d, --description <text>', 'Custom description/name for the generated tests')
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
    .option('-j, --max-concurrency <number>', 'Maximum number of concurrent API calls', (val) =>
      Number.parseInt(val, 10),
    )
    .option('--delay <number>', 'Delay in milliseconds between plugin API calls', (val) =>
      Number.parseInt(val, 10),
    )
    .option('--remote', 'Force remote inference wherever possible', false)
    .option('--force', 'Force generation even if no changes are detected', false)
    .option('--no-progress-bar', 'Do not show progress bar')
    .option('--burp-escape-json', 'Escape quotes in Burp payloads', false)
    .option(
      '--strict',
      'Fail if any plugins fail to generate test cases. By default, warnings are logged but generation continues.',
      false,
    )
    .action(async (opts: Partial<RedteamCliGenerateOptions>): Promise<void> => {
      await runRedteamGenerateAction(opts, defaultConfig, defaultConfigPath);
    });
}
