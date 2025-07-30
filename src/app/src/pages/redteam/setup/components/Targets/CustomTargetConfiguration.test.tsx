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
    expect(screen.getByText('Custom Configuration')).toBeInTheDocument();
  });

  it('updates target ID when changed', async () => {
    renderWithTheme(<CustomTargetConfiguration {...defaultProps} />);

    const targetIdInput = screen.getByRole('textbox', { name: /Target ID/i });
    fireEvent.change(targetIdInput, { target: { value: 'openai:gpt-4' } });

    await waitFor(() => {
      expect(defaultProps.updateCustomTarget).toHaveBeenCalledWith('id', 'openai:gpt-4');
    });
  });

  it('displays configuration JSON in textarea', () => {
    renderWithTheme(<CustomTargetConfiguration {...defaultProps} />);

    const configTextarea = screen.getByRole('textbox', { name: /Configuration \(JSON\)/i });
    expect(configTextarea).toBeInTheDocument();
    expect(configTextarea).toHaveValue('{"temperature": 0.7}');
  });

  it('updates configuration when JSON is changed', async () => {
    renderWithTheme(<CustomTargetConfiguration {...defaultProps} />);

    const configTextarea = screen.getByRole('textbox', { name: /Configuration \(JSON\)/i });
    const newConfig = '{"temperature": 0.9, "max_tokens": 1024}';

    fireEvent.change(configTextarea, { target: { value: newConfig } });

    await waitFor(() => {
      expect(defaultProps.setRawConfigJson).toHaveBeenCalledWith(newConfig);
      expect(defaultProps.updateCustomTarget).toHaveBeenCalledWith('config', {
        temperature: 0.9,
        max_tokens: 1024,
      });
    });
  });

  it('displays error message when bodyError is provided', () => {
    const propsWithError = {
      ...defaultProps,
      bodyError: 'Invalid JSON format',
    };

    renderWithTheme(<CustomTargetConfiguration {...propsWithError} />);

    expect(screen.getByText('Invalid JSON format')).toBeInTheDocument();
    const configTextarea = screen.getByRole('textbox', { name: /Configuration \(JSON\)/i });
    expect(configTextarea).toHaveAttribute('aria-invalid', 'true');
  });

  it('displays helper text when no error', () => {
    renderWithTheme(<CustomTargetConfiguration {...defaultProps} />);

    expect(screen.getByText('Enter your custom configuration as JSON')).toBeInTheDocument();
  });

  it('handles invalid JSON gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    renderWithTheme(<CustomTargetConfiguration {...defaultProps} />);

    const configTextarea = screen.getByRole('textbox', { name: /Configuration \(JSON\)/i });
    const invalidJson = '{"temperature": invalid}';

    fireEvent.change(configTextarea, { target: { value: invalidJson } });

    await waitFor(() => {
      expect(defaultProps.setRawConfigJson).toHaveBeenCalledWith(invalidJson);
      expect(defaultProps.updateCustomTarget).not.toHaveBeenCalledWith('config', expect.anything());
      expect(consoleSpy).toHaveBeenCalledWith('Invalid JSON configuration:', expect.any(Error));
    });

    consoleSpy.mockRestore();
  });
});
