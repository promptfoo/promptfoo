import { fetchWithCache } from '../../cache.js';
import { VERSION } from '../../constants.js';
import { getEnvBool } from '../../envars.js';
import { getUserEmail } from '../../globalConfig/accounts.js';
import logger from '../../logger.js';
import { REQUEST_TIMEOUT_MS } from '../../providers/shared.js';
import invariant from '../../util/invariant.js';
import {
  BIAS_PLUGINS,
  PII_PLUGINS,
  REDTEAM_PROVIDER_HARM_PLUGINS,
  UNALIGNED_PROVIDER_HARM_PLUGINS,
} from '../constants';
import {
  getRemoteGenerationUrl,
  neverGenerateRemote,
  shouldGenerateRemote,
} from '../remoteGeneration';
import { getShortPluginId } from '../util.js';
import { AegisPlugin } from './aegis.js';
import { type RedteamPluginBase } from './base.js';
import { BeavertailsPlugin } from './beavertails.js';
import { ContractPlugin } from './contracts.js';
import { CrossSessionLeakPlugin } from './crossSessionLeak.js';
import { CyberSecEvalPlugin } from './cyberseceval.js';
import { DebugAccessPlugin } from './debugAccess.js';
import { DivergentRepetitionPlugin } from './divergentRepetition.js';
import { DoNotAnswerPlugin } from './donotanswer.js';
import { ExcessiveAgencyPlugin } from './excessiveAgency.js';
import { HallucinationPlugin } from './hallucination.js';
import { HarmbenchPlugin } from './harmbench.js';
import { AlignedHarmfulPlugin } from './harmful/aligned.js';
import { getHarmfulAssertions } from './harmful/common.js';
import { getHarmfulTests } from './harmful/unaligned.js';
import { ImitationPlugin } from './imitation.js';
import { IntentPlugin } from './intent.js';
import { OverreliancePlugin } from './overreliance.js';
import { getPiiLeakTestsForCategory } from './pii.js';
import { PlinyPlugin } from './pliny.js';
import { isValidPolicyObject, PolicyPlugin } from './policy.js';
import { PoliticsPlugin } from './politics.js';
import { PromptExtractionPlugin } from './promptExtraction.js';
import { RbacPlugin } from './rbac.js';
import { ShellInjectionPlugin } from './shellInjection.js';
import { SqlInjectionPlugin } from './sqlInjection.js';
import { ToolDiscoveryPlugin } from './toolDiscovery.js';
import { ToxicChatPlugin } from './toxicChat.js';
import { UnsafeBenchPlugin } from './unsafebench.js';
import { UnverifiableClaimsPlugin } from './unverifiableClaims.js';
import { VLGuardPlugin } from './vlguard.js';
import { XSTestPlugin } from './xstest.js';

import type { ApiProvider, PluginActionParams, PluginConfig, TestCase } from '../../types/index.js';
import type { HarmPlugin } from '../constants.js';

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
  config: PluginConfig,
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
    const { data, status, statusText } = await fetchWithCache(
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

    if (status !== 200 || !data || !data.result || !Array.isArray(data.result)) {
      logger.error(`Error generating test cases for ${key}: ${statusText} ${JSON.stringify(data)}`);
      return [];
    }
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
      if ((PluginClass as any).canGenerateRemote === false || !shouldGenerateRemote()) {
        logger.debug(`Using local redteam generation for ${key}`);
        return new PluginClass(provider, purpose, injectVar, config as T).generateTests(n, delayMs);
      }
      const testCases = await fetchRemoteTestCases(key, purpose, injectVar, n, config ?? {});
      return testCases.map((testCase) => ({
        ...testCase,
        metadata: {
          ...testCase.metadata,
          pluginId: getShortPluginId(key),
        },
      }));
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
  ...alignedHarmCategories.map((category) =>
    createPluginFactory(
      class extends AlignedHarmfulPlugin {
        get id(): string {
          return category;
        }

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
  createPluginFactory(ContractPlugin, 'contracts'),
  createPluginFactory(CrossSessionLeakPlugin, 'cross-session-leak'),
  createPluginFactory(CyberSecEvalPlugin, 'cyberseceval'),
  createPluginFactory(DebugAccessPlugin, 'debug-access'),
  createPluginFactory(DivergentRepetitionPlugin, 'divergent-repetition'),
  createPluginFactory(DoNotAnswerPlugin, 'donotanswer'),
  createPluginFactory(ExcessiveAgencyPlugin, 'excessive-agency'),
  createPluginFactory(XSTestPlugin, 'xstest'),
  createPluginFactory(ToolDiscoveryPlugin, 'tool-discovery'),
  createPluginFactory(HarmbenchPlugin, 'harmbench'),
  createPluginFactory(ToxicChatPlugin, 'toxic-chat'),
  createPluginFactory(AegisPlugin, 'aegis'),
  createPluginFactory(HallucinationPlugin, 'hallucination'),
  createPluginFactory(ImitationPlugin, 'imitation'),
  createPluginFactory<{ intent: string }>(IntentPlugin, 'intent', (config: { intent: string }) =>
    invariant(config.intent, 'Intent plugin requires `config.intent` to be set'),
  ),
  createPluginFactory(OverreliancePlugin, 'overreliance'),
  createPluginFactory(PlinyPlugin, 'pliny'),
  createPluginFactory<{ policy: any }>(PolicyPlugin, 'policy', (config: { policy: any }) =>
    // Validate the policy plugin config and provide a meaningful error message to the user.
    invariant(
      config.policy && (typeof config.policy === 'string' || isValidPolicyObject(config.policy)),
      `One of the policy plugins is invalid. The \`config\` property of a policy plugin must be \`{ "policy": { "id": "<policy_id>", "text": "<policy_text>" } }\` or \`{ "policy": "<policy_text>" }\`. Received: ${JSON.stringify(config)}`,
    ),
  ),
  createPluginFactory(PoliticsPlugin, 'politics'),
  createPluginFactory<{ systemPrompt?: string }>(PromptExtractionPlugin, 'prompt-extraction'),
  createPluginFactory(RbacPlugin, 'rbac'),
  createPluginFactory(ShellInjectionPlugin, 'shell-injection'),
  createPluginFactory(SqlInjectionPlugin, 'sql-injection'),
  createPluginFactory(UnsafeBenchPlugin, 'unsafebench'),
  createPluginFactory(UnverifiableClaimsPlugin, 'unverifiable-claims'),
  createPluginFactory(VLGuardPlugin, 'vlguard'),
  ...unalignedHarmCategories.map((category) => ({
    key: category,
    action: async (params: PluginActionParams) => {
      if (neverGenerateRemote()) {
        logger.error(`${category} plugin requires remote generation to be enabled`);
        return [];
      }

      const testCases = await getHarmfulTests(params, category);
      return testCases.map((testCase) => ({
        ...testCase,
        metadata: {
          ...testCase.metadata,
          pluginId: getShortPluginId(category),
        },
      }));
    },
  })),
];

const piiPlugins: PluginFactory[] = PII_PLUGINS.map((category: string) => ({
  key: category,
  action: async (params: PluginActionParams) => {
    if (shouldGenerateRemote()) {
      const testCases = await fetchRemoteTestCases(
        category,
        params.purpose,
        params.injectVar,
        params.n,
        params.config ?? {},
      );
      return testCases.map((testCase) => ({
        ...testCase,
        metadata: {
          ...testCase.metadata,
          pluginId: getShortPluginId(category),
        },
      }));
    }
    logger.debug(`Using local redteam generation for ${category}`);
    const testCases = await getPiiLeakTestsForCategory(params, category);
    return testCases.map((testCase) => ({
      ...testCase,
      metadata: {
        ...testCase.metadata,
        pluginId: getShortPluginId(category),
      },
    }));
  },
}));

const biasPlugins: PluginFactory[] = BIAS_PLUGINS.map((category: string) => ({
  key: category,
  action: async (params: PluginActionParams) => {
    if (neverGenerateRemote()) {
      logger.error(`${category} plugin requires remote generation to be enabled`);
      return [];
    }

    const testCases = await fetchRemoteTestCases(
      category,
      params.purpose,
      params.injectVar,
      params.n,
      params.config ?? {},
    );
    return testCases.map((testCase) => ({
      ...testCase,
      metadata: {
        ...testCase.metadata,
        pluginId: getShortPluginId(category),
      },
    }));
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
        logger.error(`${key} plugin requires remote generation to be enabled`);
        return [];
      }
      const testCases: TestCase[] = await fetchRemoteTestCases(
        key,
        purpose,
        injectVar,
        n,
        config ?? {},
      );
      const testsWithMetadata = testCases.map((testCase) => ({
        ...testCase,
        metadata: {
          ...testCase.metadata,
          pluginId: getShortPluginId(key),
        },
      }));

      if (key.startsWith('harmful:') || key.startsWith('bias:')) {
        return testsWithMetadata.map((testCase) => ({
          ...testCase,
          assert: getHarmfulAssertions(key as HarmPlugin),
        }));
      }
      return testsWithMetadata;
    },
  };
}
const remotePlugins: PluginFactory[] = [
  'agentic:memory-poisoning',
  'ascii-smuggling',
  'bfla',
  'bola',
  'cca',
  'competitors',
  'harmful:misinformation-disinformation',
  'harmful:specialized-advice',
  'hijacking',
  'mcp',
  'medical:anchoring-bias',
  'medical:hallucination',
  'medical:incorrect-knowledge',
  'medical:off-label-use',
  'medical:prioritization-error',
  'medical:sycophancy',
  'financial:calculation-error',
  'financial:compliance-violation',
  'financial:confidential-disclosure',
  'financial:counterfactual',
  'financial:data-leakage',
  'financial:defamation',
  'financial:hallucination',
  'financial:impartiality',
  'financial:misconduct',
  'financial:sycophancy',
  'off-topic',
  'rag-document-exfiltration',
  'rag-poisoning',
  'reasoning-dos',
  'religion',
  'special-token-injection',
  'ssrf',
  'system-prompt-override',
].map((key) => createRemotePlugin(key));

remotePlugins.push(
  createRemotePlugin<{ indirectInjectionVar: string }>(
    'indirect-prompt-injection',
    (config: { indirectInjectionVar: string }) =>
      invariant(
        config.indirectInjectionVar,
        'Indirect prompt injection plugin requires `config.indirectInjectionVar` to be set. If using this plugin in a plugin collection, configure this plugin separately.',
      ),
  ),
);

export const Plugins: PluginFactory[] = [
  ...pluginFactories,
  ...piiPlugins,
  ...biasPlugins,
  ...remotePlugins,
];
