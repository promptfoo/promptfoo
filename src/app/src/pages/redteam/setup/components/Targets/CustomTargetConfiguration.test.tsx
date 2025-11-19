import React from 'react';

import { createTheme, ThemeProvider } from '@mui/material/styles';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import CustomTargetConfiguration from './CustomTargetConfiguration';

import type { ProviderOptions } from '../../types';

const renderWithTheme = (ui: React.ReactElement) => {
  const theme = createTheme({ palette: { mode: 'light' } });
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);
};

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

  describe('file:// prefix handling', () => {
    it('should add file:// prefix to Python file paths', () => {
      const mockUpdateCustomTarget = vi.fn();
      const mockSetRawConfigJson = vi.fn();
      const selectedTarget: ProviderOptions = {
        id: '',
        config: {},
      };

      renderWithTheme(
        <CustomTargetConfiguration
          selectedTarget={selectedTarget}
          updateCustomTarget={mockUpdateCustomTarget}
          rawConfigJson="{}"
          setRawConfigJson={mockSetRawConfigJson}
          bodyError={null}
        />,
      );

      const input = screen.getByLabelText(/Target ID/i);
      fireEvent.change(input, { target: { value: '/path/to/script.py' } });

      expect(mockUpdateCustomTarget).toHaveBeenCalledWith('id', 'file:///path/to/script.py');
    });

    it('should add file:// prefix to JavaScript file paths', () => {
      const mockUpdateCustomTarget = vi.fn();
      const mockSetRawConfigJson = vi.fn();
      const selectedTarget: ProviderOptions = {
        id: '',
        config: {},
      };

      renderWithTheme(
        <CustomTargetConfiguration
          selectedTarget={selectedTarget}
          updateCustomTarget={mockUpdateCustomTarget}
          rawConfigJson="{}"
          setRawConfigJson={mockSetRawConfigJson}
          bodyError={null}
        />,
      );

      const input = screen.getByLabelText(/Target ID/i);
      fireEvent.change(input, { target: { value: '/path/to/provider.js' } });

      expect(mockUpdateCustomTarget).toHaveBeenCalledWith('id', 'file:///path/to/provider.js');
    });

    it('should not add file:// prefix if already present', () => {
      const mockUpdateCustomTarget = vi.fn();
      const mockSetRawConfigJson = vi.fn();
      const selectedTarget: ProviderOptions = {
        id: '',
        config: {},
      };

      renderWithTheme(
        <CustomTargetConfiguration
          selectedTarget={selectedTarget}
          updateCustomTarget={mockUpdateCustomTarget}
          rawConfigJson="{}"
          setRawConfigJson={mockSetRawConfigJson}
          bodyError={null}
        />,
      );

      const input = screen.getByLabelText(/Target ID/i);
      fireEvent.change(input, { target: { value: 'file:///path/to/script.py' } });

      expect(mockUpdateCustomTarget).toHaveBeenCalledWith('id', 'file:///path/to/script.py');
    });

    it('should not modify non-Python/JavaScript provider IDs', () => {
      const mockUpdateCustomTarget = vi.fn();
      const mockSetRawConfigJson = vi.fn();
      const selectedTarget: ProviderOptions = {
        id: '',
        config: {},
      };

      renderWithTheme(
        <CustomTargetConfiguration
          selectedTarget={selectedTarget}
          updateCustomTarget={mockUpdateCustomTarget}
          rawConfigJson="{}"
          setRawConfigJson={mockSetRawConfigJson}
          bodyError={null}
        />,
      );

      const input = screen.getByLabelText(/Target ID/i);
      fireEvent.change(input, { target: { value: 'openai:gpt-4' } });

      expect(mockUpdateCustomTarget).toHaveBeenCalledWith('id', 'openai:gpt-4');
    });

    it('should handle relative Python paths', () => {
      const mockUpdateCustomTarget = vi.fn();
      const mockSetRawConfigJson = vi.fn();
      const selectedTarget: ProviderOptions = {
        id: '',
        config: {},
      };

      renderWithTheme(
        <CustomTargetConfiguration
          selectedTarget={selectedTarget}
          updateCustomTarget={mockUpdateCustomTarget}
          rawConfigJson="{}"
          setRawConfigJson={mockSetRawConfigJson}
          bodyError={null}
        />,
      );

      const input = screen.getByLabelText(/Target ID/i);
      fireEvent.change(input, { target: { value: './provider.py' } });

      expect(mockUpdateCustomTarget).toHaveBeenCalledWith('id', 'file://./provider.py');
    });

    it('should strip file:// prefix for display', () => {
      const mockUpdateCustomTarget = vi.fn();
      const mockSetRawConfigJson = vi.fn();
      const selectedTarget: ProviderOptions = {
        id: 'file:///path/to/script.py',
        config: {},
      };

      renderWithTheme(
        <CustomTargetConfiguration
          selectedTarget={selectedTarget}
          updateCustomTarget={mockUpdateCustomTarget}
          rawConfigJson="{}"
          setRawConfigJson={mockSetRawConfigJson}
          bodyError={null}
        />,
      );

      const input = screen.getByLabelText(/Target ID/i) as HTMLInputElement;
      expect(input.value).toBe('/path/to/script.py');
    });

    it('should handle HTTP provider IDs without modification', () => {
      const mockUpdateCustomTarget = vi.fn();
      const mockSetRawConfigJson = vi.fn();
      const selectedTarget: ProviderOptions = {
        id: '',
        config: {},
      };

      renderWithTheme(
        <CustomTargetConfiguration
          selectedTarget={selectedTarget}
          updateCustomTarget={mockUpdateCustomTarget}
          rawConfigJson="{}"
          setRawConfigJson={mockSetRawConfigJson}
          bodyError={null}
        />,
      );

      const input = screen.getByLabelText(/Target ID/i);
      fireEvent.change(input, { target: { value: 'http://example.com/api' } });

      expect(mockUpdateCustomTarget).toHaveBeenCalledWith('id', 'http://example.com/api');
    });

    it('should add file:// prefix to Python paths with custom function names', () => {
      const mockUpdateCustomTarget = vi.fn();
      const mockSetRawConfigJson = vi.fn();
      const selectedTarget: ProviderOptions = {
        id: '',
        config: {},
      };

      renderWithTheme(
        <CustomTargetConfiguration
          selectedTarget={selectedTarget}
          updateCustomTarget={mockUpdateCustomTarget}
          rawConfigJson="{}"
          setRawConfigJson={mockSetRawConfigJson}
          bodyError={null}
        />,
      );

      const input = screen.getByLabelText(/Target ID/i);
      fireEvent.change(input, { target: { value: '/path/to/script.py:custom_func' } });

      expect(mockUpdateCustomTarget).toHaveBeenCalledWith(
        'id',
        'file:///path/to/script.py:custom_func',
      );
    });

    it('should add file:// prefix to JavaScript paths with custom function names', () => {
      const mockUpdateCustomTarget = vi.fn();
      const mockSetRawConfigJson = vi.fn();
      const selectedTarget: ProviderOptions = {
        id: '',
        config: {},
      };

      renderWithTheme(
        <CustomTargetConfiguration
          selectedTarget={selectedTarget}
          updateCustomTarget={mockUpdateCustomTarget}
          rawConfigJson="{}"
          setRawConfigJson={mockSetRawConfigJson}
          bodyError={null}
        />,
      );

      const input = screen.getByLabelText(/Target ID/i);
      fireEvent.change(input, { target: { value: './provider.js:myFunc' } });

      expect(mockUpdateCustomTarget).toHaveBeenCalledWith('id', 'file://./provider.js:myFunc');
    });
  });
});
