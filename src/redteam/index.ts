import async from 'async';
import chalk from 'chalk';
import cliProgress from 'cli-progress';
import Table from 'cli-table3';
import * as fs from 'fs';
import yaml from 'js-yaml';
import invariant from 'tiny-invariant';
import logger, { getLogLevel } from '../logger';
import type { TestCase, TestCaseWithPlugin } from '../types';
import { extractVariablesFromTemplates } from '../util/templates';
import { HARM_PLUGINS, PII_PLUGINS, ALIASED_PLUGIN_MAPPINGS } from './constants';
import { extractEntities } from './extraction/entities';
import { extractSystemPurpose } from './extraction/purpose';
import { Plugins } from './plugins';
import { CustomPlugin } from './plugins/custom';
import { loadRedteamProvider } from './providers/shared';
import { Strategies, validateStrategies } from './strategies';
import type { SynthesizeOptions } from './types';

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
}: SynthesizeOptions): Promise<{
  purpose: string;
  entities: string[];
  testCases: TestCaseWithPlugin[];
}> {
  if (prompts.length === 0) {
    throw new Error('Prompts array cannot be empty');
  }
  if (delay && maxConcurrency > 1) {
    maxConcurrency = 1;
    logger.warn('Delay is enabled, setting max concurrency to 1.');
  }
  validateStrategies(strategies);

  const redteamProvider = await loadRedteamProvider({ provider });

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
          .map((s) => `${s.id} (${formatTestCount(totalPluginTests)})`)
          .sort()
          .join('\n'),
      )}\n`,
    );
  }

  const totalTests =
    plugins.reduce((sum, p) => sum + (p.numTests || 0), 0) * (strategies.length + 1);

  const totalPluginTests = plugins.reduce((sum, p) => sum + (p.numTests || 0), 0);

  logger.info(
    chalk.bold(`Test Generation Summary:`) +
      `\n• Total tests: ${chalk.cyan(totalTests)}` +
      `\n• Plugin tests: ${chalk.cyan(totalPluginTests)}` +
      `\n• Plugins: ${chalk.cyan(plugins.length)}` +
      `\n• Strategies: ${chalk.cyan(strategies.length)}` +
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

  let progressBar: cliProgress.SingleBar | null = null;
  if (process.env.LOG_LEVEL !== 'debug' && getLogLevel() !== 'debug') {
    progressBar = new cliProgress.SingleBar(
      {
        format: 'Generating | {bar} | {percentage}% | {value}/{total} | {task}',
      },
      cliProgress.Presets.shades_classic,
    );
    progressBar.start(totalPluginTests + 2, 0, { task: 'Initializing' });
  }

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

  plugins = expandedPlugins;

  plugins = [...new Set(plugins)].filter((p) => !Object.keys(categories).includes(p.id)).sort();

  progressBar?.increment(1, { task: 'Extracting system purpose' });
  const purpose = purposeOverride || (await extractSystemPurpose(redteamProvider, prompts));

  progressBar?.increment(1, { task: 'Extracting entities' });
  const entities: string[] = Array.isArray(entitiesOverride)
    ? entitiesOverride
    : await extractEntities(redteamProvider, prompts);

  logger.debug(`System purpose: ${purpose}`);

  for (const plugin of plugins) {
    const { validate } = Plugins.find((p) => p.key === plugin.id) || {};
    if (validate) {
      validate({
        language,
        ...resolvePluginConfig(plugin.config),
      });
    }
  }

  const pluginResults: Record<string, { requested: number; generated: number }> = {};
  const testCases: TestCaseWithPlugin[] = [];
  await async.forEachLimit(plugins, maxConcurrency, async (plugin) => {
    progressBar?.update({ task: plugin.id });
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
      }
      testCases.push(
        ...pluginTests.map((t) => ({
          ...t,
          metadata: {
            ...(t.metadata || {}),
            pluginId: plugin.id,
            pluginConfig: resolvePluginConfig(plugin.config),
          },
        })),
      );
      progressBar?.increment(plugin.numTests);
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

  const newTestCases: TestCaseWithPlugin[] = [];

  const strategyResults: Record<string, { requested: number; generated: number }> = {};
  if (strategies.length > 0) {
    const existingTestCount = testCases.length;
    const totalStrategyTests = existingTestCount * strategies.length;

    logger.info(
      chalk.bold(
        `\nGenerating additional tests using ${strategies.length} strateg${strategies.length === 1 ? 'y' : 'ies'}:`,
      ) +
        `\n• Existing tests: ${chalk.cyan(existingTestCount)}` +
        `\n• Expected new tests: ${chalk.cyan(totalStrategyTests)}` +
        `\n• Total expected tests: ${chalk.cyan(existingTestCount + totalStrategyTests)}`,
    );

    for (const { key, action } of Strategies) {
      const strategy = strategies.find((s) => s.id === key);
      if (!strategy) {
        continue;
      }
      progressBar?.update({ task: `Applying strategy: ${key}` });
      logger.debug(`Generating ${key} tests`);
      const strategyTestCases: TestCase[] = await action(
        testCases,
        injectVar,
        strategy.config || {},
      );
      try {
        newTestCases.push(
          ...strategyTestCases
            .filter((t): t is NonNullable<typeof t> => t !== null && t !== undefined)
            .map((t) => ({
              ...t,
              metadata: {
                ...(t?.metadata || {}),
                strategyId: strategy.id,
                ...(t?.metadata?.pluginId && { pluginId: t.metadata.pluginId }),
                ...(t?.metadata?.pluginConfig && { pluginConfig: t.metadata.pluginConfig }),
                ...(strategy.config && { strategyConfig: strategy.config }),
              },
            })),
        );
      } catch (e) {
        logger.warn(`Strategy ${key} did not return valid test cases: ${e}`);
      }
      strategyResults[key] = {
        requested: testCases.length,
        generated: strategyTestCases.length,
      };
    }

    testCases.push(...newTestCases);
  }

  progressBar?.update({ task: 'Done.' });
  progressBar?.stop();
  if (progressBar) {
    // Newline after progress bar to avoid overlap
    logger.info('');
  }

  logger.info(generateReport(pluginResults, strategyResults));

  return { purpose, entities, testCases };
}
