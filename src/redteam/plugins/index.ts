import dedent from 'dedent';
import fs from 'fs';
import yaml from 'js-yaml';
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

/**
 * Resolves top-level file paths in the plugin configuration.
 * @param config - The plugin configuration to resolve.
 * @returns The resolved plugin configuration.
 */
export function resolvePluginConfig(config: Record<string, any> | undefined): Record<string, any> {
  if (!config) {
    return {};
  }

  for (const key in config) {
    const value = config[key];
    if (typeof value === 'string' && value.startsWith('file://')) {
      const filePath = value.slice('file://'.length);

      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      if (filePath.endsWith('.yaml')) {
        config[key] = yaml.load(fs.readFileSync(filePath, 'utf8'));
      } else if (filePath.endsWith('.json')) {
        config[key] = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      } else {
        config[key] = fs.readFileSync(filePath, 'utf8');
      }
    }
  }
  return config;
}

/**
 * Pre-validates all plugin configurations before test generation begins
 * @throws Error if any plugin configuration is invalid
 */
export function validatePlugins(
  plugins: { id: string; numTests: number; config?: Record<string, any> }[],
  language?: string,
) {
  for (const plugin of plugins) {
    const factory = Plugins.find((p) => p.key === plugin.id);
    if (!factory) {
      // Skip validation for custom plugins and unregistered plugins
      if (!plugin.id.startsWith('file://')) {
        logger.warn(`Plugin ${plugin.id} not registered, skipping validation`);
      }
      continue;
    }

    try {
      // Create plugin instance to validate config
      const provider = { callApi: async () => ({ output: '' }), id: () => 'dummy' };
      factory.action(provider, 'validation', 'query', 1, 0, {
        ...(language ? { language } : {}),
        ...resolvePluginConfig(plugin.config),
      });
    } catch (error) {
      throw new Error(
        dedent`
          Invalid configuration for plugin "${plugin.id}":
          ${(error as Error).message}
        `,
      );
    }
  }
}
