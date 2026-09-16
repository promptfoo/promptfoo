import { EvalHistoryProvider } from '@app/contexts/EvalHistoryContext';
import { ToastProvider } from '@app/contexts/ToastContext';
import {
  getProviderType,
  withLocalProviderType,
} from '@app/pages/redteam/setup/components/Targets/helpers';
import { useRedTeamConfig } from '@app/pages/redteam/setup/hooks/useRedTeamConfig';
import { generateOrderedYaml } from '@app/pages/redteam/setup/utils/yamlHelpers';
import { useStore } from '@app/stores/evalConfig';
import { getCallApiMock, mockCallApiRoutes, resetCallApiMock } from '@app/tests/apiMocks';
import { restoreTestTimers, useTestTimers } from '@app/tests/timers';
import { act, cleanup, render, screen } from '@testing-library/react';
import * as yaml from 'js-yaml';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RunTestSuiteButton from './RunTestSuiteButton';
import type { Config } from '@app/pages/redteam/setup/types';
import type { ProviderOptions } from '@promptfoo/types';

vi.mock('@app/utils/api', () => ({ callApi: vi.fn() }));

const localTypes = [
  { type: 'llamafile', apiBaseUrl: 'http://localhost:8080/v1' },
  { type: 'vllm', apiBaseUrl: 'http://localhost:8000/v1' },
  { type: 'text-generation-webui', apiBaseUrl: 'http://localhost:5000/v1' },
];
const policies = [
  { policy: 'default', config: {} },
  {
    policy: 'inline',
    config: { apiBaseUrl: 'https://local.example.test/tenant/v1', apiKey: 'fixture-inline-key' },
  },
  {
    policy: 'named',
    config: { apiHost: 'local.example.test/tenant', apiKeyEnvar: 'BARE_LOCAL_KEY' },
  },
  { policy: 'opt-in', config: { apiKeyRequired: true, useDefaultApiKey: true } },
];

function resetStores() {
  useStore.getState().reset();
  useRedTeamConfig.setState(useRedTeamConfig.getInitialState());
}

describe('bare local chat import and Run', () => {
  beforeEach(() => {
    resetStores();
    resetCallApiMock();
    useTestTimers();
  });
  afterEach(() => {
    cleanup();
    resetStores();
    resetCallApiMock();
    restoreTestTimers({ runPending: true });
  });

  it.each(localTypes.flatMap((local) => policies.map((policy) => ({ ...local, ...policy }))))(
    'preserves $type with $policy credentials from import through Run',
    async ({ type, apiBaseUrl, policy, config }) => {
      const original = {
        id: 'openai:chat',
        label: `bare-${type}-${policy}`,
        config: {
          type,
          model: 'tenant/bare-local-model:Q4_K_M',
          temperature: 0.2,
          stop: ['<end>'],
          passthrough: { chat_template_kwargs: { enable_thinking: false } },
          ...config,
        },
      };
      const imported = yaml.load(yaml.dump(original)) as Config['target'];
      act(() => {
        useRedTeamConfig.getState().setFullConfig({
          ...useRedTeamConfig.getState().config,
          target: imported,
          prompts: ['Hello'],
        });
        // Exercise eval imports independently of the redteam normalization.
        useStore
          .getState()
          .setConfig({ providers: [imported], prompts: ['Hello'], tests: [{ vars: {} }] });
      });
      const evalImported = useStore.getState().config.providers;
      const state = useRedTeamConfig.getState();
      const generated = yaml.load(generateOrderedYaml(state.config)) as {
        targets: ProviderOptions[];
      };
      act(() =>
        useStore.getState().setConfig({
          providers: generated.targets,
          prompts: ['Hello'],
          tests: [{ vars: {} }],
        }),
      );
      mockCallApiRoutes([
        { method: 'POST', path: '/eval/job', response: { id: 'bare-local-job' } },
      ]);
      render(
        <MemoryRouter>
          <ToastProvider>
            <EvalHistoryProvider>
              <RunTestSuiteButton />
            </EvalHistoryProvider>
          </ToastProvider>
        </MemoryRouter>,
      );
      await act(async () => {
        screen.getByRole('button', { name: 'Run Eval' }).click();
        await Promise.resolve();
      });

      expect(getCallApiMock()).toHaveBeenCalledTimes(1);
      const [path, request] = getCallApiMock().mock.calls[0];
      const submitted = JSON.parse(request!.body as string);
      const expected = {
        ...original,
        config: {
          apiKeyRequired: false,
          useDefaultApiKey: false,
          apiBaseUrl,
          ...original.config,
        },
      };
      expect(path).toBe('/eval/job');
      expect(request!.method).toBe('POST');
      expect(state.providerType).toBe(type);
      expect(state.config.target).toEqual(expected);
      expect(evalImported).toEqual([expected]);
      expect(generated.targets).toEqual([expected]);
      expect(submitted.providers).toEqual([expected]);
      expect(submitted.prompts).toEqual(['Hello']);
      expect(imported).toEqual(original);
    },
  );

  it.each([
    { id: 'openai:chatter', expectedType: 'openai' },
    { id: 'openai:chatkit:workflow', expectedType: 'openai' },
    { id: 'openai:responses', expectedType: 'openai' },
    { id: 'anthropic:messages:model', expectedType: 'anthropic' },
  ])('leaves unrelated route $id unchanged', ({ id, expectedType }) => {
    const config = { type: 'vllm', model: 'served-model', temperature: 0.2 };
    expect(withLocalProviderType(id, config, 'vllm')).toBe(config);
    expect(getProviderType(id, config)).toBe(expectedType);
  });

  it('keeps an untyped bare compatible endpoint editable', () => {
    const config = { model: 'served-model', apiBaseUrl: 'https://local.example.test/v1' };
    expect(getProviderType('openai:chat', config)).toBe('custom');
    expect(withLocalProviderType('openai:chat', config)).toBe(config);
  });

  it('keeps native bare OpenAI configuration unchanged', () => {
    const config = { model: 'gpt-4o-mini', temperature: 0.2 };
    expect(getProviderType('openai:chat', config)).toBe('openai');
    expect(withLocalProviderType('openai:chat', config)).toBe(config);
  });
});
