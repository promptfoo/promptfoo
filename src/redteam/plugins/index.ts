import invariant from 'tiny-invariant';
import { fetchWithCache } from '../../cache';
import { getEnvBool } from '../../envars';
import logger from '../../logger';
import { REQUEST_TIMEOUT_MS } from '../../providers/shared';
import type { ApiProvider, PluginConfig, TestCase } from '../../types';
import { HARM_PLUGINS, PII_PLUGINS, REMOTE_GENERATION_URL } from '../constants';
import { shouldGenerateRemote } from '../util';
import { AsciiSmugglingPlugin } from './asciiSmuggling';
import { type PluginBase } from './base';
import { BflaPlugin } from './bfla';
import { BolaPlugin } from './bola';
import { CompetitorPlugin } from './competitors';
import { ContractPlugin } from './contracts';
import { CrossSessionLeakPlugin } from './crossSessionLeak';
import { DebugAccessPlugin } from './debugAccess';
import { ExcessiveAgencyPlugin } from './excessiveAgency';
import { HallucinationPlugin } from './hallucination';
import { getHarmfulTests } from './harmful';
import { HijackingPlugin } from './hijacking';
import { ImitationPlugin } from './imitation';
import { IndirectPromptInjectionPlugin } from './indirectPromptInjection';
import { OverreliancePlugin } from './overreliance';
import { getPiiLeakTestsForCategory } from './pii';
import { PolicyPlugin } from './policy';
import { PoliticsPlugin } from './politics';
import { PromptExtractionPlugin } from './promptExtraction';
import { RbacPlugin } from './rbac';
import { ShellInjectionPlugin } from './shellInjection';
import { SqlInjectionPlugin } from './sqlInjection';
import { SsrfPlugin } from './ssrf';

export interface PluginFactory {
  key: string;
  validate?: (config: PluginConfig) => void;
  action: (
    provider: ApiProvider,
    purpose: string,
    injectVar: string,
    n: number,
    delayMs: number,
    config?: PluginConfig,
  ) => Promise<TestCase[]>;
}

type PluginClass<T extends PluginConfig> = new (
  provider: ApiProvider,
  purpose: string,
  injectVar: string,
  config: T,
) => PluginBase;

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
    task: key,
    purpose,
    injectVar,
    n,
    config,
  });
  logger.debug(`Using remote redteam generation for ${key}:\n${body}`);
  try {
    const { data } = await fetchWithCache(
      REMOTE_GENERATION_URL,
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
    action: async (provider, purpose, injectVar, n, delayMs, config) => {
      if (shouldGenerateRemote()) {
        return fetchRemoteTestCases(key, purpose, injectVar, n, config);
      }
      logger.debug(`Using local redteam generation for ${key}`);
      return new PluginClass(provider, purpose, injectVar, config as T).generateTests(n, delayMs);
    },
  };
}

const pluginFactories: PluginFactory[] = [
  createPluginFactory(AsciiSmugglingPlugin, 'ascii-smuggling'),
  createPluginFactory(CompetitorPlugin, 'competitors'),
  createPluginFactory(ContractPlugin, 'contracts'),
  createPluginFactory(CrossSessionLeakPlugin, 'cross-session-leak'),
  createPluginFactory(ExcessiveAgencyPlugin, 'excessive-agency'),
  createPluginFactory(HallucinationPlugin, 'hallucination'),
  createPluginFactory(HijackingPlugin, 'hijacking'),
  createPluginFactory(ImitationPlugin, 'imitation'),
  createPluginFactory(OverreliancePlugin, 'overreliance'),
  createPluginFactory(SqlInjectionPlugin, 'sql-injection'),
  createPluginFactory(ShellInjectionPlugin, 'shell-injection'),
  createPluginFactory(DebugAccessPlugin, 'debug-access'),
  createPluginFactory(RbacPlugin, 'rbac'),
  createPluginFactory(PoliticsPlugin, 'politics'),
  createPluginFactory(BolaPlugin, 'bola'),
  createPluginFactory(BflaPlugin, 'bfla'),
  createPluginFactory(SsrfPlugin, 'ssrf'),
  createPluginFactory<{ policy: string }>(PolicyPlugin, 'policy', (config) =>
    invariant(config.policy, 'Policy plugin requires `config.policy` to be set'),
  ),
  createPluginFactory<{ systemPrompt: string }>(
    PromptExtractionPlugin,
    'prompt-extraction',
    (config) =>
      invariant(
        config.systemPrompt,
        'Prompt extraction plugin requires `config.systemPrompt` to be set',
      ),
  ),
  createPluginFactory<{ indirectInjectionVar: string }>(
    IndirectPromptInjectionPlugin,
    'indirect-prompt-injection',
    (config) =>
      invariant(
        config.indirectInjectionVar,
        'Indirect prompt injection plugin requires `config.indirectInjectionVar` to be set',
      ),
  ),
];

const harmPlugins: PluginFactory[] = Object.keys(HARM_PLUGINS).map((category) => ({
  key: category,
  action: async (provider, purpose, injectVar, n, delayMs) => {
    if (shouldGenerateRemote()) {
      return fetchRemoteTestCases(category, purpose, injectVar, n);
    }
    logger.debug(`Using local redteam generation for ${category}`);
    return getHarmfulTests(provider, purpose, injectVar, [category], n, delayMs);
  },
}));

const piiPlugins: PluginFactory[] = PII_PLUGINS.map((category) => ({
  key: category,
  action: async (provider, purpose, injectVar, n) => {
    if (shouldGenerateRemote()) {
      return fetchRemoteTestCases(category, purpose, injectVar, n);
    }
    logger.debug(`Using local redteam generation for ${category}`);
    return getPiiLeakTestsForCategory(provider, purpose, injectVar, category, n);
  },
}));

export const Plugins: PluginFactory[] = [...pluginFactories, ...harmPlugins, ...piiPlugins];
