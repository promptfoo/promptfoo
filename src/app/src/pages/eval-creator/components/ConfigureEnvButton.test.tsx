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
    await openProviderSettingsDialog();
  });

  it('should update the environment configuration and close the dialog when the Save button is clicked after editing environment fields', async () => {
    const initialEnv = { ANTHROPIC_API_KEY: 'existing-anthropic-key' };
    useStore.getState().updateConfig({ env: initialEnv });

    render(<ConfigureEnvButton />);

    await openProviderSettingsDialog();

    const openaiApiKeyInput = screen.getByLabelText(/openai api key/i);
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

  it('should close the dialog without updating the environment configuration when the Cancel button is clicked', async () => {
    const initialEnv = { OPENAI_API_KEY: 'initial-openai-key' };
    useStore.getState().updateConfig({ env: initialEnv });
    const initialConfig = useStore.getState().config;

    render(<ConfigureEnvButton />);

    await openProviderSettingsDialog();

    const openaiApiKeyInput = screen.getByLabelText(/openai api key/i);
    await userEvent.type(openaiApiKeyInput, 'new-openai-key');

    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    await userEvent.click(cancelButton);

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    const currentConfig = useStore.getState().config;
    expect(currentConfig.env).toEqual(initialConfig.env);
  });

  it('should pre-fill environment fields with values from config.env when the dialog is opened', async () => {
    const initialEnv = {
      OPENAI_API_KEY: 'test-openai-key',
      AZURE_API_KEY: 'test-azure-key',
    };
    useStore.getState().updateConfig({ env: initialEnv });

    render(<ConfigureEnvButton />);

    await openProviderSettingsDialog();

    const openaiApiKeyInput = screen.getByLabelText(/openai api key/i);
    expect(openaiApiKeyInput).toHaveValue(initialEnv.OPENAI_API_KEY);

    // Expand the Azure section
    const azureSection = screen.getByRole('button', { name: /azure/i });
    await userEvent.click(azureSection);

    const azureApiKeyInput = screen.getByLabelText(/azure api key/i);
    expect(azureApiKeyInput).toHaveValue(initialEnv.AZURE_API_KEY);
  });

  it('should save the Amazon Bedrock API key', async () => {
    render(<ConfigureEnvButton />);

    await openProviderSettingsDialog();
    await userEvent.click(screen.getByRole('button', { name: /Amazon Bedrock/i }));

    const bedrockApiKeyInput = screen.getByLabelText(/Bedrock API key/i);
    await userEvent.type(bedrockApiKeyInput, 'bedrock-key');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(useStore.getState().config.env?.AWS_BEARER_TOKEN_BEDROCK).toBe('bedrock-key');
  });

  it('should save standard AWS credentials for generated Bedrock tokens', async () => {
    render(<ConfigureEnvButton />);

    await openProviderSettingsDialog();
    await userEvent.click(screen.getByRole('button', { name: /Amazon Bedrock/i }));

    await userEvent.type(screen.getByLabelText(/AWS access key ID/i), 'access-key');
    await userEvent.type(screen.getByLabelText(/AWS secret access key/i), 'secret-key');
    await userEvent.type(screen.getByLabelText(/AWS session token/i), 'session-token');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(useStore.getState().config.env).toEqual(
      expect.objectContaining({
        AWS_ACCESS_KEY_ID: 'access-key',
        AWS_SECRET_ACCESS_KEY: 'secret-key',
        AWS_SESSION_TOKEN: 'session-token',
      }),
    );
  });

  it('should refresh environment fields from the latest config when reopened', async () => {
    render(<ConfigureEnvButton />);

    useStore.getState().updateConfig({ env: { OPENAI_API_KEY: 'uploaded-key' } });

    await openProviderSettingsDialog();

    expect(screen.getByLabelText(/openai api key/i)).toHaveValue('uploaded-key');
  });

  it('should handle partial updates to the environment configuration, preserving existing values', async () => {
    const initialEnv = {
      ANTHROPIC_API_KEY: 'existing-anthropic-key',
      AZURE_API_KEY: 'existing-azure-key',
    };
    useStore.getState().updateConfig({ env: initialEnv });

    render(<ConfigureEnvButton />);

    await openProviderSettingsDialog();

    const openaiApiKeyInput = screen.getByLabelText(/openai api key/i);
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

    const openaiApiKeyInput = screen.getByLabelText(/openai api key/i);
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
