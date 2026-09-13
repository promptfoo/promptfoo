import { EvalHistoryProvider } from '@app/contexts/EvalHistoryContext';
import { ToastProvider } from '@app/contexts/ToastContext';
import TargetConfiguration from '@app/pages/redteam/setup/components/Targets/TargetConfiguration';
import TargetTypeSelection from '@app/pages/redteam/setup/components/Targets/TargetTypeSelection';
import { useRedTeamConfig } from '@app/pages/redteam/setup/hooks/useRedTeamConfig';
import { useRedTeamTargetConfigValidation } from '@app/pages/redteam/setup/hooks/useRedTeamTargetConfigValidation';
import { generateOrderedYaml } from '@app/pages/redteam/setup/utils/yamlHelpers';
import { useStore } from '@app/stores/evalConfig';
import { getCallApiMock, mockCallApiRoutes, resetCallApiMock } from '@app/tests/apiMocks';
import { renderWithProviders } from '@app/utils/testutils';
import { act, cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as yaml from 'js-yaml';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProvidersListSection } from './ProvidersListSection';
import RunTestSuiteButton from './RunTestSuiteButton';
import { normalizeProviders } from './setupReadiness';
import type { Config } from '@app/pages/redteam/setup/types';

vi.mock('@app/utils/api', () => ({ callApi: vi.fn() }));
vi.mock('@app/hooks/useTelemetry', () => ({ useTelemetry: () => ({ recordEvent: vi.fn() }) }));
vi.mock('@app/pages/redteam/setup/components/Targets/CommonConfigurationOptions', () => ({
  default: () => null,
}));
vi.mock('react-simple-code-editor', () => ({
  default: ({
    value,
    onValueChange,
  }: {
    value: string;
    onValueChange: (value: string) => void;
  }) => (
    <textarea
      aria-label="Provider configuration JSON"
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
    />
  ),
}));

const locals = [
  { type: 'llamafile', label: 'Llamafile' },
  { type: 'vllm', label: 'vLLM' },
  { type: 'text-generation-webui', label: 'Text Generation WebUI' },
] as const;
const forms = ['bare', 'suffixed'] as const;
const model = 'tenant/served-model.py:Q4_K_M';
function localProvider<T extends string>(type: T, form: (typeof forms)[number] = 'bare') {
  return {
    id: form === 'bare' ? 'openai:chat' : `openai:chat:${model}`,
    label: 'Saved local',
    config: {
      type,
      model,
      apiKeyRequired: false,
      useDefaultApiKey: true,
      apiBaseUrl: 'https://local.example.test/tenant/v1',
      apiHost: 'private.example.test/tenant',
      apiKeyEnvar: 'LOCAL_MODEL_KEY',
      stop: ['<end>'],
      passthrough: { chat_template_kwargs: { enable_thinking: false } },
    },
  };
}
function resetStores() {
  act(() => {
    useStore.getState().reset();
    useRedTeamConfig.setState(useRedTeamConfig.getInitialState());
    useRedTeamTargetConfigValidation.setState(useRedTeamTargetConfigValidation.getInitialState());
  });
  localStorage.clear();
  resetCallApiMock();
}
beforeEach(resetStores);
afterEach(() => {
  cleanup();
  resetStores();
  vi.clearAllMocks();
});
async function replaceText(
  user: ReturnType<typeof userEvent.setup>,
  element: HTMLElement,
  value: string,
) {
  await user.click(element);
  await user.keyboard('{Control>}a{/Control}');
  await user.paste(value);
}
function getNext() {
  return within(screen.getByTestId('page-navigation')).getByRole('button', { name: /Next/ });
}
function EvalSetup() {
  const { config, updateConfig } = useStore();
  return (
    <MemoryRouter>
      <ToastProvider>
        <EvalHistoryProvider>
          <ProvidersListSection
            providers={normalizeProviders(config.providers)}
            onChange={(providers) => updateConfig({ providers })}
          />
          <RunTestSuiteButton />
        </EvalHistoryProvider>
      </ToastProvider>
    </MemoryRouter>
  );
}
function prepareEval(provider: ReturnType<typeof localProvider>) {
  act(() =>
    useStore
      .getState()
      .setConfig({ providers: [provider], prompts: ['Hello'], tests: [{ vars: {} }] }),
  );
  mockCallApiRoutes([
    { method: 'POST', path: '/eval/job', response: { id: 'local-boundary-job' } },
  ]);
  renderWithProviders(<EvalSetup />);
}
function prepareTarget(provider: Config['target'], type: string) {
  act(() =>
    useRedTeamConfig.setState({
      config: { ...useRedTeamConfig.getState().config, target: provider, prompts: ['{{prompt}}'] },
      providerType: type,
    }),
  );
}
async function runEval(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Run Eval' }));
  const request = getCallApiMock().mock.calls.find(([path]) => path === '/eval/job')?.[1];
  expect(request).toBeDefined();
  return JSON.parse(request!.body as string);
}

describe('local provider selection and execution boundaries', () => {
  it.each(locals.flatMap((local) => forms.map((form) => ({ ...local, form }))))(
    'preserves $type $form settings through redteam reselection and Next',
    async ({ type, label, form }) => {
      const user = userEvent.setup();
      const provider = localProvider(type, form);
      prepareTarget(provider, type);
      const onNext = vi.fn();
      renderWithProviders(
        <MemoryRouter>
          <TargetTypeSelection onNext={onNext} />
        </MemoryRouter>,
      );
      await user.click(screen.getByText(label, { selector: 'p' }).closest('[role="button"]')!);
      await user.click(getNext());
      expect(onNext).toHaveBeenCalledTimes(1);
      expect(useRedTeamConfig.getState().providerType).toBe(type);
      expect(useRedTeamConfig.getState().config.target).toEqual(provider);
      expect(JSON.parse(localStorage.getItem('redTeamConfig')!).state.config.target).toEqual(
        provider,
      );
    },
  );

  it.each(locals.flatMap((local) => forms.map((form) => ({ ...local, form }))))(
    'preserves $type $form settings through eval Back reselection Save and Run',
    async ({ type, label, form }) => {
      const user = userEvent.setup();
      const provider = localProvider(type, form);
      prepareEval(provider);
      await user.click(screen.getByRole('button', { name: 'Edit Saved local' }));
      await user.click(screen.getByRole('button', { name: 'Back' }));
      await user.click(screen.getByText(label, { selector: 'p' }).closest('[role="button"]')!);
      await user.click(screen.getByRole('button', { name: 'Save Changes' }));
      const submitted = await runEval(user);
      expect(submitted.providers).toEqual([provider]);
      expect(useStore.getState().config.providers).toEqual([provider]);
      expect(JSON.parse(localStorage.getItem('promptfoo')!).state.config.providers).toEqual([
        provider,
      ]);
    },
  );

  it.each(locals)('validates $type local route and model before redteam Next', async ({ type }) => {
    const user = userEvent.setup();
    const provider = localProvider(type);
    prepareTarget({ ...provider, id: model }, type);
    const onNext = vi.fn();
    renderWithProviders(
      <MemoryRouter>
        <TargetConfiguration onNext={onNext} onBack={vi.fn()} />
      </MemoryRouter>,
    );
    await user.click(getNext());
    expect(onNext).not.toHaveBeenCalled();
    expect(getNext()).toBeDisabled();
    expect(screen.getAllByText(/Local provider ID must be/).length).toBeGreaterThan(0);
    const idInput = screen.getByRole('textbox', { name: /Target ID/ });
    await replaceText(user, idInput, `openai:completion:${model}`);
    expect(getNext()).toBeDisabled();
    await replaceText(user, idInput, 'openai:chat: ');
    expect(getNext()).toBeDisabled();
    await replaceText(user, idInput, 'openai:chat');
    const editor = screen.getByRole('textbox', { name: 'Provider configuration JSON' });
    await replaceText(user, editor, JSON.stringify({ ...provider.config, model: '  ' }));
    expect(getNext()).toBeDisabled();
    expect(screen.getAllByText(/A served model is required/).length).toBeGreaterThan(0);
    await replaceText(user, editor, JSON.stringify(provider.config));
    expect(getNext()).toBeEnabled();
    await user.click(getNext());
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(useRedTeamConfig.getState().config.target).toEqual(provider);
  });

  it.each(locals)(
    'validates $type local route and model before eval Save and Run',
    async ({ type }) => {
      const user = userEvent.setup();
      const provider = localProvider(type);
      prepareEval(provider);
      await user.click(screen.getByRole('button', { name: 'Edit Saved local' }));
      const idInput = screen.getByRole('textbox', { name: /Target ID/ });
      await replaceText(user, idInput, model);
      await user.click(screen.getByRole('button', { name: 'Save Changes' }));
      expect(screen.getByRole('button', { name: 'Save Changes' })).toBeDisabled();
      expect(useStore.getState().config.providers).toEqual([provider]);
      expect(getCallApiMock()).not.toHaveBeenCalled();
      await replaceText(user, idInput, `openai:completion:${model}`);
      expect(screen.getByRole('button', { name: 'Save Changes' })).toBeDisabled();
      await replaceText(user, idInput, 'openai:chat: ');
      expect(screen.getByRole('button', { name: 'Save Changes' })).toBeDisabled();
      await replaceText(user, idInput, 'openai:chat');
      const editor = screen.getByRole('textbox', { name: 'Provider configuration JSON' });
      await replaceText(user, editor, JSON.stringify({ ...provider.config, model: '' }));
      expect(screen.getByRole('button', { name: 'Save Changes' })).toBeDisabled();
      await replaceText(user, editor, JSON.stringify(provider.config));
      expect(screen.getByRole('button', { name: 'Save Changes' })).toBeEnabled();
      await user.click(screen.getByRole('button', { name: 'Save Changes' }));
      expect((await runEval(user)).providers).toEqual([provider]);
      expect(useStore.getState().config.providers).toEqual([provider]);
    },
  );

  it('retains an arbitrary custom route through redteam Next', async () => {
    const user = userEvent.setup();
    const provider = { ...localProvider('custom'), id: 'my-custom:opaque/model' };
    prepareTarget(provider as unknown as Config['target'], 'custom');
    const onNext = vi.fn();
    renderWithProviders(
      <MemoryRouter>
        <TargetConfiguration onNext={onNext} onBack={vi.fn()} />
      </MemoryRouter>,
    );
    await user.click(getNext());
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(useRedTeamConfig.getState().config.target).toEqual(provider);
  });
  it.each(locals)(
    'keeps $type credential references live through editing export Run and reload',
    async ({ type }) => {
      const user = userEvent.setup();
      const provider = {
        ...localProvider(type),
        config: {
          ...localProvider(type).config,
          useDefaultApiKey: '{{ env.LOCAL_SOURCE }}',
          apiKey: '{{ env.KEY_SOURCE }}',
        },
      };
      const env = { LOCAL_SOURCE: 'SHORT', KEY_SOURCE: 'OTHER', VISIBLE: 'ordinary' };
      act(() =>
        useStore
          .getState()
          .setConfig({ providers: [provider], env, prompts: ['Hello'], tests: [{ vars: {} }] }),
      );
      mockCallApiRoutes([{ method: 'POST', path: '/eval/job', response: { id: 'reference-job' } }]);
      renderWithProviders(<EvalSetup />);
      await user.click(screen.getByRole('button', { name: 'Edit Saved local' }));
      const edited = { ...provider, config: { ...provider.config, stop: ['<edited-end>'] } };
      await replaceText(
        user,
        screen.getByRole('textbox', { name: 'Provider configuration JSON' }),
        JSON.stringify(edited.config),
      );
      await user.click(screen.getByRole('button', { name: 'Save Changes' }));
      const submitted = await runEval(user);
      const runtimeProvider = { ...edited, config: { ...edited.config, useDefaultApiKey: false } };
      expect(submitted.providers).toEqual([runtimeProvider]);
      expect(submitted.env).toEqual(env);
      expect(useStore.getState().config.providers).toEqual([edited]);
      expect(useStore.getState().getTestSuite().providers).toEqual([runtimeProvider]);
      expect(useStore.getState().getTestSuite().env).toEqual(env);
      act(() =>
        useStore.getState().setConfig(JSON.parse(JSON.stringify(useStore.getState().config))),
      );
      expect(useStore.getState().config.env).toEqual(env);
      expect(localStorage.getItem('promptfoo')).not.toContain('SHORT');
      expect(localStorage.getItem('promptfoo')).not.toContain('OTHER');
      const redteamConfig = {
        ...useRedTeamConfig.getState().config,
        target: edited,
        env,
        prompts: ['Hello'],
      };
      act(() => useRedTeamConfig.getState().setFullConfig(redteamConfig));
      const exported = yaml.load(generateOrderedYaml(useRedTeamConfig.getState().config)) as {
        targets: unknown[];
      };
      expect(exported.targets).toEqual([runtimeProvider]);
      expect(useRedTeamConfig.getState().config.target).toEqual(edited);
      expect((useRedTeamConfig.getState().config as typeof redteamConfig).env).toEqual(env);
      const saved = localStorage.getItem('promptfoo')!;
      cleanup();
      act(() => useStore.getState().reset());
      localStorage.setItem('promptfoo', saved);
      await act(() => useStore.persist.rehydrate());
      expect(useStore.getState().config.env).toEqual({ VISIBLE: 'ordinary' });
      expect(useStore.getState().getTestSuite().providers).toEqual([runtimeProvider]);
    },
  );
});
