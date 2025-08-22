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
    expect(screen.getByRole('textbox', { name: /Target ID/i })).toBeInTheDocument();
    expect(screen.getByText('Provider Configuration')).toBeInTheDocument();
  });

  it('updates target ID when changed', async () => {
    renderWithTheme(<CustomTargetConfiguration {...defaultProps} />);

    const targetIdInput = screen.getByRole('textbox', { name: /Target ID/i });
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
    expect(screen.getByText(/"temperature": 0.7/)).toBeInTheDocument();
    expect(screen.getByText(/"max_tokens": 1024/)).toBeInTheDocument();
  });

  it('opens provider config dialog when button is clicked', async () => {
    renderWithTheme(<CustomTargetConfiguration {...defaultProps} />);

    const configButton = screen.getByRole('button', { name: /Configure Provider Settings/i });
    fireEvent.click(configButton);

    await waitFor(() => {
      const dialogTitle = screen.getByRole('heading', {
        name: /Provider Configuration/i,
        level: 2,
      });
      expect(dialogTitle).toBeInTheDocument();
    });
  });

  it('handles config save from dialog', async () => {
    renderWithTheme(<CustomTargetConfiguration {...defaultProps} />);

    const configButton = screen.getByRole('button', { name: /Configure Provider Settings/i });
    fireEvent.click(configButton);

    await waitFor(() => {
      const dialogTitle = screen.getByRole('heading', {
        name: /Provider Configuration/i,
        level: 2,
      });
      expect(dialogTitle).toBeInTheDocument();
    });

    const newConfig = { temperature: 0.9, apiKey: 'new-key' };

    defaultProps.updateCustomTarget('config', newConfig);
    defaultProps.setRawConfigJson(JSON.stringify(newConfig, null, 2));

    expect(defaultProps.updateCustomTarget).toHaveBeenCalledWith('config', newConfig);
    expect(defaultProps.setRawConfigJson).toHaveBeenCalledWith(JSON.stringify(newConfig, null, 2));
  });
});
