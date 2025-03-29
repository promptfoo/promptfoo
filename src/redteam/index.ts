import async from 'async';
import chalk from 'chalk';
import cliProgress from 'cli-progress';
import Table from 'cli-table3';
import * as fs from 'fs';
import yaml from 'js-yaml';
import cliState from '../cliState';
import logger, { getLogLevel } from '../logger';
import { isProviderOptions, type TestCase, type TestCaseWithPlugin } from '../types';
import { checkRemoteHealth } from '../util/apiHealth';
import invariant from '../util/invariant';
import { extractVariablesFromTemplates } from '../util/templates';
import type { StrategyExemptPlugin } from './constants';
import {
  HARM_PLUGINS,
  PII_PLUGINS,
  ALIASED_PLUGIN_MAPPINGS,
  STRATEGY_EXEMPT_PLUGINS,
  FOUNDATION_PLUGINS,
} from './constants';
import { extractEntities } from './extraction/entities';
import { extractSystemPurpose } from './extraction/purpose';
import { Plugins } from './plugins';
import { CustomPlugin } from './plugins/custom';
import { redteamProviderManager } from './providers/shared';
import { getRemoteHealthUrl, shouldGenerateRemote } from './remoteGeneration';
import { loadStrategy, Strategies, validateStrategies } from './strategies';
import { DEFAULT_LANGUAGES } from './strategies/multilingual';
import type { RedteamStrategyObject, SynthesizeOptions } from './types';
import { loadFile } from '../util/fileLoader';

/**
 * Determines the status of test generation based on requested and generated counts.
 * @param requested - The number of requested tests.
 * @param generated - The number of generated tests.
 * @returns A colored string indicating the status.
 */
function getStatus(requested: number, generated: number): string {
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
    head: ['#', 'Type', 'ID', 'Requested', 'Generated', 'Status'],
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
export async function resolvePluginConfig(config: Record<string, any> | undefined): Promise<Record<string, any>> {
  if (!config) {
    return {};
  }

  const resolvedConfig = { ...config };
  
  for (const key in resolvedConfig) {
    const value = resolvedConfig[key];
    if (typeof value === 'string' && value.startsWith('file://')) {
      const filePath = value.slice('file://'.length);

      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      resolvedConfig[key] = await loadFile(filePath);
    }
  }
  return resolvedConfig;
}

const categories = {
  foundation: FOUNDATION_PLUGINS,
  harmful: Object.keys(HARM_PLUGINS),
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
 * Checks if a plugin matches any of the strategy's target plugins
 * @param pluginId - The ID of the plugin to check
 * @param targetPlugins - Optional array of plugin IDs to match against
 */
function pluginMatchesStrategyTargets(
  testCase: TestCaseWithPlugin,
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
      const builtinStrategy = Strategies.find((s) => s.id === strategy.id);
      if (!builtinStrategy) {
        logger.warn(`Strategy ${strategy.id} not registered, skipping`);
        continue;
      }
      strategyAction = builtinStrategy.action;
    }

    const targetPlugins = strategy.config?.plugins;
    const applicableTestCases = testCases.filter((t) =>
      pluginMatchesStrategyTargets(t, targetPlugins),
    );

    const strategyTestCases: TestCase[] = await strategyAction(
      applicableTestCases,
      injectVar,
      strategy.config || {},
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

    strategyResults[strategy.id] = {
      requested: applicableTestCases.length,
      generated: strategyTestCases.length,
    };
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

  // All other strategies add the same number as plugin tests
  return totalPluginTests * 2;
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
    totalTests = getTestCount(strategy, totalPluginTests, strategies);
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
          .filter((s) => s.id !== 'basic')
          .map((s) => {
            const testCount = getTestCount(s, totalPluginTests, strategies);
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
  const expandPlugin = async (
    plugin: (typeof plugins)[0],
    mapping: { plugins: string[]; strategies: string[] },
  ) => {
    logger.debug(`Expanding plugin: ${plugin}`);
    const pluginId = typeof plugin === 'string' ? plugin : plugin.id;
    
    // Special case for plugins in categories
    if (pluginId.startsWith('category:')) {
      const category = pluginId.slice('category:'.length) as keyof typeof categories;
      logger.debug(`Expanding category ${category}`);
      if (categories[category]) {
        const expanded = categories[category].map((id) => ({
          id,
          // Update to await resolvePluginConfig
          config: typeof plugin === 'string' ? {} : plugin.config,
        }));
        logger.debug(`Expanded ${category} to: ${expanded.map((e) => e.id).join(', ')}`);
        mapping.plugins.push(...expanded.map((e) => e.id));
        return expanded;
      }
      logger.warn(`Unknown category: ${category}`);
    }
    
    // Lines 605 and 632 - Make sure these are awaited
    // In the Custom plugin section
    if (
      (typeof plugin === 'object' && plugin.id === 'custom') ||
      pluginId === 'custom'
    ) {
      logger.debug(`Processing custom plugin`);
      const thePlugin = new CustomPlugin();
      // Update to await resolvePluginConfig
      const pluginConfig = await resolvePluginConfig(typeof plugin === 'object' ? plugin.config : undefined);
      
      // ... existing code ...
    }
    
    // ... existing code ...
    
    // Near line 632, in the HarmPlugin section and others
    const thePlugin = resolvePlugin(pluginId);
    if (thePlugin) {
      logger.debug(`Using registered plugin ${pluginId}`);
      mapping.plugins.push(pluginId);
      return [
        {
          id: pluginId,
          // Update to await resolvePluginConfig
          pluginConfig: await resolvePluginConfig(typeof plugin === 'object' ? plugin.config : undefined),
        },
      ];
    }
    
    // ... existing code ...
  };
  
  // ... existing code ...
}
