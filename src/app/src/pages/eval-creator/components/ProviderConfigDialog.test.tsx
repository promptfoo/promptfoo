import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
    
    expect(screen.getByText('Common Configuration')).toBeInTheDocument();
    expect(screen.getByText('Custom Configuration')).toBeInTheDocument();
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
    
    const yamlTab = screen.getByRole('tab', { name: 'YAML Editor' });
    fireEvent.click(yamlTab);
    
    await waitFor(() => {
      expect(screen.getByText(/Edit the provider configuration in YAML format/)).toBeInTheDocument();
    });
  });

  it('allows adding custom fields', async () => {
    renderWithTheme(<ProviderConfigDialog {...defaultProps} />);
    
    const newFieldInput = screen.getByLabelText('New Field Name');
    const addButton = screen.getByRole('button', { name: /Add Field/i });
    
    fireEvent.change(newFieldInput, { target: { value: 'custom_param' } });
    fireEvent.click(addButton);
    
    await waitFor(() => {
      const fieldInputs = screen.getAllByLabelText('Field Name');
      expect(fieldInputs.some(input => (input as HTMLInputElement).value === 'custom_param')).toBe(true);
    });
  });

  it('saves configuration from form editor', async () => {
    renderWithTheme(<ProviderConfigDialog {...defaultProps} />);
    
    const temperatureInput = screen.getByLabelText('Temperature');
    fireEvent.change(temperatureInput, { target: { value: '0.9' } });
    
    const saveButton = screen.getByRole('button', { name: 'Save' });
    fireEvent.click(saveButton);
    
    await waitFor(() => {
      expect(defaultProps.onSave).toHaveBeenCalledWith('openai:gpt-4', expect.objectContaining({
        temperature: 0.9,
        max_tokens: 1024,
      }));
    });
  });

  it('validates Azure deployment_id requirement', () => {
    const azureProps = {
      ...defaultProps,
      providerId: 'azure:chat:gpt-4',
      config: {},
    };
    
    renderWithTheme(<ProviderConfigDialog {...azureProps} />);
    
    expect(screen.getByText(/You must specify a deployment ID for Azure OpenAI models/)).toBeInTheDocument();
    
    const saveButton = screen.getByRole('button', { name: 'Save' });
    expect(saveButton).toBeDisabled();
  });

  it('handles YAML editor errors gracefully', async () => {
    renderWithTheme(<ProviderConfigDialog {...defaultProps} />);
    
    const yamlTab = screen.getByRole('tab', { name: 'YAML Editor' });
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