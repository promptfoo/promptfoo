import { useRedTeamConfig } from '@app/pages/redteam/setup/hooks/useRedTeamConfig';
import { useRedTeamTargetConfigValidation } from '@app/pages/redteam/setup/hooks/useRedTeamTargetConfigValidation';
import { renderWithProviders } from '@app/utils/testutils';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AddProviderDialog from './AddProviderDialog';
import { normalizeProviders } from './setupReadiness';

vi.mock('@app/hooks/useTelemetry', () => ({
  useTelemetry: () => ({ recordEvent: vi.fn() }),
}));
vi.mock('@app/pages/redteam/setup/components/Targets/CommonConfigurationOptions', () => ({
  default: () => null,
}));
// Keep the dialog, selector, form and validation real; replace only the editor widget.
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

async function replaceText(
  user: ReturnType<typeof userEvent.setup>,
  element: HTMLElement,
  value: string,
) {
  await user.click(element);
  await user.keyboard('{Control>}a{/Control}');
  await user.paste(value);
}

function resetStores() {
  act(() => {
    useRedTeamConfig.setState(useRedTeamConfig.getInitialState());
    useRedTeamTargetConfigValidation.setState(useRedTeamTargetConfigValidation.getInitialState());
  });
}

const cases = [
  ...[
    { label: 'Llamafile', type: 'llamafile' },
    { label: 'vLLM', type: 'vllm' },
    { label: 'Text Generation WebUI', type: 'text-generation-webui' },
  ].flatMap((target) =>
    [true, false].map((keepType) => ({
      ...target,
      keepType,
      id: 'openai:chat:tenant/private-served-model:Q4_K_M',
      config: {
        apiBaseUrl: 'https://private-inference.example.test/tenant/v1',
        apiKey: 'private-server-test-key',
        stop: ['<end>'],
        passthrough: { chat_template_kwargs: { enable_thinking: false } },
      },
    })),
  ),
  {
    label: 'AWS Bedrock Agents',
    type: 'bedrock-agent',
    keepType: true,
    id: 'bedrock:agents:AGENT123',
    config: { agentAliasId: 'ALIAS456', region: 'eu-west-1' },
  },
];

describe('eval provider configuration round trips', () => {
  beforeEach(resetStores);
  afterEach(() => {
    resetStores();
    vi.clearAllMocks();
  });

  it.each(cases)(
    'keeps $label editable after saving and reopening (saved type: $keepType)',
    async ({ label, type, keepType, id, config }) => {
      const user = userEvent.setup();
      const onSave = vi.fn();
      const onClose = vi.fn();
      const view = renderWithProviders(
        <AddProviderDialog open onClose={onClose} onSave={onSave} />,
      );
      await user.click(screen.getByText(label, { selector: 'p' }).closest('[role="button"]')!);
      await replaceText(user, screen.getByRole('textbox', { name: /Target ID/ }), id);
      await replaceText(
        user,
        screen.getByRole('textbox', { name: 'Provider configuration JSON' }),
        JSON.stringify(config),
      );
      await user.click(screen.getByRole('button', { name: 'Add Provider' }));
      expect(onClose).toHaveBeenCalledOnce();
      expect(onSave).toHaveBeenCalledOnce();
      const saved = JSON.parse(JSON.stringify(onSave.mock.calls[0][0]));
      expect(saved).toMatchObject({ id, config });
      // External/older YAML can carry a compatible endpoint without the UI hint.
      if (!keepType) {
        delete saved.config.type;
      }
      view.unmount();
      onSave.mockClear();
      renderWithProviders(
        <AddProviderDialog open onClose={onClose} onSave={onSave} initialProvider={saved} />,
      );
      expect(screen.getByRole('textbox', { name: /Target ID/ })).toHaveValue(id);
      expect(
        JSON.parse(
          (
            screen.getByRole('textbox', {
              name: 'Provider configuration JSON',
            }) as HTMLTextAreaElement
          ).value,
        ),
      ).toEqual(saved.config);

      if (!keepType) {
        await user.click(screen.getByRole('button', { name: 'Back' }));
        await user.click(screen.getByText(label, { selector: 'p' }).closest('[role="button"]')!);
        expect(screen.getByRole('textbox', { name: /Target ID/ })).toHaveValue(id);
        expect(
          JSON.parse(
            (
              screen.getByRole('textbox', {
                name: 'Provider configuration JSON',
              }) as HTMLTextAreaElement
            ).value,
          ),
        ).toMatchObject(saved.config);
      }
      await replaceText(
        user,
        screen.getByRole('textbox', { name: 'Provider configuration JSON' }),
        '{"invalid":}',
      );
      expect(screen.getByRole('button', { name: 'Save Changes' })).toBeDisabled();
      expect(onSave).not.toHaveBeenCalled();
      const edited =
        type === 'bedrock-agent'
          ? { ...config, agentAliasId: 'ALIAS789' }
          : {
              ...config,
              stop: ['<new-end>'],
              passthrough: { chat_template_kwargs: { enable_thinking: true } },
            };
      await replaceText(
        user,
        screen.getByRole('textbox', { name: 'Provider configuration JSON' }),
        JSON.stringify(edited),
      );
      await user.click(screen.getByRole('button', { name: 'Format' }));
      await user.click(screen.getByRole('button', { name: 'Save Changes' }));
      expect(onSave).toHaveBeenCalledOnce();
      expect(onSave.mock.calls[0][0]).toMatchObject({ id, label: saved.label, config: edited });
    },
  );

  it.each([undefined, 'https://api.openai.com/v1'])(
    'preserves an imported apiHost through local selection and ID editing (apiBaseUrl: %s)',
    async (apiBaseUrl) => {
      const user = userEvent.setup();
      const onSave = vi.fn();
      const imported = {
        id: 'openai:chat:tenant/original-model',
        config: {
          apiHost: 'private.example.test/tenant',
          ...(apiBaseUrl ? { apiBaseUrl } : {}),
          apiKeyEnvar: 'LOCAL_MODEL_KEY',
          max_tokens: 321,
        },
      };
      renderWithProviders(
        <AddProviderDialog open onClose={vi.fn()} onSave={onSave} initialProvider={imported} />,
      );
      expect(screen.getByRole('textbox', { name: /Target ID/ })).toHaveValue(imported.id);
      await user.click(screen.getByRole('button', { name: 'Back' }));
      await user.click(screen.getByText('vLLM', { selector: 'p' }).closest('[role="button"]')!);
      const id = 'openai:chat:tenant/model.json-v2';
      await replaceText(user, screen.getByRole('textbox', { name: /Target ID/ }), id);
      await user.click(screen.getByRole('button', { name: 'Save Changes' }));
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          id,
          config: expect.objectContaining({
            ...imported.config,
            type: 'vllm',
            apiKeyRequired: false,
            useDefaultApiKey: false,
          }),
        }),
      );
    },
  );

  it('edits an imported Bedrock agent shorthand with no config object', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const [imported] = normalizeProviders(['bedrock:agents:AGENT123']);
    renderWithProviders(
      <AddProviderDialog open onClose={vi.fn()} onSave={onSave} initialProvider={imported} />,
    );
    expect(screen.getByRole('textbox', { name: 'Provider configuration JSON' })).toHaveValue('{}');
    await replaceText(
      user,
      screen.getByRole('textbox', { name: 'Provider configuration JSON' }),
      JSON.stringify({ agentAliasId: 'ALIAS456', region: 'eu-west-1' }),
    );
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        id: imported.id,
        config: { agentAliasId: 'ALIAS456', region: 'eu-west-1' },
      }),
    );
  });

  it.each(
    [
      { label: 'Llamafile', type: 'llamafile' },
      { label: 'vLLM', type: 'vllm' },
      { label: 'Text Generation WebUI', type: 'text-generation-webui' },
    ].flatMap((target) => [false, true].map((selectedKey) => ({ ...target, selectedKey }))),
  )(
    'retains $label credentials when JSON changes while the ID is blank (selected key: $selectedKey)',
    async ({ label, type, selectedKey }) => {
      const user = userEvent.setup();
      const onSave = vi.fn();
      renderWithProviders(<AddProviderDialog open onClose={vi.fn()} onSave={onSave} />);
      await user.click(screen.getByText(label, { selector: 'p' }).closest('[role="button"]')!);
      await user.clear(screen.getByRole('textbox', { name: /Target ID/ }));
      const replacement = {
        apiBaseUrl: 'https://private-inference.example.test/tenant/v1',
        ...(selectedKey ? { apiKeyEnvar: 'LOCAL_MODEL_KEY' } : {}),
      };
      await replaceText(
        user,
        screen.getByRole('textbox', { name: 'Provider configuration JSON' }),
        JSON.stringify(replacement),
      );
      const id = 'openai:chat:tenant/model.json-v2';
      await replaceText(user, screen.getByRole('textbox', { name: /Target ID/ }), id);
      await user.click(screen.getByRole('button', { name: 'Add Provider' }));

      expect(onSave).toHaveBeenCalledOnce();
      const [saved] = normalizeProviders(JSON.parse(JSON.stringify([onSave.mock.calls[0][0]])));
      expect(saved).toMatchObject({
        id,
        config: { ...replacement, type, apiKeyRequired: false, useDefaultApiKey: false },
      });
    },
  );

  it.each([
    { model: 'tenant/model.json-v2', type: undefined },
    { model: 'tenant/model.pytorch-v2', type: undefined },
    { model: 'tenant/model.js', type: 'vllm' },
    { model: 'tenant/model.py:Q4_K_M', type: 'llamafile' },
  ])(
    'preserves the opaque served model $model when editing a custom endpoint',
    async ({ model, type }) => {
      const user = userEvent.setup();
      const onSave = vi.fn();
      const config = {
        ...(type ? { type } : {}),
        apiBaseUrl: 'https://private-inference.example.test/tenant/v1',
        apiKeyEnvar: 'PRIVATE_MODEL_KEY',
        apiKeyRequired: false,
        useDefaultApiKey: false,
        stop: ['<end>'],
      };
      const view = renderWithProviders(
        <AddProviderDialog
          open
          onClose={vi.fn()}
          onSave={onSave}
          initialProvider={{ id: 'openai:chat:tenant/original-model', config }}
        />,
      );

      const id = `openai:chat:${model}`;
      await replaceText(user, screen.getByRole('textbox', { name: /Target ID/ }), id);
      await user.click(screen.getByRole('button', { name: 'Save Changes' }));
      expect(onSave).toHaveBeenCalledOnce();
      const [saved] = normalizeProviders(JSON.parse(JSON.stringify([onSave.mock.calls[0][0]])));
      expect(saved).toMatchObject({ id, config });

      view.unmount();
      renderWithProviders(
        <AddProviderDialog open onClose={vi.fn()} onSave={vi.fn()} initialProvider={saved} />,
      );
      expect(screen.getByRole('textbox', { name: /Target ID/ })).toHaveValue(id);
      expect(
        JSON.parse(
          (
            screen.getByRole('textbox', {
              name: 'Provider configuration JSON',
            }) as HTMLTextAreaElement
          ).value,
        ),
      ).toEqual(config);
    },
  );

  it.each(['llamafile', 'vllm', 'text-generation-webui', 'bedrock-agent'])(
    'keeps a reopened %s target when an empty ID is rejected',
    async (type) => {
      const user = userEvent.setup();
      const onSave = vi.fn();
      const initialProvider = {
        id:
          type === 'bedrock-agent'
            ? 'bedrock:agents:AGENT123'
            : 'openai:chat:tenant/private-served-model:Q4_K_M',
        config:
          type === 'bedrock-agent'
            ? { agentAliasId: 'ALIAS456', region: 'eu-west-1' }
            : { type, apiBaseUrl: 'http://localhost:8000/v1', stop: ['<end>'] },
      };
      renderWithProviders(
        <AddProviderDialog
          open
          onClose={vi.fn()}
          onSave={onSave}
          initialProvider={initialProvider}
        />,
      );
      await user.clear(screen.getByRole('textbox', { name: /Target ID/ }));
      await user.click(screen.getByRole('button', { name: 'Save Changes' }));
      expect(onSave).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Save Changes' })).toBeDisabled();
      await replaceText(
        user,
        screen.getByRole('textbox', { name: /Target ID/ }),
        initialProvider.id,
      );
      await user.click(screen.getByRole('button', { name: 'Save Changes' }));
      expect(normalizeProviders([onSave.mock.calls[0][0]])).toMatchObject([initialProvider]);
    },
  );

  it('saves the Groq advanced token limit from the real model editor', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    renderWithProviders(<AddProviderDialog open onClose={vi.fn()} onSave={onSave} />);
    await user.click(screen.getByText('Groq', { selector: 'p' }).closest('[role="button"]')!);
    await user.click(screen.getByRole('button', { name: /Advanced Configuration/ }));
    await replaceText(user, screen.getByLabelText('Max Tokens'), '100');
    await user.click(screen.getByRole('button', { name: 'Add Provider' }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'groq:openai/gpt-oss-120b',
        config: expect.objectContaining({ max_tokens: 100 }),
      }),
    );
  });
});
