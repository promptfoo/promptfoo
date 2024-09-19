import invariant from 'tiny-invariant';
import { fetchWithCache } from '../../cache';
import logger from '../../logger';
import { REQUEST_TIMEOUT_MS } from '../../providers/shared';
import type { PluginConfig, TestCase } from '../../types';
import { HARM_PLUGINS, PII_PLUGINS, REMOTE_GENERATION_URL } from '../constants';

export interface PluginFactory {
  key: string;
  validate?: (config: PluginConfig) => void;
  action: (
    purpose: string,
    injectVar: string,
    n: number,
    config?: PluginConfig,
  ) => Promise<TestCase[]>;
}

async function fetchRemoteTestCases(
  key: string,
  purpose: string,
  injectVar: string,
  n: number,
  config?: PluginConfig,
): Promise<TestCase[]> {
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
  key: string,
  validate?: (config: T) => void,
): PluginFactory {
  return {
    key,
    validate: validate as ((config: PluginConfig) => void) | undefined,
    action: async (purpose, injectVar, n, config) => {
      return fetchRemoteTestCases(key, purpose, injectVar, n, config);
    },
  };
}

const pluginFactories: PluginFactory[] = [
  createPluginFactory('ascii-smuggling'),
  createPluginFactory('bfla'),
  createPluginFactory('bola'),
  createPluginFactory('competitors'),
  createPluginFactory('contracts'),
  createPluginFactory('cross-session-leak'),
  createPluginFactory('debug-access'),
  createPluginFactory('excessive-agency'),
  createPluginFactory('hallucination'),
  createPluginFactory('hijacking'),
  createPluginFactory('imitation'),
  createPluginFactory('overreliance'),
  createPluginFactory('politics'),
  createPluginFactory('rbac'),
  createPluginFactory('shell-injection'),
  createPluginFactory('sql-injection'),
  createPluginFactory('ssrf'),
  createPluginFactory<{ policy: string }>('policy', (config) =>
    invariant(config.policy, 'Policy plugin requires `config.policy` to be set'),
  ),
  createPluginFactory<{ systemPrompt: string }>('prompt-extraction', (config) =>
    invariant(
      config.systemPrompt,
      'Prompt extraction plugin requires `config.systemPrompt` to be set',
    ),
  ),
  createPluginFactory<{ indirectInjectionVar: string }>('indirect-prompt-injection', (config) =>
    invariant(
      config.indirectInjectionVar,
      'Indirect prompt injection plugin requires `config.indirectInjectionVar` to be set',
    ),
  ),
];

const harmPlugins: PluginFactory[] = Object.keys(HARM_PLUGINS).map((category) => ({
  key: category,
  action: async (purpose, injectVar, n) => {
    return fetchRemoteTestCases(category, purpose, injectVar, n);
  },
}));

const piiPlugins: PluginFactory[] = PII_PLUGINS.map((category) => ({
  key: category,
  action: async (purpose, injectVar, n) => {
    return fetchRemoteTestCases(category, purpose, injectVar, n);
  },
}));

export const Plugins: PluginFactory[] = [...pluginFactories, ...harmPlugins, ...piiPlugins];
