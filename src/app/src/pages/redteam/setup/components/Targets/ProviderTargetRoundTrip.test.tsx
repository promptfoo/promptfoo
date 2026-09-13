import { renderWithProviders } from '@app/utils/testutils';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as yaml from 'js-yaml';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRedTeamConfig } from '../../hooks/useRedTeamConfig';
import { useRedTeamTargetConfigValidation } from '../../hooks/useRedTeamTargetConfigValidation';
import { generateOrderedYaml } from '../../utils/yamlHelpers';
import ProviderConfigEditor from './ProviderConfigEditor';
import ProviderTypeSelector from './ProviderTypeSelector';
import TargetConfiguration from './TargetConfiguration';
import TargetTypeSelection from './TargetTypeSelection';

import type { ProviderOptions } from '../../types';

vi.mock('@app/hooks/useTelemetry', () => ({
  useTelemetry: () => ({ recordEvent: vi.fn() }),
}));

vi.mock('./CommonConfigurationOptions', () => ({ default: () => null }));

// Keep the target form and its JSON validation real; replace only the editor widget.
vi.mock('react-simple-code-editor', () => ({
  default: ({
    value,
    onValueChange,
  }: {
    value: string;
    onValueChange: (value: string) => void;
  }) => (
    <textarea
      aria-label="Target configuration JSON"
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
    />
  ),
}));

function TargetEditor() {
  const { config, providerType, setProviderType, updateConfig } = useRedTeamConfig();
  return (
    <>
      <ProviderTypeSelector
        provider={config.target}
        providerType={providerType}
        setProvider={(target, type) => {
          setProviderType(type);
          updateConfig('target', target);
        }}
      />
      <ProviderConfigEditor
        provider={config.target}
        providerType={providerType}
        setProvider={(target) => updateConfig('target', target)}
      />
    </>
  );
}

async function replaceText(
  user: ReturnType<typeof userEvent.setup>,
  element: HTMLElement,
  value: string,
) {
  await user.click(element);
  await user.keyboard('{Control>}a{/Control}');
  await user.paste(value);
}

describe('generated target configuration round trips', () => {
  afterEach(() => {
    act(() => {
      useRedTeamConfig.setState(useRedTeamConfig.getInitialState());
      useRedTeamTargetConfigValidation.setState(useRedTeamTargetConfigValidation.getInitialState());
    });
  });
  beforeEach(() => {
    useRedTeamConfig.setState(useRedTeamConfig.getInitialState());
    useRedTeamTargetConfigValidation.setState(useRedTeamTargetConfigValidation.getInitialState());
    useRedTeamConfig.setState({
      config: {
        ...useRedTeamConfig.getState().config,
        target: { id: '', label: 'Saved target', config: {} },
      },
      providerType: undefined,
    });
  });

  const localTargets = [
    { label: 'Llamafile', type: 'llamafile' },
    { label: 'vLLM', type: 'vllm' },
    { label: 'Text Generation WebUI', type: 'text-generation-webui' },
  ];
  const localConfig = {
    apiBaseUrl: 'https://my-inference.example.test/custom/v1',
    apiKey: 'private-server-test-key',
    stop: ['<end>'],
    passthrough: { chat_template_kwargs: { enable_thinking: false } },
  };
  const localId = 'openai:chat:tenant/served-model:Q4_K_M';

  it.each([
    { aliasCase: 'missing', agentAliasId: undefined, valid: false },
    { aliasCase: 'null', agentAliasId: null, valid: false },
    { aliasCase: 'empty', agentAliasId: '', valid: false },
    { aliasCase: 'whitespace', agentAliasId: ' \t ', valid: false },
    { aliasCase: 'number', agentAliasId: 123, valid: false },
    { aliasCase: 'array', agentAliasId: ['ALIAS456'], valid: false },
    { aliasCase: 'valid', agentAliasId: 'ALIAS456', valid: true },
  ])('validates a $aliasCase Bedrock alias before Next', async ({ agentAliasId, valid }) => {
    const user = userEvent.setup();
    const target = {
      id: 'bedrock-agent:AGENT123',
      label: 'Bedrock agent',
      config: { agentAliasId: 'ORIGINAL', region: 'eu-west-1', enableTrace: true },
    };
    act(() =>
      useRedTeamConfig.setState({
        config: { ...useRedTeamConfig.getState().config, target, prompts: ['{{prompt}}'] },
        providerType: 'bedrock-agent',
      }),
    );
    const onNext = vi.fn(() => useRedTeamConfig.getState().config.target);
    renderWithProviders(
      <MemoryRouter>
        <TargetConfiguration onNext={onNext} onBack={vi.fn()} />
      </MemoryRouter>,
    );
    const editor = screen.getByRole('textbox', { name: 'Target configuration JSON' });
    await replaceText(user, editor, JSON.stringify({ ...target.config, agentAliasId }));
    const next = within(screen.getByTestId('page-navigation')).getByRole('button', {
      name: /Next/,
    });
    await user.click(next);

    const expected = { ...target, config: { ...target.config, agentAliasId: 'ALIAS456' } };
    if (!valid) {
      expect(onNext).not.toHaveBeenCalled();
      expect(screen.getAllByText('Agent Alias ID is required').length).toBeGreaterThan(0);
      expect(next).toBeDisabled();
      await replaceText(user, editor, JSON.stringify(expected.config));
      expect(next).toBeEnabled();
      await user.click(next);
    }

    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveLastReturnedWith(expected);
    expect(useRedTeamConfig.getState().config.target).toEqual(expected);
    expect(JSON.parse(localStorage.getItem('redTeamConfig')!).state.config.target).toEqual(
      expected,
    );
  });

  it.each(['llamafile', 'vllm', 'text-generation-webui', 'custom'] as const)(
    'restores the %s editor when a saved target has no provider type',
    (type) => {
      const target = {
        id: localId,
        label: 'Saved deployment',
        config: { ...localConfig, ...(type === 'custom' ? {} : { type }) },
      };
      useRedTeamConfig.setState({
        config: { ...useRedTeamConfig.getState().config, target },
        providerType: undefined,
      });
      const view = renderWithProviders(
        <MemoryRouter>
          <TargetTypeSelection onNext={vi.fn()} />
        </MemoryRouter>,
      );
      expect(useRedTeamConfig.getState().providerType).toBe(type);
      view.unmount();
      renderWithProviders(<TargetEditor />);
      expect(screen.getByRole('textbox', { name: /Target ID/ })).toHaveValue(localId);
      expect(screen.getByRole('textbox', { name: 'Target configuration JSON' })).toHaveValue(
        JSON.stringify(target.config, null, 2),
      );
      expect(useRedTeamConfig.getState().config.target).toEqual(target);
    },
  );

  it.each(
    localTargets.flatMap((target) =>
      [false, true].map((selectedKey) => ({ ...target, selectedKey })),
    ),
  )(
    'retains $label credentials when JSON changes while the ID is blank (selected key: $selectedKey)',
    async ({ label, type, selectedKey }) => {
      const user = userEvent.setup();
      renderWithProviders(<TargetEditor />);
      await user.click(screen.getByText(label, { selector: 'p' }).closest('[role="button"]')!);
      await user.clear(screen.getByRole('textbox', { name: /Target ID/ }));
      const replacement = {
        apiBaseUrl: 'https://private-inference.example.test/tenant/v1',
        ...(selectedKey ? { apiKeyEnvar: 'LOCAL_MODEL_KEY' } : {}),
      };
      await replaceText(
        user,
        screen.getByRole('textbox', { name: 'Target configuration JSON' }),
        JSON.stringify(replacement),
      );
      const id = 'openai:chat:tenant/model.py:Q4_K_M';
      await replaceText(user, screen.getByRole('textbox', { name: /Target ID/ }), id);

      const saved = JSON.parse(JSON.stringify(useRedTeamConfig.getState().config));
      expect(saved.target).toMatchObject({
        id,
        config: { ...replacement, type, apiKeyRequired: false, useDefaultApiKey: false },
      });
      act(() => useRedTeamConfig.getState().setFullConfig(saved));
      expect(useRedTeamConfig.getState().providerType).toBe(type);
      expect(useRedTeamConfig.getState().config.target).toEqual(saved.target);
    },
  );

  it('keeps native provider config literal when changing an ID in the local editor', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TargetEditor />);
    await user.click(screen.getByText('vLLM', { selector: 'p' }).closest('[role="button"]')!);
    await user.clear(screen.getByRole('textbox', { name: /Target ID/ }));
    const replacement = { num_predict: 100 };
    await replaceText(
      user,
      screen.getByRole('textbox', { name: 'Target configuration JSON' }),
      JSON.stringify(replacement),
    );
    await replaceText(
      user,
      screen.getByRole('textbox', { name: /Target ID/ }),
      'ollama:tenant/model.py',
    );
    expect(useRedTeamConfig.getState().config.target).toMatchObject({
      id: 'ollama:tenant/model.py',
      config: replacement,
    });
    expect(useRedTeamConfig.getState().config.target.config).toEqual(replacement);
  });

  it.each(
    localTargets.flatMap((target) =>
      ['saved JSON', 'YAML'].map((format) => ({ ...target, format })),
    ),
  )(
    'keeps $label settings and JSON editing through $format export/import and reselection',
    async ({ label, type, format }) => {
      const user = userEvent.setup();
      const view = renderWithProviders(<TargetEditor />);
      await user.click(screen.getByText(label, { selector: 'p' }).closest('[role="button"]')!);
      await replaceText(user, screen.getByRole('textbox', { name: /Target ID/ }), localId);
      // Pasting a complete config must retain the selected local target kind.
      await replaceText(
        user,
        screen.getByRole('textbox', { name: 'Target configuration JSON' }),
        JSON.stringify(localConfig),
      );
      const savedConfig = JSON.parse(JSON.stringify(useRedTeamConfig.getState().config));
      expect(savedConfig.target.config).toMatchObject({
        apiKeyRequired: false,
        useDefaultApiKey: false,
        type,
      });
      if (format === 'YAML') {
        const exported = yaml.load(generateOrderedYaml(savedConfig)) as {
          targets: ProviderOptions[];
        };
        savedConfig.target = exported.targets[0];
      }
      view.unmount();
      act(() => useRedTeamConfig.getState().setFullConfig(savedConfig));
      renderWithProviders(<TargetEditor />);

      expect(useRedTeamConfig.getState().providerType).toBe(type);
      const card = screen.getByText(label, { selector: 'p' }).closest('[role="button"]')!;
      expect(card).toHaveClass('border-primary');
      expect(screen.getByRole('textbox', { name: /Target ID/ })).toHaveValue(localId);
      expect(
        JSON.parse(
          (
            screen.getByRole('textbox', {
              name: 'Target configuration JSON',
            }) as HTMLTextAreaElement
          ).value,
        ),
      ).toMatchObject(localConfig);
      await user.click(card);
      expect(useRedTeamConfig.getState().config.target).toEqual(savedConfig.target);

      await replaceText(
        user,
        screen.getByRole('textbox', { name: 'Target configuration JSON' }),
        '{"invalid":}',
      );
      expect(screen.getByText('Invalid JSON configuration')).toBeVisible();
      expect(useRedTeamConfig.getState().config.target).toEqual(savedConfig.target);
      const editedConfig = {
        ...localConfig,
        stop: ['<new-end>'],
        passthrough: { chat_template_kwargs: { enable_thinking: true } },
      };
      await replaceText(
        user,
        screen.getByRole('textbox', { name: 'Target configuration JSON' }),
        JSON.stringify(editedConfig),
      );
      await user.click(screen.getByRole('button', { name: 'Format' }));
      expect(useRedTeamConfig.getState().config.target.config).toMatchObject({
        ...editedConfig,
        apiKeyRequired: false,
        useDefaultApiKey: false,
        type,
      });
      expect(useRedTeamTargetConfigValidation.getState().targetConfigError).toBeNull();
      act(() =>
        useRedTeamConfig
          .getState()
          .setFullConfig(JSON.parse(JSON.stringify(useRedTeamConfig.getState().config))),
      );
      expect(useRedTeamConfig.getState().providerType).toBe(type);
    },
  );

  it.each([
    { label: 'Llamafile', apiBaseUrl: 'http://localhost:8080/v1' },
    { label: 'vLLM', apiBaseUrl: 'http://localhost:8000/v1' },
    { label: 'Text Generation WebUI', apiBaseUrl: 'http://localhost:5000/v1' },
  ])(
    'retains a local endpoint when replacement $label JSON omits it',
    async ({ label, apiBaseUrl }) => {
      const user = userEvent.setup();
      renderWithProviders(<TargetEditor />);
      await user.click(screen.getByText(label, { selector: 'p' }).closest('[role="button"]')!);
      await replaceText(user, screen.getByRole('textbox', { name: /Target ID/ }), localId);
      await replaceText(
        user,
        screen.getByRole('textbox', { name: 'Target configuration JSON' }),
        JSON.stringify({ apiKeyEnvar: 'LOCAL_MODEL_KEY', max_tokens: 100 }),
      );
      await user.click(screen.getByRole('button', { name: 'Format' }));
      const target = useRedTeamConfig.getState().config.target;
      expect(target).toMatchObject({
        id: localId,
        config: { apiBaseUrl, apiKeyEnvar: 'LOCAL_MODEL_KEY', max_tokens: 100 },
      });
      expect(useRedTeamTargetConfigValidation.getState().targetConfigError).toBeNull();
    },
  );

  it('preserves an explicit local credential fallback opt-in after replacing and formatting JSON', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TargetEditor />);
    await user.click(screen.getByText('vLLM', { selector: 'p' }).closest('[role="button"]')!);
    const explicitAuthConfig = {
      ...localConfig,
      apiKeyRequired: true,
      useDefaultApiKey: true,
    };
    await replaceText(
      user,
      screen.getByRole('textbox', { name: 'Target configuration JSON' }),
      JSON.stringify(explicitAuthConfig),
    );
    await user.click(screen.getByRole('button', { name: 'Format' }));
    expect(useRedTeamConfig.getState().config.target.config).toMatchObject(explicitAuthConfig);
  });

  it.each(
    localTargets.flatMap((target) =>
      [
        { endpoint: 'apiBaseUrl', config: localConfig },
        {
          endpoint: 'apiHost',
          config: {
            apiHost: 'private.example.test/tenant',
            apiKeyEnvar: 'LOCAL_MODEL_KEY',
            stop: ['<end>'],
            max_tokens: 321,
          },
        },
      ].map((endpoint) => ({ ...target, ...endpoint })),
    ),
  )(
    'keeps an untyped $endpoint import editable and preserves it when selecting $label',
    async ({ label, type, config }) => {
      const user = userEvent.setup();
      const imported = {
        ...useRedTeamConfig.getState().config,
        target: { id: localId, label: 'Existing deployment', config },
      };
      act(() => useRedTeamConfig.getState().setFullConfig(imported));
      renderWithProviders(<TargetEditor />);
      expect(screen.getByRole('textbox', { name: 'Target configuration JSON' })).toBeVisible();
      await user.click(screen.getByText(label, { selector: 'p' }).closest('[role="button"]')!);
      expect(useRedTeamConfig.getState().config.target).toMatchObject(imported.target);
      act(() =>
        useRedTeamConfig
          .getState()
          .setFullConfig(JSON.parse(JSON.stringify(useRedTeamConfig.getState().config))),
      );
      expect(useRedTeamConfig.getState().providerType).toBe(type);
      expect(screen.getByRole('textbox', { name: /Target ID/ })).toHaveValue(localId);
    },
  );

  it.each([
    {
      label: 'Together AI',
      type: 'together',
      id: 'togetherai:my-organization/private-model:revision',
      config: {
        apiKey: 'custom-test-key',
        apiBaseUrl: 'https://together.example.test/v1',
        temperature: 0.4,
      },
    },
    {
      label: 'llama.cpp',
      type: 'llama.cpp',
      id: 'llama:private/model:Q4_K_M',
      config: { n_predict: 91, temperature: 0.4 },
    },
    {
      label: 'AWS Bedrock Agents',
      type: 'bedrock-agent',
      id: 'bedrock:agents:AGENT123',
      config: { agentAliasId: 'ALIAS456', region: 'eu-west-1' },
    },
  ])(
    'keeps $label selected and editable after exporting and loading',
    async ({ label, type, id, config }) => {
      const user = userEvent.setup();
      const view = renderWithProviders(<TargetEditor />);
      await user.click(screen.getByText(label, { selector: 'p' }).closest('[role="button"]')!);

      await replaceText(user, screen.getByRole('textbox', { name: /Target ID/ }), id);
      await replaceText(
        user,
        screen.getByRole('textbox', { name: 'Target configuration JSON' }),
        JSON.stringify(config),
      );
      const savedConfig = JSON.parse(JSON.stringify(useRedTeamConfig.getState().config));

      expect(savedConfig.target).toEqual({ id, label: 'Saved target', config });
      view.unmount();

      act(() => {
        useRedTeamConfig.getState().setFullConfig(savedConfig);
      });
      renderWithProviders(<TargetEditor />);

      expect(useRedTeamConfig.getState().providerType).toBe(type);
      expect(screen.getByText(label, { selector: 'p' }).closest('[role="button"]')).toHaveClass(
        'border-primary',
      );
      expect(screen.getByRole('textbox', { name: /Target ID/ })).toHaveValue(id);
      expect(
        JSON.parse(
          (
            screen.getByRole('textbox', {
              name: 'Target configuration JSON',
            }) as HTMLTextAreaElement
          ).value,
        ),
      ).toEqual(config);
      expect(useRedTeamConfig.getState().config.target).toEqual(savedConfig.target);

      await replaceText(
        user,
        screen.getByRole('textbox', { name: 'Target configuration JSON' }),
        '{"invalid":}',
      );
      expect(screen.getByText('Invalid JSON configuration')).toBeVisible();
      expect(useRedTeamConfig.getState().config.target).toEqual(savedConfig.target);

      const editedConfig = { ...config, temperature: 0.6 };
      await replaceText(
        user,
        screen.getByRole('textbox', { name: 'Target configuration JSON' }),
        JSON.stringify(editedConfig),
      );
      await replaceText(user, screen.getByRole('textbox', { name: /Target ID/ }), `${id}-edited`);
      expect(useRedTeamConfig.getState().config.target).toEqual({
        id: `${id}-edited`,
        label: 'Saved target',
        config: editedConfig,
      });
      expect(useRedTeamTargetConfigValidation.getState().targetConfigError).toBeNull();
    },
  );
});
