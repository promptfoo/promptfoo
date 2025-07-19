import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import ProviderConfigDialog from './ProviderConfigDialog';

const theme = createTheme();

describe('ProviderConfigDialog', () => {
  const defaultProps = {
    open: true,
    providerId: 'openai:gpt-4',
    config: {
      temperature: 0.7,
      max_tokens: 1024,
    },
    onClose: vi.fn(),
    onSave: vi.fn(),
  };

  const renderWithTheme = (ui: React.ReactElement) => {
    return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders provider configuration dialog', () => {
    renderWithTheme(<ProviderConfigDialog {...defaultProps} />);

    expect(screen.getByText('Provider Configuration')).toBeInTheDocument();
    expect(screen.getByText('openai:gpt-4')).toBeInTheDocument();
  });

  it('displays form editor by default', () => {
    renderWithTheme(<ProviderConfigDialog {...defaultProps} />);

    expect(screen.getByRole('tab', { name: 'Form' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'YAML' })).toBeInTheDocument();
  });

  it('shows common fields even if not in config', () => {
    renderWithTheme(<ProviderConfigDialog {...defaultProps} />);

    expect(screen.getByLabelText('API Key')).toBeInTheDocument();
    expect(screen.getByLabelText('API Base URL')).toBeInTheDocument();
    expect(screen.getByLabelText('Temperature')).toBeInTheDocument();
    expect(screen.getByLabelText('Max Tokens')).toBeInTheDocument();
  });

  it('switches between form and YAML editor', async () => {
    renderWithTheme(<ProviderConfigDialog {...defaultProps} />);

    const yamlTab = screen.getByRole('tab', { name: 'YAML' });
    fireEvent.click(yamlTab);

    await waitFor(() => {
      // Check for the code editor by looking for textarea
      const editor = document.querySelector('textarea');
      expect(editor).toBeInTheDocument();
    });
  });

  it('shows message to use YAML tab for additional fields', () => {
    renderWithTheme(<ProviderConfigDialog {...defaultProps} />);

    expect(screen.getByText(/Need more configuration options\?/)).toBeInTheDocument();
    expect(screen.getByText('YAML tab')).toBeInTheDocument();
  });

  it('shows alert when config has additional fields beyond common ones', () => {
    const propsWithExtraFields = {
      ...defaultProps,
      config: {
        temperature: 0.7,
        max_tokens: 1024,
        custom_field: 'custom_value',
        nested_config: { key: 'value' },
      },
    };

    renderWithTheme(<ProviderConfigDialog {...propsWithExtraFields} />);

    expect(screen.getByText(/Additional configuration detected/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Switch to YAML' })).toBeInTheDocument();
  });

  it('saves configuration from form editor', async () => {
    renderWithTheme(<ProviderConfigDialog {...defaultProps} />);

    const temperatureInput = screen.getByLabelText('Temperature');
    fireEvent.change(temperatureInput, { target: { value: '0.9' } });

    const saveButton = screen.getByRole('button', { name: 'Save' });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(defaultProps.onSave).toHaveBeenCalledWith(
        'openai:gpt-4',
        expect.objectContaining({
          temperature: 0.9,
          max_tokens: 1024,
        }),
      );
    });
  });

  it('syncs YAML editor with form changes', async () => {
    renderWithTheme(<ProviderConfigDialog {...defaultProps} />);

    // Make a change in form editor
    const temperatureInput = screen.getByLabelText('Temperature');
    fireEvent.change(temperatureInput, { target: { value: '0.9' } });

    // Switch to YAML editor
    const yamlTab = screen.getByRole('tab', { name: 'YAML' });
    fireEvent.click(yamlTab);

    // YAML should contain the updated temperature
    await waitFor(() => {
      const yamlContent = document.querySelector('textarea')?.value || '';
      expect(yamlContent).toContain('temperature: 0.9');
    });
  });

  it('validates Azure deployment_id requirement', () => {
    const azureProps = {
      ...defaultProps,
      providerId: 'azure:chat:gpt-4',
      config: {},
    };

    renderWithTheme(<ProviderConfigDialog {...azureProps} />);

    expect(
      screen.getByText(/You must specify a deployment ID for Azure OpenAI models/),
    ).toBeInTheDocument();

    const saveButton = screen.getByRole('button', { name: 'Save' });
    expect(saveButton).toBeDisabled();
  });

  it('handles YAML editor errors gracefully', async () => {
    renderWithTheme(<ProviderConfigDialog {...defaultProps} />);

    const yamlTab = screen.getByRole('tab', { name: 'YAML' });
    fireEvent.click(yamlTab);

    await waitFor(() => {
      const editor = document.querySelector('textarea');
      if (editor) {
        // Simulate invalid YAML input
        fireEvent.change(editor, { target: { value: 'invalid: yaml: syntax:' } });
      }
    });

    const saveButton = screen.getByRole('button', { name: 'Save' });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText(/Invalid YAML/)).toBeInTheDocument();
      expect(defaultProps.onSave).not.toHaveBeenCalled();
    });
  });
});
