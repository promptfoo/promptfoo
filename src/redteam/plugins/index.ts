import invariant from 'tiny-invariant';
import { fetchWithCache } from '../../cache';
import { VERSION } from '../../constants';
import { getEnvBool } from '../../envars';
import logger from '../../logger';
import { REQUEST_TIMEOUT_MS } from '../../providers/shared';
import type { ApiProvider, PluginConfig, TestCase } from '../../types';
import { HARM_PLUGINS, PII_PLUGINS, REMOTE_GENERATION_URL } from '../constants';
import { neverGenerateRemote, shouldGenerateRemote } from '../util';
import { type RedteamPluginBase } from './base';
import { ContractPlugin } from './contracts';
import { CrossSessionLeakPlugin } from './crossSessionLeak';
import { DebugAccessPlugin } from './debugAccess';
import { ExcessiveAgencyPlugin } from './excessiveAgency';
import { HallucinationPlugin } from './hallucination';
import { getHarmfulTests } from './harmful';
import { ImitationPlugin } from './imitation';
import { OverreliancePlugin } from './overreliance';
import { getPiiLeakTestsForCategory } from './pii';
import { PolicyPlugin } from './policy';
import { PoliticsPlugin } from './politics';
import { PromptExtractionPlugin } from './promptExtraction';
import { RbacPlugin } from './rbac';
import { ShellInjectionPlugin } from './shellInjection';
import { SqlInjectionPlugin } from './sqlInjection';

export interface PluginFactory {
  key: string;
  action: (
    provider: ApiProvider,
    purpose: string,
    injectVar: string,
    n: number,
    delayMs: number,
    config?: PluginConfig,
  ) => Promise<TestCase[]>;
}

type PluginClass<T extends PluginConfig = PluginConfig> = new (
  provider: ApiProvider,
  purpose: string,
  injectVar: string,
  config: T,
) => RedteamPluginBase;

function createPluginFactory(PluginClass: PluginClass, key: string): PluginFactory {
  return {
    key,
    action: async (provider, purpose, injectVar, n, delayMs, config = {}) => {
      const plugin = new PluginClass(provider, purpose, injectVar, config);
      return plugin.generateTests(n, delayMs);
    },
  };
}

const pluginFactories: PluginFactory[] = [
  createPluginFactory(ContractPlugin, 'contracts'),
  createPluginFactory(CrossSessionLeakPlugin, 'cross-session-leak'),
  createPluginFactory(ExcessiveAgencyPlugin, 'excessive-agency'),
  createPluginFactory(HallucinationPlugin, 'hallucination'),
  createPluginFactory(ImitationPlugin, 'imitation'),
  createPluginFactory(OverreliancePlugin, 'overreliance'),
  createPluginFactory(SqlInjectionPlugin, 'sql-injection'),
  createPluginFactory(ShellInjectionPlugin, 'shell-injection'),
  createPluginFactory(DebugAccessPlugin, 'debug-access'),
  createPluginFactory(RbacPlugin, 'rbac'),
  createPluginFactory(PoliticsPlugin, 'politics'),
  createPluginFactory(PolicyPlugin, 'policy'),
  createPluginFactory(PromptExtractionPlugin, 'prompt-extraction'),
];

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
    version: VERSION,
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

function createRemotePlugin(key: string): PluginFactory {
  return {
    key,
    action: async (provider, purpose, injectVar, n, delayMs, config) => {
      if (neverGenerateRemote()) {
        throw new Error(`${key} plugin requires remote generation to be enabled`);
      }
      return fetchRemoteTestCases(key, purpose, injectVar, n, config);
    },
  };
}

const remotePlugins: PluginFactory[] = [
  'ascii-smuggling',
  'bfla',
  'bola',
  'competitors',
  'hijacking',
  'religion',
  'ssrf',
  'indirect-prompt-injection',
].map((key) => createRemotePlugin(key));

export const Plugins: PluginFactory[] = [
  ...pluginFactories,
  ...harmPlugins,
  ...piiPlugins,
  ...remotePlugins,
];
