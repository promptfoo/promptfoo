import React from 'react';

import { createTheme, ThemeProvider } from '@mui/material/styles';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import CustomTargetConfiguration from './CustomTargetConfiguration';

import type { ProviderOptions } from '../../types';

const theme = createTheme({ palette: { mode: 'light' } });

const renderWithTheme = (ui: React.ReactElement) => {
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);
};

describe('CustomTargetConfiguration', () => {
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

  describe('Provider Configuration Dialog', () => {
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
      expect(defaultProps.setRawConfigJson).toHaveBeenCalledWith(
        JSON.stringify(newConfig, null, 2),
      );
    });
  });
});
