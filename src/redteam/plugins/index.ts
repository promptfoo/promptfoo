import { fetchWithCache } from '../../cache';
import { VERSION } from '../../constants';
import { getEnvBool } from '../../envars';
import { getUserEmail } from '../../globalConfig/accounts';
import logger from '../../logger';
import { REQUEST_TIMEOUT_MS } from '../../providers/shared';
import { checkRemoteHealth } from '../../util/apiHealth';
import invariant from '../../util/invariant';
import {
  BIAS_PLUGINS,
  PII_PLUGINS,
  REDTEAM_PROVIDER_HARM_PLUGINS,
  REMOTE_ONLY_PLUGIN_IDS,
  UNALIGNED_PROVIDER_HARM_PLUGINS,
} from '../constants';
import {
  getRemoteGenerationUrl,
  getRemoteHealthUrl,
  neverGenerateRemote,
  shouldGenerateRemote,
} from '../remoteGeneration';
import { getShortPluginId } from '../util';
import { AegisPlugin } from './aegis';
import { type RedteamPluginBase } from './base';
import { BeavertailsPlugin } from './beavertails';
import { ContractPlugin } from './contracts';
import { CrossSessionLeakPlugin } from './crossSessionLeak';
import { CyberSecEvalPlugin } from './cyberseceval';
import { DebugAccessPlugin } from './debugAccess';
import { DivergentRepetitionPlugin } from './divergentRepetition';
import { DoNotAnswerPlugin } from './donotanswer';
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
import { PolicyPlugin } from './policy/index';
import { isValidPolicyObject } from './policy/utils';
import { PoliticsPlugin } from './politics';
import { PromptExtractionPlugin } from './promptExtraction';
import { RbacPlugin } from './rbac';
import { ShellInjectionPlugin } from './shellInjection';
import { SqlInjectionPlugin } from './sqlInjection';
import { ToolDiscoveryPlugin } from './toolDiscovery';
import { ToxicChatPlugin } from './toxicChat';
import { UnsafeBenchPlugin } from './unsafebench';
import { UnverifiableClaimsPlugin } from './unverifiableClaims';
import { VLGuardPlugin } from './vlguard';
import { VLSUPlugin } from './vlsu';
import { XSTestPlugin } from './xstest';

import type { ApiProvider, PluginActionParams, PluginConfig, TestCase } from '../../types/index';
import type { HarmPlugin } from '../constants';

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

/**
 * Computes modifiers from config (same logic as appendModifiers in base.ts).
 * Used to ensure modifiers are available for strategies when using remote generation.
 */
function computeModifiersFromConfig(config: PluginConfig | undefined): Record<string, string> {
  const modifiers: Record<string, string> = {
    ...(config?.modifiers as Record<string, string> | undefined),
  };
  if (config?.language && typeof config.language === 'string') {
    modifiers.language = config.language;
  }
  if (config?.inputs && Object.keys(config.inputs).length > 0) {
    const schema = Object.entries(config.inputs as Record<string, string>)
      .map(([k, description]) => `"${k}": "${description}"`)
      .join(', ');
    modifiers.__outputFormat = `Output each test case as JSON wrapped in <Prompt> tags: <Prompt>{${schema}}</Prompt>`;
  }
  return modifiers;
}

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

  // Health check remote before generating test cases
  const remoteHealth = await checkRemoteHealth(
    getRemoteHealthUrl() as string, // Only returns null if remote gen is disabled
  );

  if (remoteHealth.status !== 'OK') {
    logger.error(`Error generating test cases for ${key}: ${remoteHealth.message}`);
    return [];
  }

  const body = JSON.stringify({
    config,
    injectVar,
    // Send inputs at top level for server compatibility (server expects it there)
    inputs: config?.inputs as Record<string, string> | undefined,
    n,
    purpose,
    task: key,
    version: VERSION,
    email: getUserEmail(),
  });

  interface PluginGenerationResponse {
    result?: TestCase[];
  }

  try {
    const { data, status, statusText } = await fetchWithCache<PluginGenerationResponse>(
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
    const ret = data.result;
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
      const computedModifiers = computeModifiersFromConfig(config);

      return testCases.map((testCase) => ({
        ...testCase,
        metadata: {
          ...testCase.metadata,
          pluginId: getShortPluginId(key),
          // Add computed config with modifiers so strategies can access them
          pluginConfig: {
            ...config,
            modifiers: computedModifiers,
          },
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
  createPluginFactory(VLSUPlugin, 'vlsu'),
  ...unalignedHarmCategories.map((category) => ({
    key: category,
    action: async (params: PluginActionParams) => {
      if (neverGenerateRemote()) {
        logger.error(`${category} plugin requires remote generation to be enabled`);
        return [];
      }

      const testCases = await getHarmfulTests(params, category);
      const computedModifiers = computeModifiersFromConfig(params.config);
      return testCases.map((testCase) => ({
        ...testCase,
        metadata: {
          ...testCase.metadata,
          pluginId: getShortPluginId(category),
          pluginConfig: {
            ...params.config,
            modifiers: computedModifiers,
          },
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
      const computedModifiers = computeModifiersFromConfig(params.config);
      return testCases.map((testCase) => ({
        ...testCase,
        metadata: {
          ...testCase.metadata,
          pluginId: getShortPluginId(category),
          pluginConfig: {
            ...params.config,
            modifiers: computedModifiers,
          },
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
    const computedModifiers = computeModifiersFromConfig(params.config);
    return testCases.map((testCase) => ({
      ...testCase,
      metadata: {
        ...testCase.metadata,
        pluginId: getShortPluginId(category),
        pluginConfig: {
          ...params.config,
          modifiers: computedModifiers,
        },
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
      const computedModifiers = computeModifiersFromConfig(config);
      const testsWithMetadata = testCases.map((testCase) => ({
        ...testCase,
        metadata: {
          ...testCase.metadata,
          pluginId: getShortPluginId(key),
          pluginConfig: {
            ...config,
            modifiers: computedModifiers,
          },
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
const remotePlugins: PluginFactory[] = REMOTE_ONLY_PLUGIN_IDS.filter(
  (id) => id !== 'indirect-prompt-injection',
).map((key) => createRemotePlugin(key));

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
