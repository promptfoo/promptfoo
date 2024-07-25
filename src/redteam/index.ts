import chalk from 'chalk';
import cliProgress from 'cli-progress';
import invariant from 'tiny-invariant';
import logger from '../logger';
import { loadApiProvider } from '../providers';
import type { ApiProvider, TestCase } from '../types';
import { extractVariablesFromTemplates } from '../util/templates';
import { REDTEAM_MODEL, HARM_PLUGINS, PII_PLUGINS } from './constants';
import CompetitorPlugin from './plugins/competitors';
import ContractPlugin from './plugins/contracts';
import DebugAccessPlugin from './plugins/debugInterface';
import ExcessiveAgencyPlugin from './plugins/excessiveAgency';
import HallucinationPlugin from './plugins/hallucination';
import { getHarmfulTests } from './plugins/harmful';
import HijackingPlugin from './plugins/hijacking';
import OverreliancePlugin from './plugins/overreliance';
import { getPiiLeakTestsForCategory } from './plugins/pii';
import PoliticsPlugin from './plugins/politics';
import RbacPlugin from './plugins/rbac';
import ShellInjectionPlugin from './plugins/shellInjection';
import SqlInjectionPlugin from './plugins/sqlInjection';
import { getPurpose } from './purpose';
import { addInjections } from './strategies/injections';
import { addIterativeJailbreaks } from './strategies/iterative';

export interface SynthesizeOptions {
  injectVar?: string;
  numTests: number;
  plugins: { id: string; numTests: number }[];
  prompts: string[];
  provider?: string;
  purpose?: string;
  strategies: { id: string }[];
}

type TestCaseWithPlugin = TestCase & { metadata: { pluginId: string } };

interface Plugin {
  key: string;
  action: (
    provider: ApiProvider,
    purpose: string,
    injectVar: string,
    n: number,
  ) => Promise<TestCase[]>;
}

interface Strategy {
  key: string;
  action: (testCases: TestCaseWithPlugin[], injectVar: string) => TestCase[];
  requiredPlugins?: string[];
}

const Plugins: Plugin[] = [
  {
    key: 'competitors',
    action: (provider, purpose, injectVar, n) =>
      new CompetitorPlugin(provider, purpose, injectVar).generateTests(n),
  },
  {
    key: 'contracts',
    action: (provider, purpose, injectVar, n) =>
      new ContractPlugin(provider, purpose, injectVar).generateTests(n),
  },
  {
    key: 'excessive-agency',
    action: (provider, purpose, injectVar, n) =>
      new ExcessiveAgencyPlugin(provider, purpose, injectVar).generateTests(n),
  },
  {
    key: 'hallucination',
    action: (provider, purpose, injectVar, n) =>
      new HallucinationPlugin(provider, purpose, injectVar).generateTests(n),
  },
  ...(Object.keys(HARM_PLUGINS).map((category) => ({
    key: category,
    action: (provider, purpose, injectVar, n) =>
      getHarmfulTests(provider, purpose, injectVar, [category], n),
  })) as Plugin[]),
  {
    key: 'hijacking',
    action: (provider, purpose, injectVar, n) =>
      new HijackingPlugin(provider, purpose, injectVar).generateTests(n),
  },
  {
    key: 'overreliance',
    action: (provider, purpose, injectVar, n) =>
      new OverreliancePlugin(provider, purpose, injectVar).generateTests(n),
  },
  {
    key: 'sql-injection',
    action: (provider, purpose, injectVar, n) =>
      new SqlInjectionPlugin(provider, purpose, injectVar).generateTests(n),
  },
  {
    key: 'shell-injection',
    action: (provider, purpose, injectVar, n) =>
      new ShellInjectionPlugin(provider, purpose, injectVar).generateTests(n),
  },
  {
    key: 'debug-access',
    action: (provider, purpose, injectVar, n) =>
      new DebugAccessPlugin(provider, purpose, injectVar).generateTests(n),
  },
  {
    key: 'rbac',
    action: (provider, purpose, injectVar, n) =>
      new RbacPlugin(provider, purpose, injectVar).generateTests(n),
  },
  {
    key: 'politics',
    action: (provider, purpose, injectVar, n) =>
      new PoliticsPlugin(provider, purpose, injectVar).generateTests(n),
  },
  ...(PII_PLUGINS.map((category) => ({
    key: category,
    action: (provider, purpose, injectVar, n) =>
      getPiiLeakTestsForCategory(provider, purpose, injectVar, category, n),
  })) as Plugin[]),
];

// These plugins refer to a collection of tests.
const categories = {
  harmful: Object.keys(HARM_PLUGINS),
  pii: PII_PLUGINS,
} as const;

const Strategies: Strategy[] = [
  {
    key: 'experimental-jailbreak',
    action: (testCases, injectVar) => {
      logger.debug('Adding experimental jailbreaks to all test cases');
      const experimentalJailbreaks = addIterativeJailbreaks(testCases, injectVar, 'iterative');
      logger.debug(`Added ${experimentalJailbreaks.length} experimental jailbreak test cases`);
      return experimentalJailbreaks;
    },
  },
  {
    key: 'experimental-tree-jailbreak',
    action: (testCases, injectVar) => {
      logger.debug('Adding experimental tree jailbreaks to all test cases');
      const experimentalJailbreaks = addIterativeJailbreaks(testCases, injectVar, 'iterative:tree');
      logger.debug(`Added ${experimentalJailbreaks.length} experimental tree jailbreak test cases`);
      return experimentalJailbreaks;
    },
  },
  {
    key: 'jailbreak',
    action: (testCases, injectVar) => {
      const harmfulPrompts = testCases.filter((t) => t.metadata.pluginId.startsWith('harmful:'));
      logger.debug('Adding jailbreaks to harmful prompts');
      const jailbreaks = addIterativeJailbreaks(harmfulPrompts, injectVar, 'iterative');
      logger.debug(`Added ${jailbreaks.length} jailbreak test cases`);
      return jailbreaks;
    },
    requiredPlugins: Object.keys(HARM_PLUGINS),
  },
  {
    key: 'prompt-injection',
    action: (testCases, injectVar) => {
      const harmfulPrompts = testCases.filter((t) => t.metadata.pluginId.startsWith('harmful:'));
      logger.debug('Adding prompt injections');
      const injections = addInjections(harmfulPrompts, injectVar);
      logger.debug(`Added ${injections.length} prompt injection test cases`);
      return injections;
    },
    requiredPlugins: Object.keys(HARM_PLUGINS),
  },
];

function validatePlugins(plugins: { id: string; numTests: number }[]): void {
  const invalidPlugins = plugins.filter((plugin) => !Plugins.map((p) => p.key).includes(plugin.id));
  if (invalidPlugins.length > 0) {
    const validPluginsString = Plugins.map((p) => p.key).join(', ');
    const invalidPluginsString = invalidPlugins.map((p) => p.id).join(', ');
    throw new Error(
      `Invalid plugin(s): ${invalidPluginsString}. Valid plugins are: ${validPluginsString}`,
    );
  }
  const pluginsWithoutNumTests = plugins.filter(
    (plugin) => !Number.isSafeInteger(plugin.numTests) || plugin.numTests <= 0,
  );
  if (pluginsWithoutNumTests.length > 0) {
    const pluginsWithoutNumTestsString = pluginsWithoutNumTests.map((p) => p.id).join(', ');
    throw new Error(`Plugins without a numTests: ${pluginsWithoutNumTestsString}`);
  }
}

function validateStrategies(strategies: { id: string }[]): void {
  const invalidStrategies = strategies.filter(
    (strategy) => !Strategies.map((s) => s.key).includes(strategy.id),
  );
  if (invalidStrategies.length > 0) {
    throw new Error(`Invalid strategy(s): ${invalidStrategies.join(', ')}`);
  }
}

const formatTestCount = (numTests: number) => {
  if (numTests === 1) {
    return '1 test';
  }
  return `${numTests} tests`;
};

export async function synthesize({
  prompts,
  provider,
  injectVar,
  numTests,
  purpose: purposeOverride,
  strategies,
  plugins,
}: SynthesizeOptions) {
  validatePlugins(plugins);
  validateStrategies(strategies);
  const redteamProvider: ApiProvider = await loadApiProvider(provider || REDTEAM_MODEL, {
    options: {
      config: { temperature: 0.5 },
    },
  });

  logger.info(
    `Synthesizing test cases for ${prompts.length} ${
      prompts.length === 1 ? 'prompt' : 'prompts'
    }...\nUsing plugins:\n\n${chalk.yellow(
      plugins
        .map((p) => `${p.id} (${formatTestCount(p.numTests)})`)
        .sort()
        .join('\n'),
    )}\n`,
  );
  logger.info(`Using strategies: ${strategies.map((s) => s.id).join(', ')}`);
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

  // if a strategy is included in the user selected plugins, add all of its required plugins
  for (const { key, requiredPlugins } of Strategies) {
    const strategy = strategies.find((s) => s.id === key);
    if (strategy && requiredPlugins) {
      logger.debug(`Adding required plugins for strategy: ${key}: ${requiredPlugins.join(', ')}`);
      plugins.push(...requiredPlugins.map((p) => ({ id: p, numTests: numTests })));
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
  updateProgress();
  const purpose = purposeOverride || (await getPurpose(redteamProvider, prompts));
  updateProgress();

  logger.debug(`System purpose: ${purpose}`);

  const testCases: TestCaseWithPlugin[] = [];
  for (const { key, action } of Plugins) {
    const plugin = plugins.find((p) => p.id === key);
    if (plugin) {
      updateProgress();
      logger.debug(`Generating ${key} tests`);
      const pluginTests = await action(redteamProvider, purpose, injectVar, plugin.numTests);
      testCases.push(
        ...pluginTests.map((t) => ({
          ...t,
          metadata: {
            ...(t.metadata || {}),
            pluginId: key,
          },
        })),
      );
      logger.debug(`Added ${pluginTests.length} ${key} test cases`);
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
            pluginId: key,
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

  return testCases;
}
