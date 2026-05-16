import { createHash } from 'crypto';
import fs from 'fs/promises';
import path from 'path';

import chalk from 'chalk';
import dedent from 'dedent';
import yaml from 'js-yaml';
import { z } from 'zod';
import { withCacheEnabled } from '../../cache';
import cliState from '../../cliState';
import { CLOUD_PROVIDER_PREFIX, DEFAULT_MAX_CONCURRENCY, VERSION } from '../../constants';
import {
  checkEmailStatusAndMaybeExit,
  EmailValidationError,
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
import {
  ConfigResolutionError,
  logConfigResolutionError,
  resolveConfigs,
} from '../../util/config/load';
import { writePromptfooConfig } from '../../util/config/writer';
import { pathExists } from '../../util/file';
import { getCustomPolicies } from '../../util/generation';
import { printBorder, setupEnv } from '../../util/index';
import invariant from '../../util/invariant';
import { promptfooCommand } from '../../util/promptfooCommand';
import { checkRedteamProbeLimit, MONTHLY_PROBE_LIMIT } from '../../util/redteamProbeLimit';
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
import { MAX_MAX_CONCURRENCY, synthesize } from '../index';
import { determinePolicyTypeFromId, isValidPolicyObject } from '../plugins/policy/utils';
import { neverGenerateRemote, shouldGenerateRemote } from '../remoteGeneration';
import { PartialGenerationError, ProbeLimitExceededError } from '../types';
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

function getNoTestCasesGeneratedMessage(strategies: RedteamStrategyObject[]): string {
  const basicStrategy = strategies.find((strategy) => strategy.id === 'basic');
  const basicDisabled = basicStrategy?.config?.enabled === false;

  if (!basicDisabled) {
    return 'No test cases generated. Please check for errors and try again.';
  }

  const activeStrategies = strategies.filter(
    (strategy) => !(strategy.id === 'basic' && strategy.config?.enabled === false),
  );

  if (activeStrategies.length === 0) {
    return dedent`
      No final test cases were generated because the Basic strategy is disabled and no other strategies are selected.

      The Basic strategy runs plugin-generated test cases as-is. Enable Basic to run your configured plugin tests directly, or select another strategy to transform them.
    `;
  }

  return dedent`
    No final test cases were generated. The Basic strategy is disabled, so plugin-generated test cases are excluded unless another selected strategy creates replacement tests.

    Enable Basic to include plugin tests as-is, or review the selected strategies for generation errors.
  `;
}

async function getConfigHash(configPath: string): Promise<string> {
  const content = await fs.readFile(configPath, 'utf8');
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

async function withGenerationConcurrency<T>(
  maxConcurrency: number,
  delay: number | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  const cappedMaxConcurrency = Math.min(maxConcurrency, MAX_MAX_CONCURRENCY);
  const effectiveMaxConcurrency = delay !== undefined && delay > 0 ? 1 : cappedMaxConcurrency;
  return cliState.withMaxConcurrency(effectiveMaxConcurrency, fn);
}

interface LoadedGenerationContext {
  testSuite: TestSuite;
  redteamConfig?: RedteamFileConfig;
  configPath?: string;
  commandLineOptions?: Record<string, any>;
  resolvedConfig?: Partial<UnifiedConfig>;
  pluginSeverityOverrides: Map<Plugin, Severity>;
  pluginSeverityOverridesId?: string;
}

interface PreparedGenerationConfig {
  parsedConfig: z.infer<typeof RedteamConfigSchema>;
  targetInputs: TestSuite['providers'][number]['inputs'];
  targetIds: string[];
  enhancedPurpose: string;
  augmentedTestGenerationInstructions: string;
  strategyObjs: RedteamStrategyObject[];
  plugins: RedteamPluginObject[];
  maxConcurrency: number;
  delay: number | undefined;
  numTests: number | undefined;
  sharing: boolean | undefined;
}

interface GeneratedRedteamTests {
  redteamTests: any[];
  purpose: string;
  entities: string[];
  finalInjectVar: string;
  failedPlugins: FailedPluginInfo[];
}

function enforceProbeLimit(): void {
  const probeLimitResult = checkRedteamProbeLimit();
  if (probeLimitResult.withinLimit) {
    return;
  }

  logger.error(dedent`
    ${chalk.red.bold('Monthly probe limit reached')}

    You've used ${chalk.bold(probeLimitResult.used.toLocaleString())} of your ${chalk.bold(MONTHLY_PROBE_LIMIT.toLocaleString())} free monthly probes.

    To continue, please log in to Promptfoo Cloud:

      ${chalk.cyan('promptfoo auth login')}

    For enterprise plans, contact ${chalk.cyan('inquiries@promptfoo.dev')}
  `);
  throw new ProbeLimitExceededError(probeLimitResult.used, MONTHLY_PROBE_LIMIT);
}

async function materializeCloudConfig(
  options: Partial<RedteamCliGenerateOptions>,
  configPath: string | undefined,
): Promise<string | undefined> {
  if (!options.configFromCloud) {
    return configPath;
  }

  const filename = `redteam-generate-${Date.now()}.yaml`;
  const tmpFile = path.join('', filename);
  await fs.mkdir(path.dirname(tmpFile), { recursive: true });
  await fs.writeFile(tmpFile, yaml.dump(options.configFromCloud));
  logger.debug(`Using Promptfoo Cloud-originated config at ${tmpFile}`);
  return tmpFile;
}

async function maybeReuseExistingGeneratedConfig(
  options: Partial<RedteamCliGenerateOptions>,
  outputPath: string,
  configPath: string | undefined,
): Promise<Partial<UnifiedConfig> | undefined> {
  if (
    options.force ||
    options.configFromCloud ||
    outputPath.endsWith('.burp') ||
    !(await pathExists(outputPath)) ||
    !configPath ||
    !(await pathExists(configPath))
  ) {
    return undefined;
  }

  const redteamContent = yaml.load(await fs.readFile(outputPath, 'utf8')) as Partial<UnifiedConfig>;
  const storedHash = redteamContent.metadata?.configHash;
  const currentHash = await getConfigHash(configPath);

  if (storedHash !== currentHash) {
    return undefined;
  }

  logger.warn(
    'No changes detected in redteam configuration. Skipping generation (use --force to generate anyway)',
  );
  return redteamContent;
}

function warnAboutTestsAndRedteam(testSuite: TestSuite, redteamConfig?: RedteamFileConfig): void {
  if (!redteamConfig || !testSuite.tests || testSuite.tests.length === 0) {
    return;
  }

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

async function getPluginSeverityOverrides(
  resolvedConfig: Partial<UnifiedConfig>,
): Promise<{ overrides: Map<Plugin, Severity>; id?: string }> {
  try {
    const providerId = getProviderIds(resolvedConfig.providers!)[0];
    if (!isCloudProvider(providerId)) {
      return { overrides: new Map() };
    }

    const cloudId = getCloudDatabaseId(providerId);
    const overrides = await getPluginSeverityOverridesFromCloud(cloudId);
    if (!overrides) {
      return { overrides: new Map() };
    }

    return {
      overrides: new Map(Object.entries(overrides.severities) as [Plugin, Severity][]),
      id: overrides.id,
    };
  } catch (error) {
    logger.error(
      `Plugin severity override check failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return { overrides: new Map() };
  }
}

async function loadGenerationContext(
  options: Partial<RedteamCliGenerateOptions>,
  configPath: string | undefined,
): Promise<LoadedGenerationContext | null> {
  if (!configPath) {
    if (!options.purpose) {
      logger.info(
        chalk.red(
          `\nCan't generate without configuration - run ${chalk.yellow.bold(
            promptfooCommand('redteam init'),
          )} first`,
        ),
      );
      return null;
    }

    return {
      testSuite: { prompts: [], providers: [], tests: [] },
      configPath,
      pluginSeverityOverrides: new Map(),
    };
  }

  const resolved = await resolveConfigs(
    {
      config: [configPath],
    },
    options.defaultConfig || {},
  );
  await checkCloudPermissions(resolved.config);
  warnAboutTestsAndRedteam(resolved.testSuite, resolved.config.redteam);
  const severityOverrides = await getPluginSeverityOverrides(resolved.config);

  return {
    testSuite: resolved.testSuite,
    redteamConfig: resolved.config.redteam,
    configPath,
    commandLineOptions: resolved.commandLineOptions,
    resolvedConfig: resolved.config,
    pluginSeverityOverrides: severityOverrides.overrides,
    pluginSeverityOverridesId: severityOverrides.id,
  };
}

async function ensureRemoteGenerationEmail(): Promise<void> {
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

function recordGenerationStartTelemetry(
  testSuite: TestSuite,
  redteamConfig?: RedteamFileConfig,
): void {
  const plugins =
    redteamConfig?.plugins?.map((plugin) => (typeof plugin === 'string' ? plugin : plugin.id)) ||
    [];
  const strategies =
    redteamConfig?.strategies?.map((strategy) =>
      typeof strategy === 'string' ? strategy : strategy.id,
    ) || [];
  const isPromptfooSample = testSuite.providers.some(isPromptfooSampleTarget);
  const payload = {
    numPrompts: testSuite.prompts.length,
    numTestsExisting: (testSuite.tests || []).length,
    plugins,
    strategies,
    isPromptfooSampleTarget: isPromptfooSample,
  };

  telemetry.record('command_used', {
    name: 'generate redteam - started',
    ...payload,
  });
  telemetry.record('redteam generate', {
    phase: 'started',
    ...payload,
  });
}

function buildConfiguredPlugins(
  options: Partial<RedteamCliGenerateOptions>,
  redteamConfig?: RedteamFileConfig,
): RedteamPluginObject[] {
  if (Array.isArray(options.plugins) && options.plugins.length > 0) {
    return options.plugins.map((plugin) => ({
      id: plugin.id,
      numTests: plugin.numTests || options.numTests || redteamConfig?.numTests,
      ...(plugin.config && { config: plugin.config }),
    }));
  }

  if (redteamConfig?.plugins && redteamConfig.plugins.length > 0) {
    return redteamConfig.plugins.map((plugin) => {
      const pluginConfig: RedteamPluginObject = {
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

  return Array.from(REDTEAM_DEFAULT_PLUGINS).map((plugin) => ({
    id: plugin,
    numTests: options.numTests ?? redteamConfig?.numTests,
  }));
}

function applyPluginSeverityOverrides(
  plugins: RedteamPluginObject[],
  overrides: Map<Plugin, Severity>,
): RedteamPluginObject[] {
  if (overrides.size === 0) {
    return plugins;
  }

  let intersectionCount = 0;
  const updatedPlugins = plugins.map((plugin) => {
    if (!overrides.has(plugin.id as Plugin)) {
      return plugin;
    }

    intersectionCount++;
    return {
      ...plugin,
      severity: overrides.get(plugin.id as Plugin),
    };
  });

  logger.info(`Applied ${intersectionCount} custom plugin severity levels`);
  return updatedPlugins;
}

async function resolvePolicyReferences(plugins: RedteamPluginObject[]): Promise<void> {
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
    if (!policyData) {
      continue;
    }

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

function buildStrategyObjects(
  options: Partial<RedteamCliGenerateOptions>,
  redteamConfig?: RedteamFileConfig,
): RedteamStrategyObject[] {
  const strategies: (string | { id: string })[] =
    options.strategies ??
    redteamConfig?.strategies ??
    DEFAULT_STRATEGIES.map((strategy) => ({ id: strategy }));
  return strategies.map((strategy) => (typeof strategy === 'string' ? { id: strategy } : strategy));
}

function logGenerationSelections(
  plugins: RedteamPluginObject[],
  strategyObjs: RedteamStrategyObject[],
): void {
  try {
    logger.debug(`plugins: ${plugins.map((plugin) => plugin.id).join(', ')}`);
    logger.debug(
      `strategies: ${strategyObjs.map((strategy) => strategy.id ?? strategy).join(', ')}`,
    );
  } catch (error) {
    logger.error('Error logging plugins and strategies. One did not have a valid id.');
    logger.error(`Error details: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function extractTargetIds(resolvedConfig?: Partial<UnifiedConfig>): string[] {
  return (
    (Array.isArray(resolvedConfig?.providers)
      ? resolvedConfig.providers
          .filter((target) => typeof target !== 'function')
          .map((target) => {
            if (typeof target === 'string') {
              return target;
            }
            return (target as { id?: string }).id;
          })
          .filter((id): id is string => typeof id === 'string')
      : []) ?? []
  );
}

async function augmentPurposeWithMcpTools(
  testSuite: TestSuite,
  purpose: string | undefined,
  testGenerationInstructions: string | undefined,
): Promise<{ enhancedPurpose: string; augmentedInstructions: string }> {
  let enhancedPurpose = purpose || '';
  let augmentedInstructions = testGenerationInstructions ?? '';

  try {
    const mcpToolsInfo = await extractMcpToolsInfo(testSuite.providers);
    if (!mcpToolsInfo) {
      return { enhancedPurpose, augmentedInstructions };
    }

    enhancedPurpose = enhancedPurpose ? `${enhancedPurpose}\n\n${mcpToolsInfo}\n\n` : mcpToolsInfo;
    logger.info('Added MCP tools information to red team purpose');
    augmentedInstructions += `\nGenerate every test case prompt as a json string encoding the tool call and parameters, and choose a specific function to call. The specific format should be: {"tool": "function_name", "args": {...}}.`;
  } catch (error) {
    logger.warn(
      `Failed to extract MCP tools information: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return { enhancedPurpose, augmentedInstructions };
}

async function prepareGenerationConfig({
  options,
  redteamConfig,
  commandLineOptions,
  resolvedConfig,
  testSuite,
  plugins,
  strategyObjs,
}: {
  options: Partial<RedteamCliGenerateOptions>;
  redteamConfig?: RedteamFileConfig;
  commandLineOptions?: Record<string, any>;
  resolvedConfig?: Partial<UnifiedConfig>;
  testSuite: TestSuite;
  plugins: RedteamPluginObject[];
  strategyObjs: RedteamStrategyObject[];
}): Promise<PreparedGenerationConfig> {
  const targetInputs = testSuite.providers[0]?.inputs;
  const explicitMaxConcurrency =
    options.maxConcurrency ??
    redteamConfig?.maxConcurrency ??
    commandLineOptions?.maxConcurrency ??
    resolvedConfig?.evaluateOptions?.maxConcurrency;
  const config = {
    injectVar: redteamConfig?.injectVar || options.injectVar,
    inputs: targetInputs,
    language: redteamConfig?.language || options.language,
    maxConcurrency: explicitMaxConcurrency ?? DEFAULT_MAX_CONCURRENCY,
    numTests: redteamConfig?.numTests ?? options.numTests,
    entities: redteamConfig?.entities,
    plugins,
    provider: redteamConfig?.provider || options.provider,
    purpose: redteamConfig?.purpose ?? options.purpose,
    strategies: strategyObjs,
    delay:
      options.delay ??
      redteamConfig?.delay ??
      commandLineOptions?.delay ??
      resolvedConfig?.evaluateOptions?.delay,
    sharing: redteamConfig?.sharing || options.sharing,
    excludeTargetOutputFromAgenticAttackGeneration:
      redteamConfig?.excludeTargetOutputFromAgenticAttackGeneration,
    ...(redteamConfig?.testGenerationInstructions
      ? { testGenerationInstructions: redteamConfig.testGenerationInstructions }
      : {}),
  };
  const parsedConfig = RedteamConfigSchema.safeParse(config);
  if (!parsedConfig.success) {
    throw new Error(`Invalid redteam configuration:\n${z.prettifyError(parsedConfig.error)}`);
  }

  const targetIds = extractTargetIds(resolvedConfig);
  logger.debug(
    `Extracted ${targetIds.length} target IDs from config providers: ${JSON.stringify(targetIds)}`,
  );
  const { enhancedPurpose, augmentedInstructions } = await augmentPurposeWithMcpTools(
    testSuite,
    parsedConfig.data.purpose,
    config.testGenerationInstructions,
  );

  return {
    parsedConfig: parsedConfig.data,
    targetInputs,
    targetIds,
    enhancedPurpose,
    augmentedTestGenerationInstructions: augmentedInstructions,
    strategyObjs,
    plugins,
    maxConcurrency: config.maxConcurrency,
    delay: config.delay,
    numTests: config.numTests,
    sharing: config.sharing,
  };
}

async function synthesizeContextTests({
  context,
  prepared,
  options,
  testSuite,
  targetInputs,
}: {
  context: NonNullable<RedteamFileConfig['contexts']>[number];
  prepared: PreparedGenerationConfig;
  options: Partial<RedteamCliGenerateOptions>;
  testSuite: TestSuite;
  targetInputs: TestSuite['providers'][number]['inputs'];
}) {
  logger.info(`  Generating tests for context: ${context.id}`);
  const contextPurpose =
    context.purpose + (prepared.enhancedPurpose ? `\n\n${prepared.enhancedPurpose}` : '');
  const contextResult = await withGenerationConcurrency(
    prepared.maxConcurrency,
    prepared.delay,
    () =>
      synthesize({
        ...prepared.parsedConfig,
        inputs: targetInputs,
        purpose: contextPurpose,
        numTests: prepared.numTests,
        prompts: testSuite.prompts.map((prompt) => prompt.raw),
        maxConcurrency: prepared.maxConcurrency,
        delay: prepared.delay,
        abortSignal: options.abortSignal,
        targetIds: prepared.targetIds,
        showProgressBar: options.progressBar !== false,
        testGenerationInstructions: prepared.augmentedTestGenerationInstructions,
      } as SynthesizeOptions),
  );

  const taggedTests = contextResult.testCases.map((test: any) => ({
    ...test,
    vars: {
      ...test.vars,
      ...(context.vars || {}),
    },
    metadata: {
      ...test.metadata,
      purpose: context.purpose,
      contextId: context.id,
      contextVars: context.vars,
    },
  }));

  return {
    taggedTests,
    failedPlugins: contextResult.failedPlugins,
    entities: contextResult.entities,
    injectVar: contextResult.injectVar,
  };
}

async function generateTestsForContexts({
  contexts,
  prepared,
  options,
  testSuite,
}: {
  contexts: NonNullable<RedteamFileConfig['contexts']>;
  prepared: PreparedGenerationConfig;
  options: Partial<RedteamCliGenerateOptions>;
  testSuite: TestSuite;
}): Promise<GeneratedRedteamTests> {
  logger.info(`Generating tests for ${contexts.length} contexts...`);

  const allFailedPlugins: FailedPluginInfo[] = [];
  let redteamTests: any[] = [];
  let entities: string[] = [];
  let finalInjectVar = '';

  for (const context of contexts) {
    const result = await synthesizeContextTests({
      context,
      prepared,
      options,
      testSuite,
      targetInputs: prepared.targetInputs,
    });
    redteamTests = redteamTests.concat(result.taggedTests);
    allFailedPlugins.push(...result.failedPlugins);
    if (!entities.length) {
      entities = result.entities;
    }
    if (!finalInjectVar) {
      finalInjectVar = result.injectVar;
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

async function generateTestsForPurpose({
  prepared,
  options,
  testSuite,
}: {
  prepared: PreparedGenerationConfig;
  options: Partial<RedteamCliGenerateOptions>;
  testSuite: TestSuite;
}): Promise<GeneratedRedteamTests> {
  const result = await withGenerationConcurrency(prepared.maxConcurrency, prepared.delay, () =>
    synthesize({
      ...prepared.parsedConfig,
      inputs: prepared.targetInputs,
      purpose: prepared.enhancedPurpose,
      numTests: prepared.numTests,
      prompts: testSuite.prompts.map((prompt) => prompt.raw),
      maxConcurrency: prepared.maxConcurrency,
      delay: prepared.delay,
      abortSignal: options.abortSignal,
      targetIds: prepared.targetIds,
      showProgressBar: options.progressBar !== false,
      testGenerationInstructions: prepared.augmentedTestGenerationInstructions,
    } as SynthesizeOptions),
  );

  return {
    redteamTests: result.testCases,
    purpose: result.purpose,
    entities: result.entities,
    finalInjectVar: result.injectVar,
    failedPlugins: result.failedPlugins,
  };
}

function createGenerationCleanup(testSuite: TestSuite): () => Promise<void> {
  return async () => {
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
  };
}

function buildUpdatedRedteamConfig({
  purpose,
  entities,
  strategyObjs,
  plugins,
  sharing,
  contexts,
}: {
  purpose: string;
  entities: string[];
  strategyObjs: RedteamStrategyObject[];
  plugins: RedteamPluginObject[];
  sharing: unknown;
  contexts?: RedteamFileConfig['contexts'];
}) {
  return {
    purpose,
    entities,
    strategies: strategyObjs || [],
    plugins: plugins || [],
    sharing: sharing as boolean | undefined,
    ...(contexts && contexts.length > 0 ? { contexts } : {}),
  };
}

function createGenerationHeaderComments({
  title,
  timestampLabel,
  redteamTests,
  plugins,
  strategyObjs,
  isUpdate,
}: {
  title: string;
  timestampLabel: string;
  redteamTests: any[];
  plugins: RedteamPluginObject[];
  strategyObjs: RedteamStrategyObject[];
  isUpdate?: boolean;
}): string[] {
  const author = getAuthor();
  const userEmail = getUserEmail();
  const cloudHost = userEmail ? cloudConfig.getApiHost() : null;
  return createHeaderComments({
    title,
    timestampLabel,
    author,
    cloudHost,
    testCasesCount: redteamTests.length,
    plugins,
    strategies: strategyObjs,
    isUpdate,
  });
}

async function writeBurpOutput(
  options: Partial<RedteamCliGenerateOptions>,
  redteamTests: any[],
  finalInjectVar: string,
): Promise<Partial<UnifiedConfig>> {
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
  await fs.writeFile(options.output!, outputLines);
  logger.info(
    chalk.green(`Wrote ${redteamTests.length} test cases to ${chalk.bold(options.output)}`),
  );
  return {};
}

async function writeOutputFile({
  options,
  configPath,
  redteamTests,
  purpose,
  entities,
  updatedRedteamConfig,
  pluginSeverityOverridesId,
  plugins,
  strategyObjs,
}: {
  options: Partial<RedteamCliGenerateOptions>;
  configPath?: string;
  redteamTests: any[];
  purpose: string;
  entities: string[];
  updatedRedteamConfig: ReturnType<typeof buildUpdatedRedteamConfig>;
  pluginSeverityOverridesId?: string;
  plugins: RedteamPluginObject[];
  strategyObjs: RedteamStrategyObject[];
}): Promise<Partial<UnifiedConfig>> {
  const existingYaml = configPath
    ? (yaml.load(await fs.readFile(configPath, 'utf8')) as Partial<UnifiedConfig>)
    : {};
  const existingDefaultTest =
    typeof existingYaml.defaultTest === 'object' ? existingYaml.defaultTest : {};
  const updatedYaml: Partial<UnifiedConfig> = {
    ...existingYaml,
    ...(options.description ? { description: options.description } : {}),
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
        ? { configHash: await getConfigHash(configPath) }
        : { configHash: 'force-regenerate' }),
      ...(pluginSeverityOverridesId ? { pluginSeverityOverridesId } : {}),
    },
  };
  const headerComments = createGenerationHeaderComments({
    title: 'REDTEAM CONFIGURATION',
    timestampLabel: 'Generated:',
    redteamTests,
    plugins,
    strategyObjs,
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

async function updateExistingConfig({
  options,
  configPath,
  redteamTests,
  purpose,
  entities,
  updatedRedteamConfig,
  plugins,
  strategyObjs,
}: {
  options: Partial<RedteamCliGenerateOptions>;
  configPath: string;
  redteamTests: any[];
  purpose: string;
  entities: string[];
  updatedRedteamConfig: ReturnType<typeof buildUpdatedRedteamConfig>;
  plugins: RedteamPluginObject[];
  strategyObjs: RedteamStrategyObject[];
}): Promise<Partial<UnifiedConfig>> {
  const existingConfig = yaml.load(await fs.readFile(configPath, 'utf8')) as Partial<UnifiedConfig>;
  const existingTests = existingConfig.tests;
  const testsArray = Array.isArray(existingTests)
    ? existingTests
    : existingTests
      ? [existingTests]
      : [];
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
  if (options.description) {
    existingConfig.description = options.description;
  }
  existingConfig.tests = [...testsArray, ...redteamTests];
  existingConfig.redteam = { ...(existingConfig.redteam || {}), ...updatedRedteamConfig };
  existingConfig.metadata = {
    ...(existingConfig.metadata || {}),
    configHash: await getConfigHash(configPath),
  };
  const headerComments = createGenerationHeaderComments({
    title: 'REDTEAM CONFIGURATION UPDATE',
    timestampLabel: 'Updated:',
    redteamTests,
    plugins,
    strategyObjs,
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

function writeDefaultOutput({
  options,
  redteamTests,
  plugins,
  strategyObjs,
}: {
  options: Partial<RedteamCliGenerateOptions>;
  redteamTests: any[];
  plugins: RedteamPluginObject[];
  strategyObjs: RedteamStrategyObject[];
}): Partial<UnifiedConfig> {
  const headerComments = createGenerationHeaderComments({
    title: 'REDTEAM CONFIGURATION',
    timestampLabel: 'Generated:',
    redteamTests,
    plugins,
    strategyObjs,
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

async function writeGenerationResult({
  options,
  configPath,
  generated,
  prepared,
  redteamConfig,
  pluginSeverityOverridesId,
}: {
  options: Partial<RedteamCliGenerateOptions>;
  configPath?: string;
  generated: GeneratedRedteamTests;
  prepared: PreparedGenerationConfig;
  redteamConfig?: RedteamFileConfig;
  pluginSeverityOverridesId?: string;
}): Promise<Partial<UnifiedConfig>> {
  const updatedRedteamConfig = buildUpdatedRedteamConfig({
    purpose: generated.purpose,
    entities: generated.entities,
    strategyObjs: prepared.strategyObjs,
    plugins: prepared.plugins,
    // Keep the raw resolved sharing value rather than relying on parsed schema output.
    // Some legacy configs intentionally omit it.
    sharing: prepared.sharing,
    contexts: redteamConfig?.contexts,
  });

  if (options.output?.endsWith('.burp')) {
    return writeBurpOutput(options, generated.redteamTests, generated.finalInjectVar);
  }
  if (options.output) {
    return writeOutputFile({
      options,
      configPath,
      redteamTests: generated.redteamTests,
      purpose: generated.purpose,
      entities: generated.entities,
      updatedRedteamConfig,
      pluginSeverityOverridesId,
      plugins: prepared.plugins,
      strategyObjs: prepared.strategyObjs,
    });
  }
  if (options.write && configPath) {
    return updateExistingConfig({
      options,
      configPath,
      redteamTests: generated.redteamTests,
      purpose: generated.purpose,
      entities: generated.entities,
      updatedRedteamConfig,
      plugins: prepared.plugins,
      strategyObjs: prepared.strategyObjs,
    });
  }

  return writeDefaultOutput({
    options,
    redteamTests: generated.redteamTests,
    plugins: prepared.plugins,
    strategyObjs: prepared.strategyObjs,
  });
}

function recordGenerationCompletedTelemetry({
  startTime,
  testSuite,
  generated,
  plugins,
  strategies,
}: {
  startTime: number;
  testSuite: TestSuite;
  generated: GeneratedRedteamTests;
  plugins: RedteamPluginObject[];
  strategies: (string | { id: string })[];
}): void {
  const duration = Math.round((Date.now() - startTime) / 1000);
  const payload = {
    duration,
    numPrompts: testSuite.prompts.length,
    numTestsExisting: (testSuite.tests || []).length,
    numTestsGenerated: generated.redteamTests.length,
    plugins: plugins.map((plugin) => plugin.id),
    strategies: strategies.map((strategy) =>
      typeof strategy === 'string' ? strategy : strategy.id,
    ),
    isPromptfooSampleTarget: testSuite.providers.some(isPromptfooSampleTarget),
  };

  telemetry.record('command_used', {
    name: 'generate redteam',
    ...payload,
  });
  telemetry.record('redteam generate', {
    phase: 'completed',
    ...payload,
  });
}

export async function doGenerateRedteam(
  options: Partial<RedteamCliGenerateOptions>,
): Promise<Partial<UnifiedConfig> | null> {
  setupEnv(options.envFile);
  const cacheOverride = options.cache === false ? false : undefined;
  if (cacheOverride === false) {
    logger.info('Cache is disabled');
  }

  return withCacheEnabled(cacheOverride, () => doGenerateRedteamInternal(options));
}

async function doGenerateRedteamInternal(
  options: Partial<RedteamCliGenerateOptions>,
): Promise<Partial<UnifiedConfig> | null> {
  enforceProbeLimit();

  const outputPath = options.output || 'redteam.yaml';
  const configPath = await materializeCloudConfig(
    options,
    options.config || options.defaultConfigPath,
  );
  const existingGeneratedConfig = await maybeReuseExistingGeneratedConfig(
    options,
    outputPath,
    configPath,
  );
  if (existingGeneratedConfig) {
    return existingGeneratedConfig;
  }

  const context = await loadGenerationContext(options, configPath);
  if (!context) {
    return null;
  }

  await ensureRemoteGenerationEmail();
  const startTime = Date.now();
  recordGenerationStartTelemetry(context.testSuite, context.redteamConfig);

  let plugins = buildConfiguredPlugins(options, context.redteamConfig);
  invariant(plugins && Array.isArray(plugins) && plugins.length > 0, 'No plugins found');
  plugins = applyPluginSeverityOverrides(plugins, context.pluginSeverityOverrides);
  await resolvePolicyReferences(plugins);
  const strategyObjs = buildStrategyObjects(options, context.redteamConfig);
  logGenerationSelections(plugins, strategyObjs);
  const prepared = await prepareGenerationConfig({
    options,
    redteamConfig: context.redteamConfig,
    commandLineOptions: context.commandLineOptions,
    resolvedConfig: context.resolvedConfig,
    testSuite: context.testSuite,
    plugins,
    strategyObjs,
  });
  const generated =
    context.redteamConfig?.contexts && context.redteamConfig.contexts.length > 0
      ? await generateTestsForContexts({
          contexts: context.redteamConfig.contexts,
          prepared,
          options,
          testSuite: context.testSuite,
        })
      : await generateTestsForPurpose({
          prepared,
          options,
          testSuite: context.testSuite,
        });
  const cleanupProvider = createGenerationCleanup(context.testSuite);

  try {
    handleFailedPlugins(generated.failedPlugins, options.strict ?? false);
    if (generated.redteamTests.length === 0) {
      logger.warn(getNoTestCasesGeneratedMessage(prepared.strategyObjs));
      return null;
    }

    const ret = await writeGenerationResult({
      options,
      configPath: context.configPath,
      generated,
      prepared,
      redteamConfig: context.redteamConfig,
      pluginSeverityOverridesId: context.pluginSeverityOverridesId,
    });
    recordGenerationCompletedTelemetry({
      startTime,
      testSuite: context.testSuite,
      generated,
      plugins: prepared.plugins,
      strategies: prepared.strategyObjs,
    });
    return ret;
  } finally {
    await cleanupProvider();
  }
}

async function hydrateCloudGenerateOptions(
  opts: Partial<RedteamCliGenerateOptions>,
): Promise<boolean> {
  if (opts.config && isUuid(opts.config)) {
    if (opts.target && !isUuid(opts.target)) {
      throw new Error('Invalid target ID, it must be a valid UUID');
    }

    const configObj = await getConfigFromCloud(opts.config, opts.target);
    if (
      opts.target &&
      isUuid(opts.target) &&
      (!configObj.targets || configObj.targets.length === 0)
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

function applyCliStateOverrides(opts: Partial<RedteamCliGenerateOptions>): void {
  if (opts.remote) {
    cliState.remote = true;
  }
  if (opts.maxConcurrency !== undefined) {
    cliState.maxConcurrency = opts.maxConcurrency;
  }
  logger.debug(shouldGenerateRemote() ? 'Remote generation enabled' : 'Remote generation disabled');
}

function parseGenerateOverrides(
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
  if (parsed.success) {
    return parsed.data;
  }

  logger.error('Invalid options:');
  parsed.error.issues.forEach((err: z.ZodIssue) => {
    logger.error(`  ${err.path.join('.')}: ${err.message}`);
  });
  process.exitCode = 1;
  return null;
}

function logGenerateError(error: unknown): void {
  if (error instanceof z.ZodError) {
    logger.error('Invalid options:');
    error.issues.forEach((err: z.ZodIssue) => {
      logger.error(`  ${err.path.join('.')}: ${err.message}`);
    });
    return;
  }
  if (error instanceof ConfigResolutionError) {
    logConfigResolutionError(error);
    return;
  }
  if (error instanceof EmailValidationError || error instanceof ProbeLimitExceededError) {
    return;
  }

  logger.error(
    error instanceof Error && error.stack
      ? error.stack
      : `An unexpected error occurred during generation: ${error instanceof Error ? error.message : String(error)}`,
  );
}

async function handleRedteamGenerateAction(
  opts: Partial<RedteamCliGenerateOptions>,
  defaultConfig: Partial<UnifiedConfig>,
  defaultConfigPath: string | undefined,
): Promise<void> {
  if (!(await hydrateCloudGenerateOptions(opts))) {
    return;
  }

  applyCliStateOverrides(opts);
  try {
    const overrides = parseGenerateOverrides(opts);
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
    logGenerateError(error);
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
    .action(
      (opts: Partial<RedteamCliGenerateOptions>): Promise<void> =>
        handleRedteamGenerateAction(opts, defaultConfig, defaultConfigPath),
    );
}
