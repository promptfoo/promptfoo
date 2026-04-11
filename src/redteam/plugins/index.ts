import dedent from 'dedent';
import { fetchWithCache } from '../../cache';
import { VERSION } from '../../constants';
import { getEnvBool } from '../../envars';
import { getUserEmail } from '../../globalConfig/accounts';
import logger from '../../logger';
import { REQUEST_TIMEOUT_MS } from '../../providers/shared';
import { checkRemoteHealth } from '../../util/apiHealth';
import { retryWithDeduplication } from '../../util/generation';
import invariant from '../../util/invariant';
import {
  BIAS_PLUGINS,
  CANARY_BREAKING_STRATEGY_IDS,
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
import {
  getGeneratedPromptOverLimit,
  getMaxCharsPerMessageModifierValue,
  MAX_CHARS_PER_MESSAGE_MODIFIER_KEY,
} from '../shared/promptLength';
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
import { TeenSafetyAgeRestrictedGoodsAndServicesPlugin } from './teenSafety/ageRestrictedGoodsAndServices';
import { TeenSafetyDangerousContentPlugin } from './teenSafety/dangerousContent';
import { TeenSafetyDangerousRoleplayPlugin } from './teenSafety/dangerousRoleplay';
import { TEEN_SAFETY_DEFAULT_GRADER_EXAMPLES } from './teenSafety/graderExamples';
import { TeenSafetyHarmfulBodyIdealsPlugin } from './teenSafety/harmfulBodyIdeals';
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

const MAX_CHARS_RETRY_MODIFIER_KEY = '__maxCharsPerMessageRetry';

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
  const maxCharsModifier = getMaxCharsPerMessageModifierValue(config?.maxCharsPerMessage);
  if (maxCharsModifier) {
    modifiers[MAX_CHARS_PER_MESSAGE_MODIFIER_KEY] = maxCharsModifier;
  }
  return modifiers;
}

function applyDefaultGraderExamples(
  key: string,
  config: PluginConfig | undefined,
): PluginConfig | undefined {
  const defaultGraderExamples = TEEN_SAFETY_DEFAULT_GRADER_EXAMPLES[key];

  if (!defaultGraderExamples?.length) {
    return config;
  }

  return {
    ...config,
    graderExamples: [...defaultGraderExamples, ...(config?.graderExamples ?? [])],
  };
}

function applyDefaultRemotePluginConfig(
  key: string,
  config: PluginConfig | undefined,
): PluginConfig | undefined {
  const configWithDefaultExamples = applyDefaultGraderExamples(key, config);

  if (!key.startsWith('coding-agent:')) {
    return configWithDefaultExamples;
  }

  return {
    ...configWithDefaultExamples,
    excludeStrategies: [
      ...new Set([
        ...CANARY_BREAKING_STRATEGY_IDS,
        ...(configWithDefaultExamples?.excludeStrategies ?? []),
      ]),
    ],
  };
}

function isValidMaxCharsPerMessage(limit: unknown): limit is number {
  return typeof limit === 'number' && Number.isInteger(limit) && limit > 0;
}

function getMaxCharsPerMessageFromConfig(config: PluginConfig | undefined): number | undefined {
  if (isValidMaxCharsPerMessage(config?.maxCharsPerMessage)) {
    return config.maxCharsPerMessage;
  }

  const maxCharsModifier = (config?.modifiers as Record<string, string> | undefined)?.[
    MAX_CHARS_PER_MESSAGE_MODIFIER_KEY
  ];
  if (typeof maxCharsModifier !== 'string') {
    return undefined;
  }

  const match = /must be (\d+) characters or fewer\./.exec(maxCharsModifier);
  if (!match) {
    return undefined;
  }

  const maxCharsPerMessage = Number(match[1]);
  return isValidMaxCharsPerMessage(maxCharsPerMessage) ? maxCharsPerMessage : undefined;
}

function clonePluginConfig(config: PluginConfig | undefined): PluginConfig | undefined {
  if (!config) {
    return undefined;
  }

  return {
    ...config,
    modifiers: {
      ...((config.modifiers as Record<string, string> | undefined) ?? {}),
    },
  };
}

function buildRetryConfig(
  config: PluginConfig | undefined,
  retryInstructions: string | undefined,
): PluginConfig | undefined {
  const retryConfig = clonePluginConfig(config);
  if (!retryConfig || !retryInstructions) {
    return retryConfig;
  }

  retryConfig.modifiers = {
    ...((retryConfig.modifiers as Record<string, string> | undefined) ?? {}),
    [MAX_CHARS_RETRY_MODIFIER_KEY]: retryInstructions,
  };

  return retryConfig;
}

function stripRetryModifier(testCase: TestCase): TestCase {
  const pluginConfig = testCase.metadata?.pluginConfig;
  const modifiers = pluginConfig?.modifiers as Record<string, string> | undefined;
  if (!modifiers || !(MAX_CHARS_RETRY_MODIFIER_KEY in modifiers)) {
    return testCase;
  }

  const { [MAX_CHARS_RETRY_MODIFIER_KEY]: _retryInstructions, ...remainingModifiers } = modifiers;

  return {
    ...testCase,
    metadata: {
      ...testCase.metadata,
      pluginConfig: {
        ...pluginConfig,
        modifiers: remainingModifiers,
      },
    },
  };
}

function dedupeTestCases(testCases: TestCase[]): TestCase[] {
  const deduped: TestCase[] = [];
  const seen = new Set<string>();

  for (const testCase of testCases) {
    const normalizedTestCase = stripRetryModifier(testCase);
    const provider =
      typeof normalizedTestCase.provider === 'string'
        ? normalizedTestCase.provider
        : normalizedTestCase.provider && typeof normalizedTestCase.provider === 'object'
          ? (normalizedTestCase.provider as { id?: unknown }).id
          : undefined;
    const dedupKey = JSON.stringify({
      vars: normalizedTestCase.vars,
      assert: normalizedTestCase.assert,
      options: normalizedTestCase.options,
      metadata: normalizedTestCase.metadata,
      provider,
    });

    if (seen.has(dedupKey)) {
      continue;
    }

    seen.add(dedupKey);
    deduped.push(normalizedTestCase);
  }

  return deduped;
}

function buildMaxCharsRetryInstructions(rejectedPromptLengths: number[], limit?: number): string {
  const longestRejectedPromptText =
    rejectedPromptLengths.length > 0
      ? `${Math.max(...rejectedPromptLengths)} characters`
      : 'unknown length';

  return dedent`
    Your previous response included ${rejectedPromptLengths.length} generated prompt${
      rejectedPromptLengths.length === 1 ? '' : 's'
    } that exceeded the ${limit ?? 'configured'}-character limit.
    The longest rejected prompt was ${longestRejectedPromptText}.
    Generate replacement prompts only, and keep every user message within the character limit.
  `.trim();
}

function withMaxCharsRetries(pluginFactory: PluginFactory): PluginFactory {
  return {
    ...pluginFactory,
    action: async (params: PluginActionParams) => {
      const maxCharsPerMessage = getMaxCharsPerMessageFromConfig(params.config);
      if (!maxCharsPerMessage) {
        return pluginFactory.action(params);
      }

      let retryInstructions: string | undefined;
      const generateValidTestCases = async (currentTestCases: TestCase[]): Promise<TestCase[]> => {
        const retryConfig = buildRetryConfig(params.config, retryInstructions);
        const generatedTestCases = await pluginFactory.action({
          ...params,
          n: Math.max(params.n - currentTestCases.length, 0),
          config: retryConfig,
        });

        const validTestCases: TestCase[] = [];
        const rejectedPromptLengths: number[] = [];
        let rejectedPromptLimit: number | undefined;

        for (const testCase of generatedTestCases) {
          const violation = getGeneratedPromptOverLimit(
            String(testCase.vars?.[params.injectVar] ?? ''),
            maxCharsPerMessage,
          );
          if (violation) {
            rejectedPromptLengths.push(violation.length);
            rejectedPromptLimit = violation.limit;
            continue;
          }

          validTestCases.push(stripRetryModifier(testCase));
        }

        retryInstructions =
          rejectedPromptLengths.length > 0
            ? buildMaxCharsRetryInstructions(rejectedPromptLengths, rejectedPromptLimit)
            : undefined;

        return validTestCases;
      };

      const testCases = await retryWithDeduplication(
        generateValidTestCases,
        params.n,
        2,
        dedupeTestCases,
      );

      return testCases.map(stripRetryModifier);
    },
  };
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

  // Strip graderExamples before sending - they're not used during generation,
  // only during grading. The CLI re-attaches the full config to test case metadata after.
  const { graderExamples, ...configForRemote } = config ?? {};
  const maxCharsModifier = getMaxCharsPerMessageModifierValue(config?.maxCharsPerMessage);
  if (maxCharsModifier) {
    configForRemote.modifiers = {
      ...((configForRemote.modifiers as Record<string, string> | undefined) ?? {}),
      [MAX_CHARS_PER_MESSAGE_MODIFIER_KEY]: maxCharsModifier,
    };
  }
  const body = JSON.stringify({
    config: configForRemote,
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
      const configWithDefaults = applyDefaultGraderExamples(key, config as T);

      if ((PluginClass as any).canGenerateRemote === false || !shouldGenerateRemote()) {
        logger.debug(`Using local redteam generation for ${key}`);
        return new PluginClass(provider, purpose, injectVar, configWithDefaults as T).generateTests(
          n,
          delayMs,
        );
      }
      const testCases = await fetchRemoteTestCases(
        key,
        purpose,
        injectVar,
        n,
        configWithDefaults ?? {},
      );
      const computedModifiers = computeModifiersFromConfig(configWithDefaults);

      return testCases.map((testCase) => ({
        ...testCase,
        metadata: {
          ...testCase.metadata,
          pluginId: getShortPluginId(key),
          // Add computed config with modifiers so strategies can access them
          pluginConfig: {
            ...configWithDefaults,
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
  createPluginFactory(
    TeenSafetyAgeRestrictedGoodsAndServicesPlugin,
    'teen-safety:age-restricted-goods-and-services',
  ),
  createPluginFactory(TeenSafetyDangerousContentPlugin, 'teen-safety:dangerous-content'),
  createPluginFactory(TeenSafetyDangerousRoleplayPlugin, 'teen-safety:dangerous-roleplay'),
  createPluginFactory(TeenSafetyHarmfulBodyIdealsPlugin, 'teen-safety:harmful-body-ideals'),
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
      const configWithDefaults = applyDefaultRemotePluginConfig(key, config);

      if (neverGenerateRemote()) {
        logger.error(`${key} plugin requires remote generation to be enabled`);
        return [];
      }
      const testCases: TestCase[] = await fetchRemoteTestCases(
        key,
        purpose,
        injectVar,
        n,
        configWithDefaults ?? {},
      );
      const computedModifiers = computeModifiersFromConfig(configWithDefaults);
      const testsWithMetadata = testCases.map((testCase) => ({
        ...testCase,
        metadata: {
          ...testCase.metadata,
          pluginId: getShortPluginId(key),
          pluginConfig: {
            ...configWithDefaults,
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
  (id) => id !== 'indirect-prompt-injection' && id !== 'rag-poisoning',
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

remotePlugins.push(
  createRemotePlugin<{ intendedResults: string[] }>(
    'rag-poisoning',
    (config: { intendedResults: string[] }) =>
      invariant(
        Array.isArray(config.intendedResults) && config.intendedResults.length > 0,
        'RAG Poisoning plugin requires `config.intendedResults` to be set to a non-empty array of expected outcomes from poisoned documents',
      ),
  ),
);

export const Plugins: PluginFactory[] = [
  ...pluginFactories,
  ...piiPlugins,
  ...biasPlugins,
  ...remotePlugins,
].map(withMaxCharsRetries);
