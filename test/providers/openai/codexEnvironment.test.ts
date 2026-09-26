import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../../src/cliState';
import { OpenAICodexAppServerProvider } from '../../../src/providers/openai/codex-app-server';
import { OpenAICodexSDKProvider } from '../../../src/providers/openai/codex-sdk';
import { providerRegistry } from '../../../src/providers/providerRegistry';
import { mockProcessEnv } from '../../util/utils';

import type { EnvOverrides } from '../../../src/types/env';

const masks = { OPENAI_API_KEY: '', CODEX_API_KEY: '' };

describe.each([
  ['SDK', OpenAICodexSDKProvider],
  ['app server', OpenAICodexAppServerProvider],
] as const)('Codex %s environment', (_name, Provider) => {
  let restoreEnv: () => void;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(providerRegistry, 'register').mockImplementation(() => undefined);
    restoreEnv = mockProcessEnv({ OPENAI_API_KEY: 'host-openai', CODEX_API_KEY: 'host-codex' });
  });

  afterEach(() => {
    restoreEnv();
    vi.restoreAllMocks();
    vi.resetAllMocks();
  });

  it.each([
    ['provider masks', masks, { OPENAI_API_KEY: 'suite-openai' }, undefined],
    [
      'provider alias',
      { CODEX_API_KEY: 'provider-codex' },
      { OPENAI_API_KEY: 'suite-openai' },
      'provider-codex',
    ],
    ['suite alias', undefined, { CODEX_API_KEY: 'suite-codex' }, 'suite-codex'],
    ['independent alias', { OPENAI_API_KEY: '' }, undefined, 'host-codex'],
    ['suite masks', undefined, masks, undefined],
  ] as [string, EnvOverrides | undefined, EnvOverrides | undefined, string | undefined][])(
    'resolves %s without reviving a masked credential',
    (_label, env, suite, expected) => {
      cliState.withEnv(suite, () => {
        const provider = new Provider({ env });
        expect(provider.getApiKey()).toBe(expected);
        expect(provider.apiKey).toBe(expected);
      });
    },
  );

  it('uses the current invocation for a retained provider', () => {
    const provider = new Provider();
    cliState.withEnv({ CODEX_API_KEY: 'first-codex' }, () => {
      expect(provider.getApiKey()).toBe('first-codex');
    });
    cliState.withEnv(masks, () => {
      expect(provider.getApiKey()).toBeUndefined();
    });
    expect(provider.getApiKey()).toBe('host-openai');
  });

  it('selects a file alias before a process alias', () => {
    cliState.withEnvFileOverrides({ CODEX_API_KEY: 'file-codex' }, () => {
      cliState.withEnv(undefined, () => {
        expect(new Provider().getApiKey()).toBe('file-codex');
      });
    });
  });

  it.each([false, true])('does not inherit masked keys with inherit_process_env=%s', (inherit) => {
    const provider = new Provider({ env: masks, config: { inherit_process_env: inherit } });
    const env = Reflect.get(provider, 'prepareEnvironment').call(provider, provider.config);
    expect(env).not.toHaveProperty('OPENAI_API_KEY');
    expect(env).not.toHaveProperty('CODEX_API_KEY');
    expect(provider.requiresApiKey()).toBe(false);
    // Local CLI login remains available through its ordinary home directory.
    expect(env.HOME).toBe(process.env.HOME);
  });

  it('preserves explicitly configured CLI credentials in keyless mode', () => {
    const provider = new Provider({
      env: masks,
      config: { inherit_process_env: true, cli_env: { CODEX_API_KEY: 'explicit-cli-key' } },
    });
    const env = Reflect.get(provider, 'prepareEnvironment').call(provider, provider.config);
    expect(env.CODEX_API_KEY).toBe('explicit-cli-key');
    expect(env).not.toHaveProperty('OPENAI_API_KEY');
  });

  it('injects an explicit provider key despite environment masks', () => {
    const provider = new Provider({ env: masks, config: { apiKey: 'explicit-key' } });
    const env = Reflect.get(provider, 'prepareEnvironment').call(provider, provider.config);
    expect(env.OPENAI_API_KEY).toBe('explicit-key');
    expect(env.CODEX_API_KEY).toBe('explicit-key');
  });

  it('keeps unrelated ambient keys out of a custom model provider', () => {
    const provider = new Provider({
      config: {
        model_provider: 'fixture-provider',
        inherit_process_env: true,
        cli_env: { CODEX_API_KEY: 'explicit-cli-key' },
      },
    });
    const env = Reflect.get(provider, 'prepareEnvironment').call(provider, provider.config);
    expect(env.CODEX_API_KEY).toBe('explicit-cli-key');
    expect(env).not.toHaveProperty('OPENAI_API_KEY');
  });
});
