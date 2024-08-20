import async from 'async';
import chalk from 'chalk';
import cliProgress from 'cli-progress';
import Table from 'cli-table3';
import invariant from 'tiny-invariant';
import logger from '../logger';
import { loadApiProvider } from '../providers';
import type { TestCaseWithPlugin } from '../types';
import { isApiProvider, isProviderOptions, type ApiProvider } from '../types';
import type { SynthesizeOptions } from '../types/redteam';
import { extractVariablesFromTemplates } from '../util/templates';
import { REDTEAM_MODEL, HARM_PLUGINS, PII_PLUGINS, ALIASED_PLUGIN_MAPPINGS } from './constants';
import { extractEntities } from './extraction/entities';
import { extractSystemPurpose } from './extraction/purpose';
import { Plugins } from './plugins';
import { Strategies, validateStrategies } from './strategies';

function getStatus(requested: number, generated: number): string {
  if (generated === 0) {
    return chalk.red('Failed');
  }
  if (generated < requested) {
    return chalk.yellow('Partial');
  }
  return chalk.green('Success');
}

function generateReport(
  pluginResults: Record<string, { requested: number; generated: number }>,
  strategyResults: Record<string, { requested: number; generated: number }>,
): string {
  const table = new Table({
    head: ['#', 'Type', 'ID', 'Requested', 'Generated', 'Status'],
    colWidths: [5, 10, 40, 12, 12, 14],
  });

  let rowIndex = 1;

  for (const [id, { requested, generated }] of Object.entries(pluginResults).sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    table.push([rowIndex++, 'Plugin', id, requested, generated, getStatus(requested, generated)]);
  }

  for (const [id, { requested, generated }] of Object.entries(strategyResults).sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    table.push([rowIndex++, 'Strategy', id, requested, generated, getStatus(requested, generated)]);
  }

  return `\nTest Generation Report:\n${table.toString()}`;
}

export class ProgressBar {
  private bar: cliProgress.SingleBar;
  private currentValue: number;

  constructor(private total: number) {
    this.bar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
    this.currentValue = 0;
  }

  start(): void {
    this.bar.start(this.total, 0);
  }

  increment(value = 1): void {
    this.currentValue += value;
    this.bar.update(this.currentValue);
  }

  stop(): void {
    this.bar.stop();
  }
}

// These plugins refer to a collection of tests.
const categories = {
  harmful: Object.keys(HARM_PLUGINS),
  pii: PII_PLUGINS,
} as const;

const formatTestCount = (numTests: number) => {
  if (numTests === 1) {
    return '1 test';
  }
  return `${numTests} tests`;
};

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
}: SynthesizeOptions): Promise<{
  purpose: string;
  entities: string[];
  testCases: TestCaseWithPlugin[];
}> {
  if (prompts.length === 0) {
    throw new Error('Prompts array cannot be empty');
  }
  validateStrategies(strategies);

  let redteamProvider: ApiProvider;
  if (isApiProvider(provider)) {
    redteamProvider = provider;
  } else if (isProviderOptions(provider)) {
    redteamProvider = await loadApiProvider(provider.id || REDTEAM_MODEL, provider);
  } else {
    redteamProvider = await loadApiProvider(REDTEAM_MODEL, {
      options: { config: { temperature: 0.5 } },
    });
  }

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

  // Calculate total number of tests
  const totalTests =
    plugins.reduce((sum, p) => sum + (p.numTests || 0), 0) * (strategies.length + 1);

  logger.info(
    `Generating ${chalk.bold(totalTests)} test${totalTests === 1 ? '' : 's'} ` +
      `(${plugins.length} plugin${plugins.length === 1 ? '' : 's'}, ` +
      `${strategies.length} strateg${strategies.length === 1 ? 'y' : 'ies'}, max concurrency: ${maxConcurrency})`,
  );

  // Initialize progress bar
  const progressBar = new ProgressBar(totalTests);

  if (logger.level !== 'debug') {
    progressBar.start();
  }

  // Get vars
  if (typeof injectVar !== 'string') {
    const parsedVars = extractVariablesFromTemplates(prompts);
    if (parsedVars.length > 1) {
      logger.warn(
        `Multiple variables found in prompts: ${parsedVars.join(', ')}. Using the first one.`,
      );
    } else if (parsedVars.length === 0) {
      logger.warn('No variables found in prompts. Using "query" as the inject variable.');
    }
    injectVar = parsedVars[0] || 'query';
    invariant(typeof injectVar === 'string', `Inject var must be a string, got ${injectVar}`);
  }

  // if a category is included in the user selected plugins, add all of its plugins
  for (const [category, categoryPlugins] of Object.entries(categories)) {
    const plugin = plugins.find((p) => p.id === category);
    if (plugin) {
      plugins.push(...categoryPlugins.map((p) => ({ id: p, numTests: plugin.numTests })));
    }
  }

  // Apply aliases for NIST and OWASP mappings
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

  // Deduplicate, filter out the category names, and sort
  plugins = [...new Set(plugins)].filter((p) => !Object.keys(categories).includes(p.id)).sort();

  // Get purpose
  const purpose = purposeOverride || (await extractSystemPurpose(redteamProvider, prompts));
  progressBar.increment();
  const entities: string[] = Array.isArray(entitiesOverride)
    ? entitiesOverride
    : await extractEntities(redteamProvider, prompts);
  progressBar.increment();

  logger.debug(`System purpose: ${purpose}`);

  const pluginResults: Record<string, { requested: number; generated: number }> = {};
  const strategyResults: Record<string, { requested: number; generated: number }> = {};

  const testCases: TestCaseWithPlugin[] = [];
  await async.forEachLimit(plugins, maxConcurrency, async (plugin) => {
    const { action } = Plugins.find((p) => p.key === plugin.id) || {};
    if (action) {
      progressBar.increment(plugin.numTests);
      logger.debug(`Generating tests for ${plugin.id}...`);
      const pluginTests = await action(redteamProvider, purpose, injectVar, plugin.numTests, {
        language,
        ...(plugin.config || {}),
      });
      testCases.push(
        ...pluginTests.map((t) => ({
          ...t,
          metadata: {
            ...(t.metadata || {}),
            pluginId: plugin.id,
          },
        })),
      );
      logger.debug(`Added ${pluginTests.length} ${plugin.id} test cases`);
      pluginResults[plugin.id] = { requested: plugin.numTests, generated: pluginTests.length };
    } else {
      logger.warn(`Plugin ${plugin.id} not registered, skipping`);
      pluginResults[plugin.id] = { requested: plugin.numTests, generated: 0 };
    }
  });

  const newTestCases: TestCaseWithPlugin[] = [];

  for (const { key, action } of Strategies) {
    const strategy = strategies.find((s) => s.id === key);
    if (strategy) {
      progressBar.increment(plugins.reduce((sum, p) => sum + (p.numTests || 0), 0));
      logger.debug(`Generating ${key} tests`);
      const strategyTestCases = action(testCases, injectVar);
      newTestCases.push(
        ...strategyTestCases.map((t) => ({
          ...t,
          metadata: {
            ...(t.metadata || {}),
            pluginId: t.metadata?.pluginId,
            strategyId: strategy.id,
          },
        })),
      );
      strategyResults[key] = {
        requested: testCases.length,
        generated: strategyTestCases.length,
      };
    }
  }

  testCases.push(...newTestCases);

  // Finish progress bar
  if (logger.level !== 'debug') {
    progressBar.stop();
  }

  // Generate report
  logger.info(generateReport(pluginResults, strategyResults));

  return { purpose, entities, testCases };
}
