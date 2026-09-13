import { useRedTeamConfig } from '@app/pages/redteam/setup/hooks/useRedTeamConfig';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useStore } from './evalConfig';

import type { UnifiedConfig } from '../../../types/index';

const locals = ['llamafile', 'vllm', 'text-generation-webui'] as const;
const entries = ['setConfig', 'updateConfig', 'rehydrate'] as const;

function importedConfig(type: (typeof locals)[number] = 'vllm') {
  const providerEnv: Record<string, string> = {
    LOCAL_SOURCE: 'SHORT',
    VISIBLE: 'provider ordinary',
  };
  return {
    providers: [
      {
        id: 'openai:chat',
        label: 'Local reference',
        env: providerEnv,
        config: {
          type,
          model: 'tenant/model:Q4_K_M',
          apiBaseUrl: 'https://local.example.test/tenant/v1',
          useDefaultApiKey: '{{ env.LOCAL_SOURCE }}',
          apiKey: '{{ env.RUNTIME_SOURCE }}',
          stop: ['<end>'],
        },
      },
    ],
    env: { LOCAL_SOURCE: 'SHORT', RUNTIME_SOURCE: 'OTHER', VISIBLE: 'ordinary' },
    prompts: ['Hello {{ ordinary }}'],
    tests: [{ vars: { ordinary: 'keep' } }],
  };
}

function persistedConfig() {
  return JSON.parse(localStorage.getItem('promptfoo')!).state.config;
}

function expectRedacted() {
  const serialized = localStorage.getItem('promptfoo')!;
  expect(serialized).not.toContain('SHORT');
  expect(serialized).not.toContain('OTHER');
  const saved = persistedConfig();
  expect(saved.env).toEqual({ VISIBLE: 'ordinary' });
  expect(saved.providers[0].env).toEqual({ VISIBLE: 'provider ordinary' });
  expect(saved.providers[0].config).toMatchObject({
    model: 'tenant/model:Q4_K_M',
    apiBaseUrl: 'https://local.example.test/tenant/v1',
    apiKey: '{{ env.RUNTIME_SOURCE }}',
    useDefaultApiKey: false,
    stop: ['<end>'],
  });
  expect(saved.tests).toEqual([{ vars: { ordinary: 'keep' } }]);
}

beforeEach(() => {
  useStore.getState().reset();
  useRedTeamConfig.setState(useRedTeamConfig.getInitialState());
  localStorage.clear();
});

afterEach(() => {
  useStore.getState().reset();
  useRedTeamConfig.setState(useRedTeamConfig.getInitialState());
  localStorage.clear();
});

describe('local credential reference persistence', () => {
  it.each(locals.flatMap((type) => entries.map((entry) => ({ type, entry }))))(
    'redacts original $type references through $entry and reload',
    async ({ type, entry }) => {
      const input = importedConfig(type);
      const original = JSON.parse(JSON.stringify(input));
      if (entry === 'rehydrate') {
        localStorage.setItem('promptfoo', JSON.stringify({ state: { config: input }, version: 0 }));
        await useStore.persist.rehydrate();
      } else {
        useStore.getState()[entry](input);
        const live = useStore.getState().config;
        expect(live.env).toEqual(input.env);
        expect(live.providers).toEqual([
          {
            ...input.providers[0],
            config: { ...input.providers[0].config, apiKeyRequired: false },
          },
        ]);
        expect(useStore.getState().getTestSuite().env).toEqual(input.env);
        expect(useStore.getState().getTestSuite().providers).toEqual([
          {
            ...input.providers[0],
            config: {
              ...input.providers[0].config,
              apiKeyRequired: false,
              useDefaultApiKey: false,
            },
          },
        ]);
      }
      expectRedacted();
      expect(input).toEqual(original);
      const saved = localStorage.getItem('promptfoo')!;
      useStore.getState().reset();
      localStorage.setItem('promptfoo', saved);
      await useStore.persist.rehydrate();
      expectRedacted();
      expect(useStore.getState().config.env).toEqual({ VISIBLE: 'ordinary' });
      expect(useStore.getState().getTestSuite().providers).toEqual(persistedConfig().providers);
    },
  );

  it.each(['object', 'map', 'array-map'])(
    'redacts a local reference in an imported %s shape',
    (shape) => {
      const input = importedConfig();
      const { id, ...options } = input.providers[0];
      const providers: unknown =
        shape === 'object'
          ? input.providers[0]
          : shape === 'map'
            ? { [id]: options }
            : [{ [id]: options }];
      useStore
        .getState()
        .setConfig({ ...input, providers: providers as UnifiedConfig['providers'] });
      expect(useStore.getState().config.env).toEqual(input.env);
      expect(persistedConfig().env).toEqual({ VISIBLE: 'ordinary' });
      expect(localStorage.getItem('promptfoo')).not.toContain('SHORT');
      expect(localStorage.getItem('promptfoo')).not.toContain('OTHER');
    },
  );

  it('retains redaction across cloned updates without removing usable live values', () => {
    useStore.getState().setConfig(importedConfig());
    useStore.getState().updateConfig({ description: 'Unrelated edit' });
    expectRedacted();
    const cloned = JSON.parse(JSON.stringify(useStore.getState().config));
    useStore.getState().updateConfig(cloned);
    expectRedacted();
    useStore.getState().setConfig(JSON.parse(JSON.stringify(useStore.getState().config)));
    expectRedacted();
    expect(useStore.getState().config.env).toEqual(importedConfig().env);
  });

  it('does not carry reference paths into replacement, reset or rehydrated configurations', async () => {
    const replacement = { providers: [], env: { LOCAL_SOURCE: 'ordinary replacement' } };
    useStore.getState().setConfig(importedConfig());
    useStore.getState().setConfig(replacement);
    expect(persistedConfig().env).toEqual(replacement.env);
    useStore.getState().setConfig(importedConfig());
    useStore.getState().updateConfig(replacement);
    expect(persistedConfig().env).toEqual(replacement.env);
    useStore.getState().setConfig(importedConfig());
    useStore.getState().reset();
    useStore.getState().updateConfig(replacement);
    expect(persistedConfig().env).toEqual(replacement.env);
    useStore.getState().setConfig(importedConfig());
    localStorage.setItem(
      'promptfoo',
      JSON.stringify({ state: { config: replacement }, version: 0 }),
    );
    await useStore.persist.rehydrate();
    expect(persistedConfig().env).toEqual(replacement.env);
    expect(useStore.getState().config.env).toEqual(replacement.env);
  });

  it('keeps an unrelated provider environment with the same ordinary field name', () => {
    const input = importedConfig();
    const unrelatedEnv: Record<string, string> = { LOCAL_SOURCE: 'ordinary provider value' };
    const unrelated = { id: 'echo', env: unrelatedEnv, config: {} };
    useStore.getState().setConfig({ ...input, providers: [...input.providers, unrelated] });
    expect(persistedConfig().providers[1]).toEqual(unrelated);
    expect(persistedConfig().providers[0].env).toEqual({ VISIBLE: 'provider ordinary' });
    expect(useStore.getState().config.env).toEqual(input.env);
  });

  it('redacts variable sources of malformed selectors while preserving ordinary variables', () => {
    useStore.getState().setConfig({
      providers: [
        {
          id: 'openai:chat:model',
          config: {
            type: 'vllm',
            useDefaultApiKey: '{{ short_value | trim }}',
          },
        },
      ],
      defaultTest: { vars: { short_value: 'SHORT', visible: 'keep' } },
      tests: [{ vars: { short_value: 'SHORT', visible: 'also keep' } }],
    });
    expect(
      (useStore.getState().config.defaultTest as { vars?: unknown } | undefined)?.vars,
    ).toEqual({
      short_value: 'SHORT',
      visible: 'keep',
    });
    expect(persistedConfig().defaultTest.vars).toEqual({ visible: 'keep' });
    expect(persistedConfig().tests[0].vars).toEqual({ visible: 'also keep' });
    expect(localStorage.getItem('promptfoo')).not.toContain('SHORT');
  });

  it.each(locals)('retains the distinct %s redteam saved-template contract', async (type) => {
    const input = importedConfig(type);
    const redteamConfig = {
      ...useRedTeamConfig.getState().config,
      target: input.providers[0],
      env: input.env,
    };
    useRedTeamConfig.getState().setFullConfig(redteamConfig);
    const live = useRedTeamConfig.getState().config;
    expect((live as typeof redteamConfig).env).toEqual(input.env);
    expect(live.target.config.apiKey).toBe('{{ env.RUNTIME_SOURCE }}');
    expect(live.target.config.useDefaultApiKey).toBe('{{ env.LOCAL_SOURCE }}');
    const saved = localStorage.getItem('redTeamConfig')!;
    expect(JSON.parse(saved).state.config.env).toEqual(input.env);
    useRedTeamConfig.setState(useRedTeamConfig.getInitialState());
    localStorage.setItem('redTeamConfig', saved);
    await useRedTeamConfig.persist.rehydrate();
    expect((useRedTeamConfig.getState().config as typeof redteamConfig).env).toEqual(input.env);
    expect(useRedTeamConfig.getState().config.target.config.apiKey).toBe(
      '{{ env.RUNTIME_SOURCE }}',
    );
  });
});
