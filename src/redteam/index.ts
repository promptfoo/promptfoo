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
import { HARM_PLUGINS, PII_PLUGINS, ALIASED_PLUGIN_MAPPINGS } from './constants';
import { extractEntities } from './extraction/entities';
import { extractSystemPurpose } from './extraction/purpose';
import { Plugins } from './plugins';
import { CustomPlugin } from './plugins/custom';
import { redteamProviderManager } from './providers/shared';
import { getRemoteHealthUrl, shouldGenerateRemote } from './remoteGeneration';
import { loadStrategy, Strategies, validateStrategies } from './strategies';
import { DEFAULT_LANGUAGES } from './strategies/multilingual';
import type { RedteamStrategyObject, SynthesizeOptions } from './types';

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
  harmful: Object.keys(HARM_PLUGINS),
  pii: PII_PLUGINS,
} as const;

/**
 * Formats the test count for display.
 * @param numTests - The number of tests.
 * @returns A formatted string representing the test count.
 */
const formatTestCount = (numTests: number): string =>
  numTests === 1 ? '1 test' : `${numTests} tests`;

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
  if (pluginId === 'pliny') {
    // Pliny jailbreaks stand alone.
    return false;
  }
  if (
    pluginId === 'intent' &&
    isProviderOptions(testCase.provider) &&
    testCase.provider?.id === 'sequence'
  ) {
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
  if (strategy.id === 'basic' && !strategy.config?.enabled) {
    return 0; // Return 0 tests if basic strategy is disabled
  }
  if (strategy.id === 'multilingual') {
    return (
      totalPluginTests *
      (Math.max(strategies.length, 1) *
        (Object.keys(strategy.config?.languages ?? {}).length || DEFAULT_LANGUAGES.length))
    );
  }
  return totalPluginTests; // Default case
}

/**
 * Synthesizes test cases based on provided options.
 * @param options - The options for test case synthesis.
 * @returns A promise that resolves to an object containing the purpose, entities, and test cases.
 */
export async function synthesize({
  entities: entitiesOverride,
  injectVar,
  language,
  maxConcurrency = 1,
  plugins,
  prompts,
  provider,
  purpose: purposeOverride,
  strategies,
  delay,
  abortSignal,
}: SynthesizeOptions): Promise<{
  purpose: string;
  entities: string[];
  testCases: TestCaseWithPlugin[];
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

  // We need to know how many languages we're generating for
  // We generate multilingual attacks for all of our test cases so it's plugins * strategies * languages
  const multilingualStrategy = strategies.find((s) => s.id === 'multilingual');
  const numLanguages = multilingualStrategy
    ? Object.keys(multilingualStrategy?.config?.languages ?? {}).length || DEFAULT_LANGUAGES.length
    : 1;

  logger.info(
    `Synthesizing test cases for ${prompts.length} ${
      prompts.length === 1 ? 'prompt' : 'prompts'
    }...\nUsing plugins:\n\n${chalk.yellow(
      plugins
        .map(
          (p) =>
            `${p.id} (${formatTestCount(p.numTests)})${p.config ? ` (${JSON.stringify(p.config)})` : ''}`,
        )
        .sort()
        .join('\n'),
    )}\n`,
  );
  if (strategies.length > 0) {
    const totalPluginTests = plugins.reduce((sum, p) => sum + (p.numTests || 0), 0);

    logger.info(
      `Using strategies:\n\n${chalk.yellow(
        strategies
          .map((s) => {
            const testCount = getTestCount(s, totalPluginTests, strategies);
            return `${s.id} (${formatTestCount(testCount)})`;
          })
          .sort()
          .join('\n'),
      )}\n`,
    );
  }

  // Find if basic strategy is disabled
  const basicStrategy = strategies.find((s) => s.id === 'basic');
  const includeBasicTests = basicStrategy?.config?.enabled ?? true;

  const totalPluginTests = plugins.reduce((sum, p) => sum + (p.numTests || 0), 0);

  const totalTests =
    totalPluginTests * (strategies.length + (includeBasicTests ? 1 : -1)) * numLanguages;

  logger.info(
    chalk.bold(`Test Generation Summary:`) +
      `\n• Total tests: ${chalk.cyan(totalTests)}` +
      `\n• Plugin tests: ${chalk.cyan(totalPluginTests)}` +
      `\n• Plugins: ${chalk.cyan(plugins.length)}` +
      `\n• Strategies: ${chalk.cyan(includeBasicTests ? strategies.length : strategies.length - 1)}` +
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

  plugins = [...new Set(expandedPlugins)]
    .filter((p) => !Object.keys(categories).includes(p.id))
    .sort();

  // Validate all plugins upfront
  logger.debug('Validating plugins...');
  for (const plugin of plugins) {
    const registeredPlugin = Plugins.find((p) => p.key === plugin.id);
    if (!registeredPlugin) {
      if (!plugin.id.startsWith('file://')) {
        logger.debug(`Plugin ${plugin.id} not registered, skipping validation`);
        continue;
      }
    } else if (registeredPlugin.validate) {
      try {
        registeredPlugin.validate({
          language,
          ...resolvePluginConfig(plugin.config),
        });
      } catch (error) {
        throw new Error(`Validation failed for plugin ${plugin.id}: ${error}`);
      }
    }
  }

  // Check API health before proceeding
  if (shouldGenerateRemote()) {
    const healthUrl = getRemoteHealthUrl();
    if (healthUrl) {
      logger.debug('Checking promptfoo API health...');
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
    !isWebUI && process.env.LOG_LEVEL !== 'debug' && getLogLevel() !== 'debug';
  if (showProgressBar) {
    progressBar = new cliProgress.SingleBar(
      {
        format: 'Generating | {bar} | {percentage}% | {value}/{total} | {task}',
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
          ...resolvePluginConfig(plugin.config),
        },
      });
      if (!Array.isArray(pluginTests) || pluginTests.length === 0) {
        logger.warn(`Failed to generate tests for ${plugin.id}`);
        pluginTests = [];
      } else {
        testCases.push(
          ...pluginTests.map((t) => ({
            ...t,
            metadata: {
              ...(t?.metadata || {}),
              pluginId: plugin.id,
              pluginConfig: resolvePluginConfig(plugin.config),
            },
          })),
        );
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
        testCases.push(
          ...customTests.map((t) => ({
            ...t,
            metadata: {
              ...(t.metadata || {}),
              pluginId: plugin.id,
              pluginConfig: resolvePluginConfig(plugin.config),
            },
          })),
        );
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

  // Apply non-basic, non-multilingual strategies
  const { testCases: strategyTestCases, strategyResults } = await applyStrategies(
    pluginTestCases,
    strategies.filter((s) => s.id !== 'basic' && s.id !== 'multilingual'),
    injectVar,
  );

  // Combine test cases based on basic strategy setting
  const finalTestCases = [...(includeBasicTests ? pluginTestCases : []), ...strategyTestCases];

  // Then apply multilingual strategy to all test cases
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

  return { purpose, entities, testCases: finalTestCases };
}
