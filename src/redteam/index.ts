import chalk from 'chalk';
import cliProgress from 'cli-progress';
import invariant from 'tiny-invariant';
import logger from '../logger';
import { loadApiProvider } from '../providers';
import type { TestCaseWithPlugin } from '../types';
import { isApiProvider, isProviderOptions, type ApiProvider } from '../types';
import type { SynthesizeOptions } from '../types/redteam';
import { extractVariablesFromTemplates } from '../util/templates';
import { REDTEAM_MODEL, HARM_PLUGINS, PII_PLUGINS } from './constants';
import { extractEntities } from './extraction/entities';
import { extractSystemPurpose } from './extraction/purpose';
import { Plugins, validatePlugins } from './plugins';
import { Strategies, validateStrategies } from './strategies';

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
  validatePlugins(plugins);
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
    logger.info(`Using strategies: ${strategies.map((s) => s.id).join(', ')}`);
  }
  logger.info('Generating...');

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

  // Deduplicate, filter out the category names, and sort
  plugins = [...new Set(plugins)].filter((p) => !Object.keys(categories).includes(p.id)).sort();

  // Initialize progress bar
  const progressBar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
  const totalSteps = plugins.length + 2; // +2 for initial setup steps
  let currentStep = 0;

  if (process.env.LOG_LEVEL !== 'debug') {
    progressBar.start(100, 0);
  }

  const updateProgress = () => {
    currentStep += 1;
    const progress = Math.floor((currentStep / totalSteps) * 100);
    progressBar.update(progress);
  };

  // Get purpose
  const purpose = purposeOverride || (await extractSystemPurpose(redteamProvider, prompts));
  updateProgress();
  const entities: string[] = Array.isArray(entitiesOverride)
    ? entitiesOverride
    : await extractEntities(redteamProvider, prompts);
  updateProgress();

  logger.debug(`System purpose: ${purpose}`);

  const testCases: TestCaseWithPlugin[] = [];
  for (const { key: pluginId, action } of Plugins) {
    const plugin = plugins.find((p) => p.id === pluginId);
    if (plugin) {
      updateProgress();
      logger.debug(`Generating tests for ${pluginId}...`);
      const pluginTests = await action(redteamProvider, purpose, injectVar, plugin.numTests, {
        language,
        ...(plugin.config || {}),
      });
      testCases.push(
        ...pluginTests.map((t) => ({
          ...t,
          metadata: {
            ...(t.metadata || {}),
            pluginId,
          },
        })),
      );
      logger.debug(`Added ${pluginTests.length} ${pluginId} test cases`);
    }
  }

  const newTestCases: TestCaseWithPlugin[] = [];

  for (const { key, action } of Strategies) {
    const strategy = strategies.find((s) => s.id === key);
    if (strategy) {
      updateProgress();
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
    }
  }

  testCases.push(...newTestCases);

  // Finish progress bar
  if (process.env.LOG_LEVEL !== 'debug') {
    progressBar.update(100);
    progressBar.stop();
  }

  return { purpose, entities, testCases };
}
