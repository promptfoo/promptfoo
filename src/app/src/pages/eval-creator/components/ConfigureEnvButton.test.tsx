import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '@app/stores/evalConfig';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import ConfigureEnvButton from './ConfigureEnvButton';

const renderWithTheme = (component: React.ReactNode) => {
  const theme = createTheme({ palette: { mode: 'light' } });
  return render(<ThemeProvider theme={theme}>{component}</ThemeProvider>);
};

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
    renderWithTheme(<ConfigureEnvButton />);
    await openProviderSettingsDialog();
  });

  it('should update the environment configuration and close the dialog when the Save button is clicked after editing environment fields', async () => {
    const initialEnv = { ANTHROPIC_API_KEY: 'existing-anthropic-key' };
    useStore.getState().updateConfig({ env: initialEnv });

    renderWithTheme(<ConfigureEnvButton />);

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

    renderWithTheme(<ConfigureEnvButton />);

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

    renderWithTheme(<ConfigureEnvButton />);

    await openProviderSettingsDialog();

    const openaiApiKeyInput = screen.getByLabelText(/openai api key/i);
    expect(openaiApiKeyInput).toHaveValue(initialEnv.OPENAI_API_KEY);

    const azureApiKeyInput = screen.getByLabelText(/azure api key/i);
    expect(azureApiKeyInput).toHaveValue(initialEnv.AZURE_API_KEY);
  });

  it('should handle partial updates to the environment configuration, preserving existing values', async () => {
    const initialEnv = {
      ANTHROPIC_API_KEY: 'existing-anthropic-key',
      AZURE_API_KEY: 'existing-azure-key',
    };
    useStore.getState().updateConfig({ env: initialEnv });

    renderWithTheme(<ConfigureEnvButton />);

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
    renderWithTheme(<ConfigureEnvButton />);

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
});
