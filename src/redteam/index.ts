import chalk from 'chalk';
import cliProgress from 'cli-progress';
import invariant from 'tiny-invariant';
import logger from '../logger';
import { loadApiProvider } from '../providers';
import type { ApiProvider, TestCase, TestSuite } from '../types';
import { extractVariablesFromTemplates } from '../util/templates';
import { REDTEAM_MODEL, ALL_PLUGINS, DEFAULT_PLUGINS } from './constants';
import { addInjections } from './methods/injections';
import { addIterativeJailbreaks } from './methods/iterative';
import CompetitorPlugin from './plugins/competitors';
import ContractPlugin from './plugins/contracts';
import ExcessiveAgencyPlugin from './plugins/excessiveAgency';
import HallucinationPlugin from './plugins/hallucination';
import { getHarmfulTests } from './plugins/harmful';
import HijackingPlugin from './plugins/hijacking';
import OverreliancePlugin from './plugins/overreliance';
import { getPiiTests } from './plugins/pii';
import PoliticsPlugin from './plugins/politics';
import { getPurpose } from './purpose';

interface SynthesizeOptions {
  injectVar?: string;
  plugins: string[];
  prompts: string[];
  provider?: string;
  purpose?: string;
  numTests: number;
}

// n is assigned a default value by commander. Require that it exists in the type
type PartialSynthesizeOptions = Partial<Omit<SynthesizeOptions, 'numTests'>> & { numTests: number };

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
  action: (testCases: TestCase[], harmfulPrompts: TestCase[], injectVar: string) => TestCase[];
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
  { key: 'pii', action: getPiiTests },
  {
    key: 'politics',
    action: (provider, purpose, injectVar, n) =>
      new PoliticsPlugin(provider, purpose, injectVar).generateTests(n),
  },
];

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
    action: (_, harmfulPrompts) => {
      logger.debug('Adding jailbreaks to harmful prompts');
      const jailbreaks = addIterativeJailbreaks(harmfulPrompts);
      logger.debug(`Added ${jailbreaks.length} jailbreak test cases`);
      return jailbreaks;
    },
  },
  {
    key: 'prompt-injection',
    action: (_, harmfulPrompts, injectVar) => {
      logger.debug('Adding prompt injections');
      const injections = addInjections(harmfulPrompts, injectVar);
      logger.debug(`Added ${injections.length} prompt injection test cases`);
      return injections;
    },
  },
];

function validatePlugins(plugins: string[]): void {
  const invalidPlugins = plugins.filter((plugin) => !ALL_PLUGINS.has(plugin));
  if (invalidPlugins.length > 0) {
    const validPluginsString = Array.from(ALL_PLUGINS).join(', ');
    const invalidPluginsString = invalidPlugins.join(', ');
    throw new Error(
      `Invalid plugin(s): ${invalidPluginsString}. Valid plugins are: ${validPluginsString}`,
    );
  }
}

export async function synthesize({
  prompts,
  provider,
  injectVar,
  purpose: purposeOverride,
  plugins,
  numTests,
}: SynthesizeOptions) {
  validatePlugins(plugins);
  const reasoningProvider = await loadApiProvider(provider || REDTEAM_MODEL);
  logger.info(
    `Synthesizing test cases for ${prompts.length} ${
      prompts.length === 1 ? 'prompt' : 'prompts'
    }...\nUsing plugins:\n\t${chalk.yellow(plugins.sort().join('\n\t'))}`,
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
  const purpose = purposeOverride || (await getPurpose(reasoningProvider, prompts));
  updateProgress();

  logger.debug(`System purpose: ${purpose}`);

  // Get adversarial test cases
  const testCases: TestCase[] = [];
  const harmfulPrompts: TestCase[] = [];

  const redteamProvider: ApiProvider = await loadApiProvider(provider || REDTEAM_MODEL, {
    options: {
      config: { temperature: 0.5 },
    },
  });

  const addHarmfulCases = plugins.some((p) => p.startsWith('harmful'));
  if (plugins.includes('prompt-injection') || plugins.includes('jailbreak') || addHarmfulCases) {
    logger.debug('Generating harmful test cases');
    const newHarmfulPrompts = await getHarmfulTests(
      redteamProvider,
      purpose,
      injectVar,
      plugins.filter((p) => p.startsWith('harmful:')),
    );
    harmfulPrompts.push(...newHarmfulPrompts);

    if (addHarmfulCases) {
      testCases.push(...harmfulPrompts);
      logger.debug(`Added ${harmfulPrompts.length} harmful test cases`);
    } else {
      logger.debug(`Generated ${harmfulPrompts.length} harmful test cases`);
    }
  }

  for (const { key, action } of Plugins) {
    if (plugins.includes(key)) {
      updateProgress();
      logger.debug(`Generating ${key} tests`);
      const pluginTests = await action(redteamProvider, purpose, injectVar, numTests);
      testCases.push(...pluginTests);
      logger.debug(`Added ${pluginTests.length} ${key} test cases`);
    }
  }

  for (const { key, action } of Methods) {
    if (plugins.includes(key)) {
      const newTestCases = action(testCases, harmfulPrompts, injectVar);
      testCases.push(...newTestCases);
    }
  }
  // Finish progress bar
  if (process.env.LOG_LEVEL !== 'debug') {
    progressBar.update(100);
    progressBar.stop();
  }

  return testCases;
}

export async function synthesizeFromTestSuite(
  testSuite: TestSuite,
  options: PartialSynthesizeOptions,
) {
  return synthesize({
    ...options,
    plugins:
      options.plugins && options.plugins.length > 0 ? options.plugins : Array.from(DEFAULT_PLUGINS),
    prompts: testSuite.prompts.map((prompt) => prompt.raw),
  });
}
