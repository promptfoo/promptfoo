import { useStore } from '@app/stores/evalConfig';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import ConfigureEnvButton from './ConfigureEnvButton';

const openProviderSettingsDialog = async () => {
  const apiKeysButton = screen.getByRole('button', { name: /api keys/i });
  await userEvent.click(apiKeysButton);
  const dialog = await screen.findByRole('dialog', { name: /provider settings/i });
  expect(dialog).toBeInTheDocument();
  return dialog;
};

describe('ConfigureEnvButton', () => {
  beforeEach(() => {
    useStore.getState().reset();
  });

  it('should open the provider settings dialog when the API keys button is clicked', async () => {
    render(<ConfigureEnvButton />);
    const dialog = await openProviderSettingsDialog();

    expect(dialog).toHaveAccessibleDescription(
      'Add temporary credentials only for providers you use in this evaluation.',
    );
    expect(
      screen.getByText(/API keys are available to this evaluation until you reload the page/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/YAML download includes any keys/i)).toBeInTheDocument();
  });

  it('should update the environment configuration and close the dialog when the Save button is clicked after editing environment fields', async () => {
    const initialEnv = { ANTHROPIC_API_KEY: 'existing-anthropic-key' };
    useStore.getState().updateConfig({ env: initialEnv });

    render(<ConfigureEnvButton />);

    await openProviderSettingsDialog();

    const openaiApiKeyInput = screen.getByLabelText(/^openai api key$/i);
    const newOpenAiKey = 'new-openai-key-12345';
    await userEvent.type(openaiApiKeyInput, newOpenAiKey);

    const saveButton = screen.getByRole('button', { name: /save/i });
    await userEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    const updatedConfig = useStore.getState().config;
    expect(updatedConfig.env).toEqual({
      ...initialEnv,
      OPENAI_API_KEY: newOpenAiKey,
    });
  });

  it('should confirm before discarding edited provider settings and leave the saved configuration unchanged', async () => {
    const initialEnv = { OPENAI_API_KEY: 'initial-openai-key' };
    useStore.getState().updateConfig({ env: initialEnv });
    const initialConfig = useStore.getState().config;

    render(<ConfigureEnvButton />);

    await openProviderSettingsDialog();

    const openaiApiKeyInput = screen.getByLabelText(/^openai api key$/i);
    await userEvent.type(openaiApiKeyInput, 'new-openai-key');

    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    await userEvent.click(cancelButton);

    const discardDialog = screen.getByRole('dialog', { name: 'Discard provider setting changes?' });
    expect(discardDialog).toHaveAccessibleDescription(
      'Any unsaved API keys or endpoint settings you entered will be lost.',
    );
    expect(useStore.getState().config.env).toEqual(initialConfig.env);

    await userEvent.click(
      screen.getByRole('button', {
        name: 'Discard changes',
      }),
    );

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    const currentConfig = useStore.getState().config;
    expect(currentConfig.env).toEqual(initialConfig.env);
  });

  it('closes immediately when no provider setting changes have been made', async () => {
    render(<ConfigureEnvButton />);

    await openProviderSettingsDialog();
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(screen.queryByText('Discard provider setting changes?')).toBeNull();
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('should pre-fill environment fields with values from config.env when the dialog is opened', async () => {
    const initialEnv = {
      OPENAI_API_KEY: 'test-openai-key',
      AZURE_API_KEY: 'test-azure-key',
    };
    useStore.getState().updateConfig({ env: initialEnv });

    render(<ConfigureEnvButton />);

    await openProviderSettingsDialog();

    const openaiApiKeyInput = screen.getByLabelText(/^openai api key$/i);
    expect(openaiApiKeyInput).toHaveValue(initialEnv.OPENAI_API_KEY);

    // Expand the Azure section
    const azureSection = screen.getByRole('button', { name: /azure/i });
    await userEvent.click(azureSection);

    const azureApiKeyInput = screen.getByLabelText(/^azure api key$/i);
    expect(azureApiKeyInput).toHaveValue(initialEnv.AZURE_API_KEY);
  });

  it('masks only secret values and lets users verify API keys on demand', async () => {
    render(<ConfigureEnvButton />);

    await openProviderSettingsDialog();

    const apiKeyInput = screen.getByLabelText(/^openai api key$/i);
    const hostInput = screen.getByLabelText(/^openai api host$/i);
    const organizationInput = screen.getByLabelText(/^openai organization$/i);

    expect(apiKeyInput).toHaveAttribute('type', 'password');
    expect(apiKeyInput).toHaveAttribute('autocomplete', 'new-password');
    expect(hostInput).toHaveAttribute('type', 'url');
    expect(organizationInput).toHaveAttribute('type', 'text');

    await userEvent.click(screen.getByRole('button', { name: /show openai api key/i }));

    expect(apiKeyInput).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: /hide openai api key/i })).toBeInTheDocument();
  });

  it('leaves non-secret Vertex project and region fields readable', async () => {
    render(<ConfigureEnvButton />);

    await openProviderSettingsDialog();
    await userEvent.click(screen.getByRole('button', { name: /google vertex ai/i }));

    expect(screen.getByLabelText(/^vertex api key$/i)).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText(/^vertex project id$/i)).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText(/^vertex region$/i)).toHaveAttribute('type', 'text');
  });

  it('should refresh environment fields from the latest config when reopened', async () => {
    render(<ConfigureEnvButton />);

    useStore.getState().updateConfig({ env: { OPENAI_API_KEY: 'uploaded-key' } });

    await openProviderSettingsDialog();

    expect(screen.getByLabelText(/^openai api key$/i)).toHaveValue('uploaded-key');
  });

  it('should handle partial updates to the environment configuration, preserving existing values', async () => {
    const initialEnv = {
      ANTHROPIC_API_KEY: 'existing-anthropic-key',
      AZURE_API_KEY: 'existing-azure-key',
    };
    useStore.getState().updateConfig({ env: initialEnv });

    render(<ConfigureEnvButton />);

    await openProviderSettingsDialog();

    const openaiApiKeyInput = screen.getByLabelText(/^openai api key$/i);
    await userEvent.type(openaiApiKeyInput, 'new-openai-key');

    const saveButton = screen.getByRole('button', { name: /save/i });
    await userEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    const updatedConfig = useStore.getState().config;
    expect(updatedConfig.env).toEqual({
      ANTHROPIC_API_KEY: 'existing-anthropic-key',
      AZURE_API_KEY: 'existing-azure-key',
      OPENAI_API_KEY: 'new-openai-key',
    });
  });

  it('should save invalid API key format to the store', async () => {
    render(<ConfigureEnvButton />);

    await openProviderSettingsDialog();

    const openaiApiKeyInput = screen.getByLabelText(/^openai api key$/i);
    const invalidApiKey = 'invalid-api-key-format';
    await userEvent.type(openaiApiKeyInput, invalidApiKey);

    const saveButton = screen.getByRole('button', { name: /save/i });
    await userEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    const updatedConfig = useStore.getState().config;
    expect(updatedConfig.env?.OPENAI_API_KEY).toBe(invalidApiKey);
  });

  it('keeps dialog actions visible while provider settings scroll independently', async () => {
    render(<ConfigureEnvButton />);
    const dialog = await openProviderSettingsDialog();
    const scrollBody = screen.getByTestId('configure-env-dialog-scroll-body');
    const footer = screen.getByTestId('configure-env-dialog-footer');

    expect(dialog).toHaveClass('flex', 'max-h-[85vh]', 'flex-col', 'overflow-hidden');
    expect(scrollBody).toHaveClass('min-h-0', 'flex-1', 'overflow-y-auto');
    expect(footer).toHaveClass('shrink-0');
  });
});
