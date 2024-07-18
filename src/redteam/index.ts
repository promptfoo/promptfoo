import chalk from 'chalk';
import cliProgress from 'cli-progress';
import invariant from 'tiny-invariant';
import logger from '../logger';
import { loadApiProvider } from '../providers';
import type { ApiProvider, TestCase } from '../types';
import { extractVariablesFromTemplates } from '../util/templates';
import { REDTEAM_MODEL, ALL_PLUGINS } from './constants';
import { addInjections } from './methods/injections';
import { addIterativeJailbreaks } from './methods/iterative';
import CompetitorPlugin from './plugins/competitors';
import ContractPlugin from './plugins/contracts';
import ExcessiveAgencyPlugin from './plugins/excessiveAgency';
import HallucinationPlugin from './plugins/hallucination';
import { HARM_CATEGORIES, getHarmfulTests } from './plugins/harmful';
import HijackingPlugin from './plugins/hijacking';
import OverreliancePlugin from './plugins/overreliance';
import { PII_REQUEST_CATEGORIES, getPiiLeakTestsForCategory } from './plugins/pii';
import PoliticsPlugin from './plugins/politics';
import { getPurpose } from './purpose';

interface SynthesizeOptions {
  injectVar?: string;
  plugins: { name: string; numTests: number }[];
  prompts: string[];
  provider?: string;
  purpose?: string;
}

interface Plugin {
  key: string;
  action: (
    provider: ApiProvider,
    purpose: string,
    injectVar: string,
    n: number,
  ) => Promise<TestCase[]>;
}

interface Method {
  key: string;
  action: (testCases: (TestCase & { plugin: string })[], injectVar: string) => TestCase[];
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
  ...(Object.keys(HARM_CATEGORIES).map((category) => ({
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
  ...(PII_REQUEST_CATEGORIES.map((category) => ({
    key: category,
    action: (provider, purpose, injectVar, n) =>
      getPiiLeakTestsForCategory(provider, purpose, injectVar, category, n),
  })) as Plugin[]),
  {
    key: 'politics',
    action: (provider, purpose, injectVar, n) =>
      new PoliticsPlugin(provider, purpose, injectVar).generateTests(n),
  },
];

// These plugins refer to a collection of tests.
const categories = {
  harmful: Object.keys(HARM_CATEGORIES),
  pii: PII_REQUEST_CATEGORIES,
} as const;

const Methods: Method[] = [
  {
    key: 'experimental-jailbreak',
    action: (testCases) => {
      logger.debug('Adding experimental jailbreaks to all test cases');
      const experimentalJailbreaks = addIterativeJailbreaks(testCases);
      logger.debug(`Added ${experimentalJailbreaks.length} experimental jailbreak test cases`);
      return experimentalJailbreaks;
    },
  },
  {
    key: 'jailbreak',
    action: (testCases) => {
      const harmfulPrompts = testCases.filter((t) => t.plugin.startsWith('harmful:'));
      logger.debug('Adding jailbreaks to harmful prompts');
      const jailbreaks = addIterativeJailbreaks(harmfulPrompts);
      logger.debug(`Added ${jailbreaks.length} jailbreak test cases`);
      return jailbreaks;
    },
    requiredPlugins: Object.keys(HARM_CATEGORIES),
  },
  {
    key: 'prompt-injection',
    action: (testCases, injectVar) => {
      const harmfulPrompts = testCases.filter((t) => t.plugin.startsWith('harmful:'));
      logger.debug('Adding prompt injections');
      const injections = addInjections(harmfulPrompts, injectVar);
      logger.debug(`Added ${injections.length} prompt injection test cases`);
      return injections;
    },
    requiredPlugins: Object.keys(HARM_CATEGORIES),
  },
];

function validatePlugins(plugins: string[]): void {
  const invalidPlugins = plugins.filter((plugin) => !ALL_PLUGINS.includes(plugin));
  if (invalidPlugins.length > 0) {
    const validPluginsString = Array.from(ALL_PLUGINS).join(', ');
    const invalidPluginsString = invalidPlugins.join(', ');
    throw new Error(
      `Invalid plugin(s): ${invalidPluginsString}. Valid plugins are: ${validPluginsString}`,
    );
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
  purpose: purposeOverride,
  plugins,
}: SynthesizeOptions) {
  validatePlugins(plugins.map((p) => p.name));
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
        .map((p) => `${p.name} (${formatTestCount(p.numTests)})`)
        .sort()
        .join('\n'),
    )}\n`,
  );
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
    const plugin = plugins.find((p) => p.name === category);
    if (plugin) {
      plugins.push(...categoryPlugins.map((p) => ({ name: p, numTests: plugin.numTests })));
    }
  }

  // if a method is included in the user selected plugins, add all of its required plugins
  for (const { key, requiredPlugins } of Methods) {
    const plugin = plugins.find((p) => p.name === key);
    if (plugin && requiredPlugins) {
      plugins.push(...requiredPlugins.map((p) => ({ name: p, numTests: plugin.numTests })));
    }
  }

  // Deduplicate, filter out the category names, and sort
  plugins = [...new Set(plugins)].filter((p) => !Object.keys(categories).includes(p.name)).sort();

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

  const testCases: (TestCase & { plugin: string })[] = [];
  for (const { key, action } of Plugins) {
    const plugin = plugins.find((p) => p.name === key);
    if (plugin) {
      updateProgress();
      logger.debug(`Generating ${key} tests`);
      const pluginTests = await action(redteamProvider, purpose, injectVar, plugin.numTests);
      testCases.push(...pluginTests.map((t) => ({ ...t, plugin: key })));
      logger.debug(`Added ${pluginTests.length} ${key} test cases`);
    }
  }

  for (const { key, action } of Methods) {
    const plugin = plugins.find((p) => p.name === key);
    if (plugin) {
      updateProgress();
      logger.debug(`Generating ${key} tests`);
      const newTestCases = action(testCases, injectVar);
      testCases.push(...newTestCases.map((t) => ({ ...t, plugin: key })));
    }
  }

  // Finish progress bar
  if (process.env.LOG_LEVEL !== 'debug') {
    progressBar.update(100);
    progressBar.stop();
  }

  return testCases;
}
