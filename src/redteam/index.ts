import chalk from 'chalk';
import cliProgress from 'cli-progress';
import dedent from 'dedent';
import invariant from 'tiny-invariant';
import logger from '../logger';
import { loadApiProvider } from '../providers';
import { isApiProvider, isProviderOptions, type ApiProvider, type TestCase } from '../types';
import type { SynthesizeOptions } from '../types/redteam';
import { extractVariablesFromTemplates } from '../util/templates';
import { REDTEAM_MODEL, HARM_PLUGINS, PII_PLUGINS } from './constants';
import { extractEntities } from './extraction/entities';
import { extractSystemPurpose } from './extraction/purpose';
import CompetitorPlugin from './plugins/competitors';
import ContractPlugin from './plugins/contracts';
import DebugAccessPlugin from './plugins/debugAccess';
import ExcessiveAgencyPlugin from './plugins/excessiveAgency';
import HallucinationPlugin from './plugins/hallucination';
import { getHarmfulTests } from './plugins/harmful';
import HijackingPlugin from './plugins/hijacking';
import ImitationPlugin from './plugins/imitation';
import OverreliancePlugin from './plugins/overreliance';
import { getPiiLeakTestsForCategory } from './plugins/pii';
import PolicyPlugin from './plugins/policy';
import PoliticsPlugin from './plugins/politics';
import RbacPlugin from './plugins/rbac';
import ShellInjectionPlugin from './plugins/shellInjection';
import SqlInjectionPlugin from './plugins/sqlInjection';
import { addBase64Encoding } from './strategies/base64';
import { addInjections } from './strategies/injections';
import { addIterativeJailbreaks } from './strategies/iterative';
import { addLeetspeak } from './strategies/leetspeak';
import { addRot13 } from './strategies/rot13';

type TestCaseWithPlugin = TestCase & { metadata: { pluginId: string } };

interface Plugin {
  key: string;
  action: (
    provider: ApiProvider,
    purpose: string,
    injectVar: string,
    n: number,
    config?: Record<string, any>,
  ) => Promise<TestCase[]>;
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
    key: 'imitation',
    action: async (provider, purpose, injectVar, n) => {
      const plugin = new ImitationPlugin(provider, purpose, injectVar);
      return plugin.generateTests(n);
    },
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
  {
    key: 'policy',
    action: (provider, purpose, injectVar, n, config) => {
      invariant(config?.policy, 'Policy plugin requires a config');
      const plugin = new PolicyPlugin(provider, purpose, injectVar, config as { policy: string });
      return plugin.generateTests(n);
    },
  },
];

// These plugins refer to a collection of tests.
const categories = {
  harmful: Object.keys(HARM_PLUGINS),
  pii: PII_PLUGINS,
} as const;

interface Strategy {
  key: string;
  action: (testCases: TestCaseWithPlugin[], injectVar: string) => TestCase[];
}

const Strategies: Strategy[] = [
  {
    key: 'jailbreak',
    action: (testCases, injectVar) => {
      logger.debug('Adding experimental jailbreaks to all test cases');
      const newTestCases = addIterativeJailbreaks(testCases, injectVar, 'iterative');
      logger.debug(`Added ${newTestCases.length} experimental jailbreak test cases`);
      return newTestCases;
    },
  },
  {
    key: 'prompt-injection',
    action: (testCases, injectVar) => {
      const harmfulPrompts = testCases.filter((t) => t.metadata.pluginId.startsWith('harmful:'));
      logger.debug('Adding prompt injections to `harmful` plugin test cases');
      const newTestCases = addInjections(harmfulPrompts, injectVar);
      logger.debug(`Added ${newTestCases.length} prompt injection test cases`);
      return newTestCases;
    },
  },
  {
    key: 'jailbreak:tree',
    action: (testCases, injectVar) => {
      logger.debug('Adding experimental tree jailbreaks to all test cases');
      const newTestCases = addIterativeJailbreaks(testCases, injectVar, 'iterative:tree');
      logger.debug(`Added ${newTestCases.length} experimental tree jailbreak test cases`);
      return newTestCases;
    },
  },
  {
    key: 'rot13',
    action: (testCases, injectVar) => {
      logger.debug('Adding ROT13 encoding to all test cases');
      const newTestCases = addRot13(testCases, injectVar);
      logger.debug(`Added ${newTestCases.length} ROT13 encoded test cases`);
      return newTestCases;
    },
  },
  {
    key: 'leetspeak',
    action: (testCases, injectVar) => {
      logger.debug('Adding leetspeak encoding to all test cases');
      const newTestCases = addLeetspeak(testCases, injectVar);
      logger.debug(`Added ${newTestCases.length} leetspeak encoded test cases`);
      return newTestCases;
    },
  },
  {
    key: 'base64',
    action: (testCases, injectVar) => {
      logger.debug('Adding Base64 encoding to all test cases');
      const newTestCases = addBase64Encoding(testCases, injectVar);
      logger.debug(`Added ${newTestCases.length} Base64 encoded test cases`);
      return newTestCases;
    },
  },
];

function validatePlugins(
  plugins: { id: string; numTests: number; config?: Record<string, any> }[],
): void {
  const invalidPlugins = plugins.filter((plugin) => !Plugins.map((p) => p.key).includes(plugin.id));
  if (invalidPlugins.length > 0) {
    const validPluginsString = Plugins.map((p) => p.key).join(', ');
    const invalidPluginsString = invalidPlugins.map((p) => p.id).join(', ');
    logger.error(
      dedent`Invalid plugin(s): ${invalidPluginsString}. 
      
      ${chalk.green(`Valid plugins are: ${validPluginsString}`)}`,
    );
    process.exit(1);
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
    const validStrategiesString = Strategies.map((s) => s.key).join(', ');
    const invalidStrategiesString = invalidStrategies.map((s) => s.id).join(', ');
    logger.error(
      dedent`Invalid strategy(s): ${invalidStrategiesString}. 
      
      ${chalk.green(`Valid strategies are: ${validStrategiesString}`)}`,
    );
    process.exit(1);
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
  entities: entitiesOverride,
  strategies,
  plugins,
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
      const pluginTests = await action(
        redteamProvider,
        purpose,
        injectVar,
        plugin.numTests,
        plugin.config,
      );
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
