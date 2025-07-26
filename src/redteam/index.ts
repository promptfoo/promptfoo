import * as fs from 'fs';

import async from 'async';
import chalk from 'chalk';
import cliProgress from 'cli-progress';
import Table from 'cli-table3';
import yaml from 'js-yaml';
import cliState from '../cliState';
import { getEnvString } from '../envars';
import logger, { getLogLevel } from '../logger';
import { isProviderOptions, type TestCase, type TestCaseWithPlugin } from '../types';
import { checkRemoteHealth } from '../util/apiHealth';
import invariant from '../util/invariant';
import { extractVariablesFromTemplates } from '../util/templates';
import {
  ALIASED_PLUGIN_MAPPINGS,
  BIAS_PLUGINS,
  FOUNDATION_PLUGINS,
  HARM_PLUGINS,
  PII_PLUGINS,
  riskCategorySeverityMap,
  Severity,
  STRATEGY_COLLECTION_MAPPINGS,
  STRATEGY_COLLECTIONS,
  STRATEGY_EXEMPT_PLUGINS,
} from './constants';
import { extractEntities } from './extraction/entities';
import { extractSystemPurpose } from './extraction/purpose';
import { Plugins } from './plugins';
import { CustomPlugin } from './plugins/custom';
import { redteamProviderManager } from './providers/shared';
import { getRemoteHealthUrl, shouldGenerateRemote } from './remoteGeneration';
import { loadStrategy, Strategies, validateStrategies } from './strategies';
import { DEFAULT_LANGUAGES } from './strategies/multilingual';
import { extractGoalFromPrompt, getShortPluginId } from './util';

import type { StrategyExemptPlugin } from './constants';
import type { RedteamStrategyObject, SynthesizeOptions } from './types';

/**
 * Gets the severity level for a plugin based on its ID and configuration.
 * @param pluginId - The ID of the plugin.
 * @param pluginConfig - Optional configuration for the plugin.
 * @returns The severity level.
 */
function getPluginSeverity(pluginId: string, pluginConfig?: Record<string, any>): Severity {
  if (pluginConfig?.severity) {
    return pluginConfig.severity;
  }

  const shortId = getShortPluginId(pluginId);
  return shortId in riskCategorySeverityMap
    ? riskCategorySeverityMap[shortId as keyof typeof riskCategorySeverityMap]
    : Severity.Low;
}

/**
 * Determines the status of test generation based on requested and generated counts.
 * @param requested - The number of requested tests.
 * @param generated - The number of generated tests.
 * @returns A colored string indicating the status.
 */
function getStatus(requested: number, generated: number): string {
  if (requested === 0 && generated === 0) {
    return chalk.gray('Skipped');
  }
  if (generated === 0) {
    return chalk.red('Failed');
  }
  if (generated < requested) {
    return chalk.yellow('Partial');
  }
  return chalk.green('Success');
}

/**
 * Generates a report of plugin and strategy results.
 * @param pluginResults - Results from plugin executions.
 * @param strategyResults - Results from strategy executions.
 * @returns A formatted string containing the report.
 */
function generateReport(
  pluginResults: Record<string, { requested: number; generated: number }>,
  strategyResults: Record<string, { requested: number; generated: number }>,
): string {
  const table = new Table({
    head: ['#', 'Type', 'ID', 'Requested', 'Generated', 'Status'].map((h) =>
      chalk.dim(chalk.white(h)),
    ),
    colWidths: [5, 10, 40, 12, 12, 14],
  });

  let rowIndex = 1;

  Object.entries(pluginResults)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([id, { requested, generated }]) => {
      table.push([rowIndex++, 'Plugin', id, requested, generated, getStatus(requested, generated)]);
    });

  Object.entries(strategyResults)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([id, { requested, generated }]) => {
      table.push([
        rowIndex++,
        'Strategy',
        id,
        requested,
        generated,
        getStatus(requested, generated),
      ]);
    });

  return `\nTest Generation Report:\n${table.toString()}`;
}

/**
 * Resolves top-level file paths in the plugin configuration.
 * @param config - The plugin configuration to resolve.
 * @returns The resolved plugin configuration.
 */
export function resolvePluginConfig(config: Record<string, any> | undefined): Record<string, any> {
  if (!config) {
    return {};
  }

  for (const key in config) {
    const value = config[key];
    if (typeof value === 'string' && value.startsWith('file://')) {
      const filePath = value.slice('file://'.length);

      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      if (filePath.endsWith('.yaml')) {
        config[key] = yaml.load(fs.readFileSync(filePath, 'utf8'));
      } else if (filePath.endsWith('.json')) {
        config[key] = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      } else {
        config[key] = fs.readFileSync(filePath, 'utf8');
      }
    }
  }
  return config;
}

const categories = {
  foundation: FOUNDATION_PLUGINS,
  harmful: Object.keys(HARM_PLUGINS),
  bias: BIAS_PLUGINS,
  pii: PII_PLUGINS,
} as const;

/**
 * Formats the test count for display.
 * @param numTests - The number of tests.
 * @param strategy - Whether the test count is for a strategy.
 * @returns A formatted string representing the test count.
 */
const formatTestCount = (numTests: number, strategy: boolean): string =>
  numTests === 1
    ? `1 ${strategy ? 'additional' : ''} test`
    : `${numTests} ${strategy ? 'additional' : ''} tests`;

/**
 * Determines whether a strategy should be applied to a test case based on plugin targeting rules.
 *
 * This function evaluates multiple criteria to decide if a strategy matches a test case:
 * - Excludes strategy-exempt plugins (defined in STRATEGY_EXEMPT_PLUGINS)
 * - Excludes sequence providers (which are verbatim and don't support strategies)
 * - Respects plugin-level strategy exclusions via excludeStrategies config
 * - Matches against target plugins through direct ID match or category prefixes
 *
 * @param testCase - The test case containing plugin metadata to evaluate
 * @param strategyId - The ID of the strategy being considered for application
 * @param targetPlugins - Optional array of plugin IDs or categories that the strategy targets.
 *                       If undefined or empty, strategy applies to all non-exempt plugins.
 *                       Supports both exact matches and category prefixes (e.g., 'harmful' matches 'harmful:hate')
 * @returns True if the strategy should be applied to this test case, false otherwise
 */
function pluginMatchesStrategyTargets(
  testCase: TestCaseWithPlugin,
  strategyId: string,
  targetPlugins?: NonNullable<RedteamStrategyObject['config']>['plugins'],
): boolean {
  const pluginId = testCase.metadata?.pluginId;
  if (STRATEGY_EXEMPT_PLUGINS.includes(pluginId as StrategyExemptPlugin)) {
    return false;
  }
  if (isProviderOptions(testCase.provider) && testCase.provider?.id === 'sequence') {
    // Sequence providers are verbatim and strategies don't apply
    return false;
  }

  // Check if this strategy is excluded for this plugin
  const excludedStrategies = testCase.metadata?.pluginConfig?.excludeStrategies as
    | string[]
    | undefined;
  if (Array.isArray(excludedStrategies) && excludedStrategies.includes(strategyId)) {
    return false;
  }

  if (!targetPlugins || targetPlugins.length === 0) {
    return true; // If no targets specified, strategy applies to all plugins
  }

  return targetPlugins.some((target) => {
    // Direct match
    if (target === pluginId) {
      return true;
    }

    // Category match (e.g. 'harmful' matches 'harmful:hate')
    if (pluginId.startsWith(`${target}:`)) {
      return true;
    }

    return false;
  });
}

/**
 * Helper function to calculate the number of expected test cases for the multilingual strategy.
 */
export function getMultilingualRequestedCount(
  testCases: TestCaseWithPlugin[],
  strategy: RedteamStrategyObject,
): number {
  // If languages is an empty array, return 0
  if (Array.isArray(strategy.config?.languages) && strategy.config.languages.length === 0) {
    return 0;
  }

  const numLanguages = Array.isArray(strategy.config?.languages)
    ? strategy.config.languages.length
    : DEFAULT_LANGUAGES.length;
  return testCases.length * numLanguages;
}

/**
 * Applies strategies to the test cases.
 * @param testCases - The initial test cases generated by plugins.
 * @param strategies - The strategies to apply.
 * @param injectVar - The variable to inject.
 * @returns An array of new test cases generated by strategies.
 */
async function applyStrategies(
  testCases: TestCaseWithPlugin[],
  strategies: RedteamStrategyObject[],
  injectVar: string,
  excludeTargetOutputFromAgenticAttackGeneration?: boolean,
): Promise<{
  testCases: TestCaseWithPlugin[];
  strategyResults: Record<string, { requested: number; generated: number }>;
}> {
  const newTestCases: TestCaseWithPlugin[] = [];
  const strategyResults: Record<string, { requested: number; generated: number }> = {};

  for (const strategy of strategies) {
    logger.debug(`Generating ${strategy.id} tests`);

    let strategyAction;
    if (strategy.id.startsWith('file://')) {
      const loadedStrategy = await loadStrategy(strategy.id);
      strategyAction = loadedStrategy.action;
    } else {
      // First try to find the exact strategy ID (e.g., jailbreak:composite)
      let builtinStrategy = Strategies.find((s) => s.id === strategy.id);

      // If not found, handle custom strategy variants (e.g., custom:aggressive)
      if (!builtinStrategy && strategy.id.includes(':')) {
        const baseStrategyId = strategy.id.split(':')[0];
        builtinStrategy = Strategies.find((s) => s.id === baseStrategyId);
      }

      if (!builtinStrategy) {
        logger.warn(`Strategy ${strategy.id} not registered, skipping`);
        continue;
      }
      strategyAction = builtinStrategy.action;
    }

    const targetPlugins = strategy.config?.plugins;
    const applicableTestCases = testCases.filter((t) =>
      pluginMatchesStrategyTargets(t, strategy.id, targetPlugins),
    );

    const strategyTestCases: TestCase[] = await strategyAction(
      applicableTestCases,
      injectVar,
      {
        ...(strategy.config || {}),
        excludeTargetOutputFromAgenticAttackGeneration,
      },
      strategy.id,
    );

    newTestCases.push(
      ...strategyTestCases
        .filter((t): t is NonNullable<typeof t> => t !== null && t !== undefined)
        .map((t) => ({
          ...t,
          metadata: {
            ...(t?.metadata || {}),
            strategyId: t?.metadata?.strategyId || strategy.id,
            ...(t?.metadata?.pluginId && { pluginId: t.metadata.pluginId }),
            ...(t?.metadata?.pluginConfig && { pluginConfig: t.metadata.pluginConfig }),
            ...(strategy.config && {
              strategyConfig: { ...strategy.config, ...(t?.metadata?.strategyConfig || {}) },
            }),
          },
        })),
    );

    // Special case for multilingual strategy to account for languages multiplier
    if (strategy.id === 'multilingual') {
      const requestedCount = getMultilingualRequestedCount(applicableTestCases, strategy);
      strategyResults[strategy.id] = {
        requested: requestedCount,
        generated: strategyTestCases.length,
      };
    } else {
      strategyResults[strategy.id] = {
        requested: applicableTestCases.length,
        generated: strategyTestCases.length,
      };
    }
  }

  return { testCases: newTestCases, strategyResults };
}

/**
 * Helper function to get the test count based on strategy configuration.
 * @param strategy - The strategy object to evaluate.
 * @param totalPluginTests - The total number of plugin tests.
 * @param strategies - The array of strategies.
 * @returns The calculated test count.
 */
export function getTestCount(
  strategy: RedteamStrategyObject,
  totalPluginTests: number,
  strategies: RedteamStrategyObject[],
): number {
  // Basic strategy either keeps original count or removes all tests
  if (strategy.id === 'basic') {
    return strategy.config?.enabled === false ? 0 : totalPluginTests;
  }

  // Multilingual strategy doubles the total count
  if (strategy.id === 'multilingual') {
    // If languages is an empty array, return 0
    if (Array.isArray(strategy.config?.languages) && strategy.config.languages.length === 0) {
      return 0;
    }
    const numLanguages =
      Object.keys(strategy.config?.languages ?? {}).length || DEFAULT_LANGUAGES.length;
    return totalPluginTests * numLanguages;
  }

  // Retry strategy doubles the plugin tests
  if (strategy.id === 'retry') {
    const configuredNumTests = strategy.config?.numTests as number | undefined;
    const additionalTests = configuredNumTests ?? totalPluginTests;
    return totalPluginTests + additionalTests;
  }

  // Return the number of additional tests (equal to totalPluginTests) for these strategies
  return totalPluginTests;
}

/**
 * Calculates the total number of tests to be generated based on plugins and strategies.
 * @param plugins - The array of plugins to generate tests for
 * @param strategies - The array of strategies to apply
 * @returns Object containing total tests and intermediate calculations
 */
export function calculateTotalTests(
  plugins: SynthesizeOptions['plugins'],
  strategies: RedteamStrategyObject[],
): {
  effectiveStrategyCount: number;
  includeBasicTests: boolean;
  multilingualStrategy: RedteamStrategyObject | undefined;
  totalPluginTests: number;
  totalTests: number;
} {
  const multilingualStrategy = strategies.find((s) => s.id === 'multilingual');
  const retryStrategy = strategies.find((s) => s.id === 'retry');
  const basicStrategy = strategies.find((s) => s.id === 'basic');

  const basicStrategyExists = basicStrategy !== undefined;
  const includeBasicTests = basicStrategy?.config?.enabled ?? true;

  const effectiveStrategyCount =
    basicStrategyExists && !includeBasicTests ? strategies.length - 1 : strategies.length;

  const totalPluginTests = plugins.reduce((sum, p) => sum + (p.numTests || 0), 0);

  // When there are no strategies, or only a disabled basic strategy
  if (
    strategies.length === 0 ||
    (strategies.length === 1 && basicStrategyExists && !includeBasicTests)
  ) {
    return {
      effectiveStrategyCount: 0,
      includeBasicTests: strategies.length === 0 ? true : includeBasicTests,
      multilingualStrategy: undefined,
      totalPluginTests,
      totalTests: includeBasicTests ? totalPluginTests : 0,
    };
  }

  // Start with base test count from basic strategy
  let totalTests = includeBasicTests ? totalPluginTests : 0;

  // Apply retry strategy first if present
  if (retryStrategy) {
    totalTests = getTestCount(retryStrategy, totalTests, strategies);
  }

  // Apply other non-basic, non-multilingual, non-retry strategies
  for (const strategy of strategies) {
    if (['basic', 'multilingual', 'retry'].includes(strategy.id)) {
      continue;
    }
    // Add the tests from this strategy to the total, not replace the total
    totalTests += getTestCount(strategy, totalPluginTests, strategies);
  }

  // Apply multilingual strategy last if present
  if (multilingualStrategy) {
    totalTests = getTestCount(multilingualStrategy, totalTests, strategies);
  }

  return {
    effectiveStrategyCount,
    includeBasicTests,
    multilingualStrategy,
    totalPluginTests,
    totalTests,
  };
}

/**
 * Type guard to check if a strategy ID is a strategy collection
 */
function isStrategyCollection(id: string): id is keyof typeof STRATEGY_COLLECTION_MAPPINGS {
  return STRATEGY_COLLECTIONS.includes(id as keyof typeof STRATEGY_COLLECTION_MAPPINGS);
}

/**
 * Synthesizes test cases based on provided options.
 * @param options - The options for test case synthesis.
 * @returns A promise that resolves to an object containing the purpose, entities, and test cases.
 */
export async function synthesize({
  abortSignal,
  delay,
  entities: entitiesOverride,
  injectVar,
  language,
  maxConcurrency = 1,
  plugins,
  prompts,
  provider,
  purpose: purposeOverride,
  strategies,
  targetLabels,
  showProgressBar: showProgressBarOverride,
  excludeTargetOutputFromAgenticAttackGeneration,
  testGenerationInstructions,
}: SynthesizeOptions): Promise<{
  purpose: string;
  entities: string[];
  testCases: TestCaseWithPlugin[];
  injectVar: string;
}> {
  // Add abort check helper
  const checkAbort = () => {
    if (abortSignal?.aborted) {
      throw new Error('Operation cancelled');
    }
  };

  // Add abort checks at key points
  checkAbort();

  if (prompts.length === 0) {
    throw new Error('Prompts array cannot be empty');
  }
  if (delay && maxConcurrency > 1) {
    maxConcurrency = 1;
    logger.warn('Delay is enabled, setting max concurrency to 1.');
  }

  const expandedStrategies: typeof strategies = [];
  strategies.forEach((strategy) => {
    if (isStrategyCollection(strategy.id)) {
      const aliasedStrategies = STRATEGY_COLLECTION_MAPPINGS[strategy.id];
      if (aliasedStrategies) {
        aliasedStrategies.forEach((strategyId) => {
          expandedStrategies.push({
            ...strategy,
            id: strategyId,
          });
        });
      } else {
        logger.warn(`Strategy collection ${strategy.id} has no mappings, skipping`);
      }
    } else {
      expandedStrategies.push(strategy);
    }
  });

  // Deduplicate strategies by id
  const seen = new Set<string>();
  strategies = expandedStrategies.filter((strategy) => {
    if (seen.has(strategy.id)) {
      return false;
    }
    seen.add(strategy.id);
    return true;
  });

  validateStrategies(strategies);

  const redteamProvider = await redteamProviderManager.getProvider({ provider });

  const {
    effectiveStrategyCount,
    includeBasicTests,
    multilingualStrategy,
    totalPluginTests,
    totalTests,
  } = calculateTotalTests(plugins, strategies);

  logger.info(
    `Synthesizing test cases for ${prompts.length} ${
      prompts.length === 1 ? 'prompt' : 'prompts'
    }...\nUsing plugins:\n\n${chalk.yellow(
      plugins
        .map(
          (p) =>
            `${p.id} (${formatTestCount(p.numTests, false)})${p.config ? ` (${JSON.stringify(p.config)})` : ''}`,
        )
        .sort()
        .join('\n'),
    )}\n`,
  );
  if (strategies.length > 0) {
    logger.info(
      `Using strategies:\n\n${chalk.yellow(
        strategies
          .filter((s) => !['basic', 'retry'].includes(s.id))
          .map((s) => {
            // For non-basic, non-multilingual strategies, we want to show the additional tests they generate
            const testCount =
              s.id === 'multilingual'
                ? getTestCount(s, totalPluginTests, strategies)
                : totalPluginTests;
            return `${s.id} (${formatTestCount(testCount, true)})`;
          })
          .sort()
          .join('\n'),
      )}\n`,
    );
  }

  logger.info(
    chalk.bold(`Test Generation Summary:`) +
      `\n• Total tests: ${chalk.cyan(totalTests)}` +
      `\n• Plugin tests: ${chalk.cyan(totalPluginTests)}` +
      `\n• Plugins: ${chalk.cyan(plugins.length)}` +
      `\n• Strategies: ${chalk.cyan(effectiveStrategyCount)}` +
      `\n• Max concurrency: ${chalk.cyan(maxConcurrency)}\n` +
      (delay ? `• Delay: ${chalk.cyan(delay)}\n` : ''),
  );

  if (typeof injectVar !== 'string') {
    const parsedVars = extractVariablesFromTemplates(prompts);
    if (parsedVars.length > 1) {
      logger.warn(
        `\nMultiple variables found in prompts: ${parsedVars.join(', ')}. Using the last one "${parsedVars[parsedVars.length - 1]}". Override this selection with --injectVar`,
      );
    } else if (parsedVars.length === 0) {
      logger.warn('No variables found in prompts. Using "query" as the inject variable.');
    }
    // Odds are that the last variable is the user input since the user input usually goes at the end of the prompt
    injectVar = parsedVars[parsedVars.length - 1] || 'query';
    invariant(typeof injectVar === 'string', `Inject var must be a string, got ${injectVar}`);
  }

  // Expand plugins first
  for (const [category, categoryPlugins] of Object.entries(categories)) {
    const plugin = plugins.find((p) => p.id === category);
    if (plugin) {
      plugins.push(...categoryPlugins.map((p) => ({ id: p, numTests: plugin.numTests })));
    }
  }

  const expandedPlugins: typeof plugins = [];
  const expandPlugin = (
    plugin: (typeof plugins)[0],
    mapping: { plugins: string[]; strategies: string[] },
  ) => {
    mapping.plugins.forEach((p: string) =>
      expandedPlugins.push({ id: p, numTests: plugin.numTests }),
    );
    strategies.push(...mapping.strategies.map((s: string) => ({ id: s })));
  };

  plugins.forEach((plugin) => {
    // First check if this is a direct plugin that should not be expanded
    // This is for plugins like bias:gender that have a prefix matching an alias
    const isDirectPlugin = Plugins.some((p) => p.key === plugin.id);

    if (isDirectPlugin) {
      expandedPlugins.push(plugin);
      return;
    }

    const mappingKey = Object.keys(ALIASED_PLUGIN_MAPPINGS).find(
      (key) => plugin.id === key || plugin.id.startsWith(`${key}:`),
    );

    if (mappingKey) {
      const mapping =
        ALIASED_PLUGIN_MAPPINGS[mappingKey][plugin.id] ||
        Object.values(ALIASED_PLUGIN_MAPPINGS[mappingKey]).find((m) =>
          plugin.id.startsWith(`${mappingKey}:`),
        );
      if (mapping) {
        expandPlugin(plugin, mapping);
      }
    } else {
      expandedPlugins.push(plugin);
    }
  });

  const validatePlugin: (plugin: (typeof plugins)[0]) => boolean = (plugin) => {
    if (Object.keys(categories).includes(plugin.id)) {
      return false;
    }
    const registeredPlugin = Plugins.find((p) => p.key === plugin.id);

    if (!registeredPlugin) {
      if (!plugin.id.startsWith('file://')) {
        logger.debug(`Plugin ${plugin.id} not registered, skipping validation`);
      }
    } else if (registeredPlugin.validate) {
      try {
        registeredPlugin.validate({
          language,
          modifiers: {
            ...(testGenerationInstructions ? { testGenerationInstructions } : {}),
            ...(plugin.config?.modifiers || {}),
          },
          ...resolvePluginConfig(plugin.config),
        });
      } catch (error) {
        logger.warn(`Validation failed for plugin ${plugin.id}: ${error}, skipping plugin.`);
        return false;
      }
    }

    return true;
  };

  // Validate all plugins upfront
  logger.debug('Validating plugins...');
  plugins = [...new Set(expandedPlugins)].filter(validatePlugin).sort();

  // Check API health before proceeding
  if (shouldGenerateRemote()) {
    const healthUrl = getRemoteHealthUrl();
    if (healthUrl) {
      logger.debug(`Checking Promptfoo API health at ${healthUrl}...`);
      const healthResult = await checkRemoteHealth(healthUrl);
      if (healthResult.status !== 'OK') {
        throw new Error(
          `Unable to proceed with test generation: ${healthResult.message}\n` +
            'Please check your API configuration or try again later.',
        );
      }
      logger.debug('API health check passed');
    }
  }

  // Start the progress bar
  let progressBar: cliProgress.SingleBar | null = null;
  const isWebUI = Boolean(cliState.webUI);

  const showProgressBar =
    !isWebUI &&
    getEnvString('LOG_LEVEL') !== 'debug' &&
    getLogLevel() !== 'debug' &&
    showProgressBarOverride !== false;
  if (showProgressBar) {
    progressBar = new cliProgress.SingleBar(
      {
        format: 'Generating | {bar} | {percentage}% | {value}/{total} | {task}',
        gracefulExit: true,
      },
      cliProgress.Presets.shades_classic,
    );
    progressBar.start(totalPluginTests + 2, 0, { task: 'Initializing' });
  }

  // Replace progress bar updates with logger calls when in web UI
  if (showProgressBar) {
    progressBar?.increment(1, { task: 'Extracting system purpose' });
  } else {
    logger.info('Extracting system purpose...');
  }
  const purpose = purposeOverride || (await extractSystemPurpose(redteamProvider, prompts));

  if (showProgressBar) {
    progressBar?.increment(1, { task: 'Extracting entities' });
  } else {
    logger.info('Extracting entities...');
  }
  const entities: string[] = Array.isArray(entitiesOverride)
    ? entitiesOverride
    : await extractEntities(redteamProvider, prompts);

  logger.debug(`System purpose: ${purpose}`);

  const pluginResults: Record<string, { requested: number; generated: number }> = {};
  const testCases: TestCaseWithPlugin[] = [];
  await async.forEachLimit(plugins, maxConcurrency, async (plugin) => {
    // Check for abort signal before generating tests
    checkAbort();

    if (showProgressBar) {
      progressBar?.update({ task: plugin.id });
    } else {
      logger.info(`Generating tests for ${plugin.id}...`);
    }
    const { action } = Plugins.find((p) => p.key === plugin.id) || {};

    if (action) {
      logger.debug(`Generating tests for ${plugin.id}...`);
      let pluginTests = await action({
        provider: redteamProvider,
        purpose,
        injectVar,
        n: plugin.numTests,
        delayMs: delay || 0,
        config: {
          language,
          modifiers: {
            ...(testGenerationInstructions ? { testGenerationInstructions } : {}),
            ...(plugin.config?.modifiers || {}),
          },
          ...resolvePluginConfig(plugin.config),
        },
      });

      if (!Array.isArray(pluginTests) || pluginTests.length === 0) {
        logger.warn(`Failed to generate tests for ${plugin.id}`);
        pluginTests = [];
      } else {
        // Add metadata to each test case
        const testCasesWithMetadata = pluginTests.map((t) => ({
          ...t,
          metadata: {
            pluginId: plugin.id,
            pluginConfig: resolvePluginConfig(plugin.config),
            severity:
              plugin.severity ?? getPluginSeverity(plugin.id, resolvePluginConfig(plugin.config)),
            ...(t?.metadata || {}),
          },
        }));

        // Extract goal for this plugin's tests
        logger.debug(
          `Extracting goal for ${testCasesWithMetadata.length} tests from ${plugin.id}...`,
        );
        for (const testCase of testCasesWithMetadata) {
          // Get the prompt from the specific inject variable
          const promptVar = testCase.vars?.[injectVar];
          const prompt = Array.isArray(promptVar) ? promptVar[0] : String(promptVar);

          const extractedGoal = await extractGoalFromPrompt(prompt, purpose, plugin.id);

          (testCase.metadata as any).goal = extractedGoal;
        }

        // Add the results to main test cases array
        testCases.push(...testCasesWithMetadata);
      }

      pluginTests = Array.isArray(pluginTests) ? pluginTests : [];
      if (showProgressBar) {
        progressBar?.increment(plugin.numTests);
      } else {
        logger.info(`Generated ${pluginTests.length} tests for ${plugin.id}`);
      }
      logger.debug(`Added ${pluginTests.length} ${plugin.id} test cases`);
      pluginResults[plugin.id] = {
        requested: plugin.id === 'intent' ? pluginTests.length : plugin.numTests,
        generated: pluginTests.length,
      };
    } else if (plugin.id.startsWith('file://')) {
      try {
        const customPlugin = new CustomPlugin(redteamProvider, purpose, injectVar, plugin.id);
        const customTests = await customPlugin.generateTests(plugin.numTests, delay);

        // Add metadata to each test case
        const testCasesWithMetadata = customTests.map((t) => ({
          ...t,
          metadata: {
            pluginId: plugin.id,
            pluginConfig: resolvePluginConfig(plugin.config),
            severity:
              plugin.severity || getPluginSeverity(plugin.id, resolvePluginConfig(plugin.config)),
            ...(t.metadata || {}),
          },
        }));

        // Extract goal for this plugin's tests
        logger.debug(
          `Extracting goal for ${testCasesWithMetadata.length} custom tests from ${plugin.id}...`,
        );
        for (const testCase of testCasesWithMetadata) {
          // Get the prompt from the specific inject variable
          const promptVar = testCase.vars?.[injectVar];
          const prompt = Array.isArray(promptVar) ? promptVar[0] : String(promptVar);

          const extractedGoal = await extractGoalFromPrompt(prompt, purpose, plugin.id);

          (testCase.metadata as any).goal = extractedGoal;
        }

        // Add the results to main test cases array
        testCases.push(...testCasesWithMetadata);

        logger.debug(`Added ${customTests.length} custom test cases from ${plugin.id}`);
        pluginResults[plugin.id] = { requested: plugin.numTests, generated: customTests.length };
      } catch (e) {
        logger.error(`Error generating tests for custom plugin ${plugin.id}: ${e}`);
        pluginResults[plugin.id] = { requested: plugin.numTests, generated: 0 };
      }
    } else {
      logger.warn(`Plugin ${plugin.id} not registered, skipping`);
      pluginResults[plugin.id] = { requested: plugin.numTests, generated: 0 };
      progressBar?.increment(plugin.numTests);
    }
  });

  // After generating plugin test cases but before applying strategies:
  const pluginTestCases = testCases;

  // Initialize strategy results
  const strategyResults: Record<string, { requested: number; generated: number }> = {};

  // Apply retry strategy first if it exists
  const retryStrategy = strategies.find((s) => s.id === 'retry');
  if (retryStrategy) {
    logger.debug('Applying retry strategy first');
    retryStrategy.config = {
      targetLabels,
      ...retryStrategy.config,
    };
    const { testCases: retryTestCases, strategyResults: retryResults } = await applyStrategies(
      pluginTestCases,
      [retryStrategy],
      injectVar,
    );
    pluginTestCases.push(...retryTestCases);
    Object.assign(strategyResults, retryResults);
  }

  // Check for abort signal or apply non-basic, non-multilingual strategies
  checkAbort();
  const { testCases: strategyTestCases, strategyResults: otherStrategyResults } =
    await applyStrategies(
      pluginTestCases,
      strategies.filter((s) => !['basic', 'multilingual', 'retry'].includes(s.id)),
      injectVar,
      excludeTargetOutputFromAgenticAttackGeneration,
    );

  Object.assign(strategyResults, otherStrategyResults);

  // Combine test cases based on basic strategy setting
  const finalTestCases = [...(includeBasicTests ? pluginTestCases : []), ...strategyTestCases];

  // Check for abort signal or apply multilingual strategy to all test cases
  checkAbort();
  if (multilingualStrategy) {
    const { testCases: multiLingualTestCases, strategyResults: multiLingualResults } =
      await applyStrategies(finalTestCases, [multilingualStrategy], injectVar);
    finalTestCases.push(...multiLingualTestCases);
    Object.assign(strategyResults, multiLingualResults);
  }

  progressBar?.update({ task: 'Done.' });
  progressBar?.stop();
  if (progressBar) {
    // Newline after progress bar to avoid overlap
    logger.info('');
  }

  logger.info(generateReport(pluginResults, strategyResults));

  return { purpose, entities, testCases: finalTestCases, injectVar };
}
