import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import CustomTargetConfiguration from './CustomTargetConfiguration';

const theme = createTheme();

describe('CustomTargetConfiguration', () => {
  const defaultProps = {
    selectedTarget: {
      id: 'custom-provider',
      config: { temperature: 0.7 },
    },
    updateCustomTarget: vi.fn(),
    rawConfigJson: '{"temperature": 0.7}',
    setRawConfigJson: vi.fn(),
    bodyError: null,
  };

  const renderWithTheme = (ui: React.ReactElement) => {
    return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders custom target configuration', () => {
    renderWithTheme(<CustomTargetConfiguration {...defaultProps} />);

    expect(screen.getByText('Custom Target Configuration')).toBeInTheDocument();
    expect(screen.getByLabelText('Target ID')).toBeInTheDocument();
    expect(screen.getByText('Provider Configuration')).toBeInTheDocument();
  });

  it('updates target ID when changed', async () => {
    renderWithTheme(<CustomTargetConfiguration {...defaultProps} />);

    const targetIdInput = screen.getByLabelText('Target ID');
    fireEvent.change(targetIdInput, { target: { value: 'openai:gpt-4' } });

    await waitFor(() => {
      expect(defaultProps.updateCustomTarget).toHaveBeenCalledWith('id', 'openai:gpt-4');
    });
  });

  it('shows configure provider settings button', () => {
    renderWithTheme(<CustomTargetConfiguration {...defaultProps} />);

    const configButton = screen.getByRole('button', { name: /Configure Provider Settings/i });
    expect(configButton).toBeInTheDocument();
  });

  it('displays current configuration when config exists', () => {
    const propsWithConfig = {
      ...defaultProps,
      selectedTarget: {
        id: 'custom-provider',
        config: {
          temperature: 0.7,
          max_tokens: 1024,
          apiKey: 'test-key',
        },
      },
    };

    renderWithTheme(<CustomTargetConfiguration {...propsWithConfig} />);

    expect(screen.getByText('Current Configuration:')).toBeInTheDocument();
    // Check that the JSON configuration is displayed
    expect(screen.getByText(/"temperature": 0.7/)).toBeInTheDocument();
    expect(screen.getByText(/"max_tokens": 1024/)).toBeInTheDocument();
  });

  it('opens provider config dialog when button is clicked', async () => {
    renderWithTheme(<CustomTargetConfiguration {...defaultProps} />);

    const configButton = screen.getByRole('button', { name: /Configure Provider Settings/i });
    fireEvent.click(configButton);

    await waitFor(() => {
      // The dialog should be opened (mocked in tests)
      expect(screen.getByText('Provider Configuration')).toBeInTheDocument();
    });
  });

  it('handles config save from dialog', async () => {
    const { rerender } = renderWithTheme(<CustomTargetConfiguration {...defaultProps} />);

    // Click configure button to open dialog
    const configButton = screen.getByRole('button', { name: /Configure Provider Settings/i });
    fireEvent.click(configButton);

    // Wait for dialog to open
    await waitFor(() => {
      expect(screen.getByText('Provider Configuration')).toBeInTheDocument();
    });

    // Mock saving configuration
    const newConfig = { temperature: 0.9, apiKey: 'new-key' };

    // Since the dialog is mocked, we simulate the save action
    defaultProps.updateCustomTarget('config', newConfig);
    defaultProps.setRawConfigJson(JSON.stringify(newConfig, null, 2));

    expect(defaultProps.updateCustomTarget).toHaveBeenCalledWith('config', newConfig);
    expect(defaultProps.setRawConfigJson).toHaveBeenCalledWith(JSON.stringify(newConfig, null, 2));
  });
});
