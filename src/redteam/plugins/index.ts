import { fetchWithCache } from '../../cache';
import { VERSION } from '../../constants';
import { getEnvBool } from '../../envars';
import { getUserEmail } from '../../globalConfig/accounts';
import logger from '../../logger';
import { REQUEST_TIMEOUT_MS } from '../../providers/shared';
import type { ApiProvider, PluginActionParams, PluginConfig, TestCase } from '../../types';
import invariant from '../../util/invariant';
import type { HarmPlugin } from '../constants';
import {
  PII_PLUGINS,
  REDTEAM_PROVIDER_HARM_PLUGINS,
  UNALIGNED_PROVIDER_HARM_PLUGINS,
} from '../constants';
import {
  getRemoteGenerationUrl,
  neverGenerateRemote,
  shouldGenerateRemote,
} from '../remoteGeneration';
import { type RedteamPluginBase } from './base';
import { BeavertailsPlugin } from './beavertails';
import { ContractPlugin } from './contracts';
import { CrossSessionLeakPlugin } from './crossSessionLeak';
import { CyberSecEvalPlugin } from './cyberseceval';
import { DebugAccessPlugin } from './debugAccess';
import { DivergentRepetitionPlugin } from './divergentRepetition';
import { ExcessiveAgencyPlugin } from './excessiveAgency';
import { HallucinationPlugin } from './hallucination';
import { HarmbenchPlugin } from './harmbench';
import { AlignedHarmfulPlugin } from './harmful/aligned';
import { getHarmfulAssertions } from './harmful/common';
import { getHarmfulTests } from './harmful/unaligned';
import { ImitationPlugin } from './imitation';
import { IntentPlugin } from './intent';
import { OverreliancePlugin } from './overreliance';
import { getPiiLeakTestsForCategory } from './pii';
import { PlinyPlugin } from './pliny';
import { PolicyPlugin } from './policy';
import { PoliticsPlugin } from './politics';
import { PromptExtractionPlugin } from './promptExtraction';
import { RbacPlugin } from './rbac';
import { ShellInjectionPlugin } from './shellInjection';
import { SqlInjectionPlugin } from './sqlInjection';

export interface PluginFactory {
  key: string;
  validate?: (config: PluginConfig) => void;
  action: (params: PluginActionParams) => Promise<TestCase[]>;
}

type PluginClass<T extends PluginConfig> = new (
  provider: ApiProvider,
  purpose: string,
  injectVar: string,
  config: T,
) => RedteamPluginBase;

async function fetchRemoteTestCases(
  key: string,
  purpose: string,
  injectVar: string,
  n: number,
  config?: PluginConfig,
): Promise<TestCase[]> {
  invariant(
    !getEnvBool('PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION'),
    'fetchRemoteTestCases should never be called when remote generation is disabled',
  );

  const body = JSON.stringify({
    config,
    injectVar,
    n,
    purpose,
    task: key,
    version: VERSION,
    email: getUserEmail(),
  });
  try {
    const { data } = await fetchWithCache(
      getRemoteGenerationUrl(),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body,
      },
      REQUEST_TIMEOUT_MS,
    );
    const ret = (data as { result: TestCase[] }).result;
    logger.debug(`Received remote generation for ${key}:\n${JSON.stringify(ret)}`);
    return ret;
  } catch (err) {
    logger.error(`Error generating test cases for ${key}: ${err}`);
    return [];
  }
}

function createPluginFactory<T extends PluginConfig>(
  PluginClass: PluginClass<T>,
  key: string,
  validate?: (config: T) => void,
): PluginFactory {
  return {
    key,
    validate: validate as ((config: PluginConfig) => void) | undefined,
    action: async ({ provider, purpose, injectVar, n, delayMs, config }: PluginActionParams) => {
      if (shouldGenerateRemote()) {
        return fetchRemoteTestCases(key, purpose, injectVar, n, config);
      }
      logger.debug(`Using local redteam generation for ${key}`);
      return new PluginClass(provider, purpose, injectVar, config as T).generateTests(n, delayMs);
    },
  };
}

const alignedHarmCategories = Object.keys(REDTEAM_PROVIDER_HARM_PLUGINS) as Array<
  keyof typeof REDTEAM_PROVIDER_HARM_PLUGINS
>;
const unalignedHarmCategories = Object.keys(UNALIGNED_PROVIDER_HARM_PLUGINS) as Array<
  keyof typeof UNALIGNED_PROVIDER_HARM_PLUGINS
>;

const pluginFactories: PluginFactory[] = [
  createPluginFactory(BeavertailsPlugin, 'beavertails'),
  createPluginFactory(ContractPlugin, 'contracts'),
  createPluginFactory(CrossSessionLeakPlugin, 'cross-session-leak'),
  createPluginFactory(CyberSecEvalPlugin, 'cyberseceval'),
  createPluginFactory(DebugAccessPlugin, 'debug-access'),
  createPluginFactory(DivergentRepetitionPlugin, 'divergent-repetition'),
  ...alignedHarmCategories.map((category) =>
    createPluginFactory(
      class extends AlignedHarmfulPlugin {
        constructor(
          provider: ApiProvider,
          purpose: string,
          injectVar: string,
          config: PluginConfig,
        ) {
          super(provider, purpose, injectVar, category, config);
        }
      },
      category,
    ),
  ),
  createPluginFactory(ExcessiveAgencyPlugin, 'excessive-agency'),
  createPluginFactory(HarmbenchPlugin, 'harmbench'),
  createPluginFactory(HallucinationPlugin, 'hallucination'),
  createPluginFactory(ImitationPlugin, 'imitation'),
  createPluginFactory<{ intent: string }>(IntentPlugin, 'intent', (config: { intent: string }) =>
    invariant(config.intent, 'Intent plugin requires `config.intent` to be set'),
  ),
  createPluginFactory(OverreliancePlugin, 'overreliance'),
  createPluginFactory(PlinyPlugin, 'pliny'),
  createPluginFactory(PoliticsPlugin, 'politics'),
  createPluginFactory<{ policy: string }>(PolicyPlugin, 'policy', (config: { policy: string }) =>
    invariant(config.policy, 'Policy plugin requires `config.policy` to be set'),
  ),
  createPluginFactory<{ systemPrompt: string }>(
    PromptExtractionPlugin,
    'prompt-extraction',
    (config: { systemPrompt: string }) =>
      invariant(
        config.systemPrompt,
        'Prompt extraction plugin requires `config.systemPrompt` to be set',
      ),
  ),
  createPluginFactory(RbacPlugin, 'rbac'),
  createPluginFactory(ShellInjectionPlugin, 'shell-injection'),
  createPluginFactory(SqlInjectionPlugin, 'sql-injection'),
  ...unalignedHarmCategories.map((category) => ({
    key: category,
    action: async (params: PluginActionParams) => {
      if (neverGenerateRemote()) {
        throw new Error(`${category} plugin requires remote generation to be enabled`);
      }
      return getHarmfulTests(params, category);
    },
  })),
];

const piiPlugins: PluginFactory[] = PII_PLUGINS.map((category: string) => ({
  key: category,
  action: async (params: PluginActionParams) => {
    if (shouldGenerateRemote()) {
      return fetchRemoteTestCases(category, params.purpose, params.injectVar, params.n);
    }
    logger.debug(`Using local redteam generation for ${category}`);
    return getPiiLeakTestsForCategory(params, category);
  },
}));

function createRemotePlugin<T extends PluginConfig>(
  key: string,
  validate?: (config: T) => void,
): PluginFactory {
  return {
    key,
    validate: validate as ((config: PluginConfig) => void) | undefined,
    action: async ({ purpose, injectVar, n, config }: PluginActionParams) => {
      if (neverGenerateRemote()) {
        throw new Error(`${key} plugin requires remote generation to be enabled`);
      }
      const testCases: TestCase[] = await fetchRemoteTestCases(key, purpose, injectVar, n, config);
      if (key.startsWith('harmful:')) {
        return testCases.map((testCase) => ({
          ...testCase,
          assert: getHarmfulAssertions(key as HarmPlugin),
        }));
      }
      return testCases;
    },
  };
}
const remotePlugins: PluginFactory[] = [
  'ascii-smuggling',
  'bfla',
  'bola',
  'competitors',
  'harmful:misinformation-disinformation',
  'harmful:specialized-advice',
  'hijacking',
  'rag-document-exfiltration',
  'religion',
  'ssrf',
  'system-prompt-override',
].map((key) => createRemotePlugin(key));

remotePlugins.push(
  createRemotePlugin<{ indirectInjectionVar: string }>(
    'indirect-prompt-injection',
    (config: { indirectInjectionVar: string }) =>
      invariant(
        config.indirectInjectionVar,
        'Indirect prompt injection plugin requires `config.indirectInjectionVar` to be set',
      ),
  ),
);

export const Plugins: PluginFactory[] = [...pluginFactories, ...piiPlugins, ...remotePlugins];
