import { renderWithProviders } from '@app/utils/testutils';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as yaml from 'js-yaml';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRedTeamConfig } from '../../hooks/useRedTeamConfig';
import { useRedTeamTargetConfigValidation } from '../../hooks/useRedTeamTargetConfigValidation';
import { generateOrderedYaml } from '../../utils/yamlHelpers';
import ProviderConfigEditor from './ProviderConfigEditor';
import ProviderTypeSelector from './ProviderTypeSelector';

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

  it.each(localTargets)(
    'keeps an untyped compatible import editable and preserves it when selecting $label',
    async ({ label, type }) => {
      const user = userEvent.setup();
      const imported = {
        ...useRedTeamConfig.getState().config,
        target: { id: localId, label: 'Existing deployment', config: localConfig },
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
