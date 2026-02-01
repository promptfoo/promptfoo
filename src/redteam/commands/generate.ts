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
  let configPath = options.config || options.defaultConfigPath;
  const outputPath = options.output || 'redteam.yaml';
  let commandLineOptions: Record<string, any> | undefined;
  let resolvedConfig: Partial<UnifiedConfig> | undefined;

  // Write a remote config to a temporary file
  if (options.configFromCloud) {
    // Write configFromCloud to a temporary file
    const filename = `redteam-generate-${Date.now()}.yaml`;
    const tmpFile = path.join('', filename);
    fs.mkdirSync(path.dirname(tmpFile), { recursive: true });
    fs.writeFileSync(tmpFile, yaml.dump(options.configFromCloud));
    configPath = tmpFile;
    logger.debug(`Using Promptfoo Cloud-originated config at ${tmpFile}`);
  }

  // Check for updates to the config file and decide whether to generate
  let shouldGenerate = options.force || options.configFromCloud; // Always generate for live configs
  if (
    !options.force &&
    !options.configFromCloud &&
    fs.existsSync(outputPath) &&
    configPath &&
    fs.existsSync(configPath)
  ) {
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
    commandLineOptions = resolved.commandLineOptions;
    resolvedConfig = resolved.config;

    await checkCloudPermissions(resolved.config);

    // Warn if both tests section and redteam config are present
    if (redteamConfig && resolved.testSuite.tests && resolved.testSuite.tests.length > 0) {
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
          promptfooCommand('redteam init'),
        )} first`,
      ),
    );
    return null;
  }

  // Validate email for remote generation
  if (!neverGenerateRemote()) {
    let hasValidEmail = false;
    while (!hasValidEmail) {
      const { emailNeedsValidation } = await promptForEmailUnverified();
      const res = await checkEmailStatusAndMaybeExit({ validate: emailNeedsValidation });
      hasValidEmail = res === EMAIL_OK_STATUS;
    }
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
  telemetry.record('redteam generate', {
    phase: 'started',
    numPrompts: testSuite.prompts.length,
    numTestsExisting: (testSuite.tests || []).length,
    plugins: redteamConfig?.plugins?.map((p) => (typeof p === 'string' ? p : p.id)) || [],
    strategies: redteamConfig?.strategies?.map((s) => (typeof s === 'string' ? s : s.id)) || [],
    isPromptfooSampleTarget: testSuite.providers.some(isPromptfooSampleTarget),
  });

  let plugins: RedteamPluginObject[] = [];

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

  // Resolve policy references.
  // Each reference is an id of the policy record stored in Promptfoo Cloud; load their respective texts.
  // Only reusable policies (with UUID ids) need to be fetched; inline policies already have their text.
  const policyPluginsWithRefs = plugins.filter(
    (plugin) =>
      plugin.config?.policy &&
      isValidPolicyObject(plugin.config?.policy) &&
      determinePolicyTypeFromId(plugin.config.policy.id) === 'reusable',
  );
  if (policyPluginsWithRefs.length > 0) {
    // Always use the calling user's team id for fetching policies.
    // The server will return:
    // 1. Policies owned by the user's team
    // 2. Org-scoped policies (accessible to all teams in the org)
    // This allows users to run scans with org-scoped templates that reference
    // org-scoped policies, even if those policies are owned by a different team.
    const teamId = (await resolveTeamId()).id;

    const policiesById = await getCustomPolicies(policyPluginsWithRefs, teamId);

    // Assign, in-place, the policy texts and severities to the plugins
    for (const policyPlugin of policyPluginsWithRefs) {
      const policyId = (policyPlugin.config!.policy! as PolicyObject).id;
      const policyData = policiesById.get(policyId);
      if (policyData) {
        // Set the policy details
        policyPlugin.config!.policy = {
          id: policyId,
          name: policyData.name,
          text: policyData.text,
        } as PolicyObject;
        // Set the plugin severity if it hasn't been set already; this allows the user to override the severity
        // on a per-config basis if necessary.
        if (policyPlugin.severity == null) {
          policyPlugin.severity = policyData.severity;
        }
      }
    }
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

  // Read inputs from the first target/provider
  const targetInputs = testSuite.providers[0]?.inputs;

  const config = {
    injectVar: redteamConfig?.injectVar || options.injectVar,
    // Multi-variable inputs for test case generation (read from target)
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
  const parsedConfig = RedteamConfigSchema.safeParse(config);
  if (!parsedConfig.success) {
    const errorMessage = z.prettifyError(parsedConfig.error);
    throw new Error(`Invalid redteam configuration:\n${errorMessage}`);
  }

  // Extract target IDs from the config providers (targets get rewritten to providers)
  // IDs are used for retry strategy to match failed tests by target ID
  const targetIds: string[] =
    (Array.isArray(resolvedConfig?.providers)
      ? resolvedConfig.providers
          .filter((target) => typeof target !== 'function')
          .map((target) => {
            if (typeof target === 'string') {
              return target; // Use the provider string as ID
            }
            const providerObj = target as { id?: string };
            return providerObj.id;
          })
          .filter((id): id is string => typeof id === 'string')
      : []) ?? [];

  logger.debug(
    `Extracted ${targetIds.length} target IDs from config providers: ${JSON.stringify(targetIds)}`,
  );

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

  // Check for contexts - if present, generate tests for each context
  const contexts = redteamConfig?.contexts;
  let redteamTests: any[] = [];
  let purpose: string = enhancedPurpose;
  let entities: string[] = [];
  let finalInjectVar: string = '';

  if (contexts && contexts.length > 0) {
    // Multi-context mode: generate tests for each context
    logger.info(`Generating tests for ${contexts.length} contexts...`);

    // Collect failed plugins across all contexts
    const allFailedPlugins: { pluginId: string; requested: number }[] = [];

    for (const context of contexts) {
      logger.info(`  Generating tests for context: ${context.id}`);

      const contextPurpose = context.purpose + (enhancedPurpose ? `\n\n${enhancedPurpose}` : '');

      const contextResult = await synthesize({
        ...parsedConfig.data,
        inputs: targetInputs,
        purpose: contextPurpose,
        numTests: config.numTests,
        prompts: testSuite.prompts.map((prompt) => prompt.raw),
        maxConcurrency: config.maxConcurrency,
        delay: config.delay,
        abortSignal: options.abortSignal,
        targetIds,
        showProgressBar: options.progressBar !== false,
        testGenerationInstructions: augmentedTestGenerationInstructions,
      } as SynthesizeOptions);

      // Collect failed plugins from this context
      if (contextResult.failedPlugins.length > 0) {
        allFailedPlugins.push(...contextResult.failedPlugins);
      }

      // Tag each test with context metadata and merge context vars
      // IMPORTANT: Set metadata.purpose so graders and strategies use the correct context purpose
      const taggedTests = contextResult.testCases.map((test: any) => ({
        ...test,
        vars: {
          ...test.vars,
          ...(context.vars || {}),
        },
        metadata: {
          ...test.metadata,
          purpose: context.purpose, // Override purpose for graders/strategies
          contextId: context.id,
          contextVars: context.vars,
        },
      }));

      redteamTests = redteamTests.concat(taggedTests);

      // Keep track of entities and injectVar from first context
      if (!entities.length) {
        entities = contextResult.entities;
      }
      if (!finalInjectVar) {
        finalInjectVar = contextResult.injectVar;
      }
    }

    // Check for failed plugins across all contexts
    handleFailedPlugins(allFailedPlugins, options.strict ?? false);

    // Use first context's purpose for backward compatibility in output
    purpose = contexts[0].purpose;
    logger.info(
      `Generated ${redteamTests.length} total test cases across ${contexts.length} contexts`,
    );
  } else {
    // Single purpose mode (existing behavior)
    const result = await synthesize({
      ...parsedConfig.data,
      inputs: targetInputs,
      purpose: enhancedPurpose,
      numTests: config.numTests,
      prompts: testSuite.prompts.map((prompt) => prompt.raw),
      maxConcurrency: config.maxConcurrency,
      delay: config.delay,
      abortSignal: options.abortSignal,
      targetIds,
      showProgressBar: options.progressBar !== false,
      testGenerationInstructions: augmentedTestGenerationInstructions,
    } as SynthesizeOptions);

    // Check for failed plugins - warn by default, throw with --strict
    handleFailedPlugins(result.failedPlugins, options.strict ?? false);

    redteamTests = result.testCases;
    purpose = result.purpose;
    entities = result.entities;
    finalInjectVar = result.injectVar;
  }

  /**
   * Cleans up the provider after redteam generation completes.
   * This should always be called before returning, since providers are
   * re-initialized when running the red team. Cleanup is particularly
   * important for MCP servers to release resources and prevent memory leaks.
   */
  const cleanupProvider = async (): Promise<void> => {
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

  // Use try/finally to ensure cleanup runs even if an exception is thrown
  // (e.g., --strict mode failures, write errors)
  try {
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
    } else if (options.write && configPath) {
      const existingConfig = yaml.load(
        fs.readFileSync(configPath, 'utf8'),
      ) as Partial<UnifiedConfig>;
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
      if (options.description) {
        existingConfig.description = options.description;
      }
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
      const command = configPath.endsWith('promptfooconfig.yaml')
        ? promptfooCommand('eval')
        : promptfooCommand(`eval -c ${path.relative(process.cwd(), configPath)}`);
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

      ret = writePromptfooConfig(
        {
          ...(options.description ? { description: options.description } : {}),
          tests: redteamTests,
        },
        'redteam.yaml',
        headerComments,
      );
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
    telemetry.record('redteam generate', {
      phase: 'completed',
      duration: Math.round((Date.now() - startTime) / 1000),
      numPrompts: testSuite.prompts.length,
      numTestsExisting: (testSuite.tests || []).length,
      numTestsGenerated: redteamTests.length,
      plugins: plugins.map((p) => p.id),
      strategies: strategies.map((s) => (typeof s === 'string' ? s : s.id)),
      isPromptfooSampleTarget: testSuite.providers.some(isPromptfooSampleTarget),
    });

    return ret;
  } finally {
    await cleanupProvider();
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
      // Handle cloud config with target
      if (opts.config && isUuid(opts.config)) {
        // If target is provided, it must be a valid UUID. This check is nested because the target flag is mutually inclusive with a config that's set to a
        // Cloud-defined config UUID i.e. a cloud target cannot be used with a local config.
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
      } else if (opts.target) {
        logger.error(
          `Target ID (-t) can only be used when -c is used with a cloud config UUID. To use a cloud target inside of a config set the id of the target to ${CLOUD_PROVIDER_PREFIX}${opts.target}.`,
        );
        process.exitCode = 1;
        return;
      }

      if (opts.remote) {
        cliState.remote = true;
      }
      if (opts.maxConcurrency !== undefined) {
        cliState.maxConcurrency = opts.maxConcurrency;
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
            parsed.error.issues.forEach((err: z.ZodIssue) => {
              logger.error(`  ${err.path.join('.')}: ${err.message}`);
            });
            process.exitCode = 1;
            return;
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
        await doGenerateRedteam(validatedOpts);
      } catch (error) {
        if (error instanceof z.ZodError) {
          logger.error('Invalid options:');
          error.issues.forEach((err: z.ZodIssue) => {
            logger.error(`  ${err.path.join('.')}: ${err.message}`);
          });
        } else {
          // Log the stack trace, which already includes the error message
          logger.error(
            error instanceof Error && error.stack
              ? error.stack
              : `An unexpected error occurred during generation: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        process.exitCode = 1;
        return;
      } finally {
        // Reset cliState.maxConcurrency to prevent stale state
        cliState.maxConcurrency = undefined;
      }
    });
}
