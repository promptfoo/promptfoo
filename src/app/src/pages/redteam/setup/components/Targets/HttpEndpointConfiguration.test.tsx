import React from 'react';

import { callApi } from '@app/utils/api';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import HttpEndpointConfiguration from './HttpEndpointConfiguration';
import type { ProviderOptions } from '../../types';

vi.mock('@app/utils/api');

vi.mock('prismjs', () => ({
  default: {
    highlight: vi.fn((code) => code),
    languages: { javascript: {} },
  },
}));

const renderWithTheme = (ui: React.ReactElement) => {
  const theme = createTheme({ palette: { mode: 'light' } });
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);
};

describe('HttpEndpointConfiguration', () => {
  let mockUpdateCustomTarget: ReturnType<typeof vi.fn>;
  let mockSetBodyError: ReturnType<typeof vi.fn>;
  let mockSetUrlError: ReturnType<typeof vi.fn>;
  const mockCallApi = vi.mocked(callApi);

  beforeEach(() => {
    mockUpdateCustomTarget = vi.fn();
    mockSetBodyError = vi.fn();
    mockSetUrlError = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Configuration Change Suggestions', () => {
    it("should update the selectedTarget configuration and internal state when a configuration change suggestion is applied via the 'Apply All' button", async () => {
      const initialTarget: ProviderOptions = {
        id: 'http-provider',
        config: {
          url: 'https://example.com/api',
          method: 'POST',
          headers: { 'X-Initial-Header': 'initial-value' },
          body: JSON.stringify({ initial: 'body' }),
        },
      };

      const suggestion = {
        headers: { 'X-New-Header': 'new-value', 'Content-Type': 'application/json' },
        body: { new: 'body', prompt: '{{prompt}}' },
      };

      mockCallApi.mockResolvedValue({
        ok: true,
        json: async () => ({
          testResult: {
            changes_needed: true,
            message: 'Changes needed',
            configuration_change_suggestion: suggestion,
          },
          providerResponse: {},
        }),
      } as Response);

      renderWithTheme(
        <HttpEndpointConfiguration
          selectedTarget={initialTarget}
          updateCustomTarget={mockUpdateCustomTarget}
          bodyError={null}
          setBodyError={mockSetBodyError}
          urlError={null}
          setUrlError={mockSetUrlError}
        />,
      );

      const testTargetButton = screen.getByRole('button', { name: /Test Target/i });
      fireEvent.click(testTargetButton);

      await waitFor(() => {
        expect(screen.getByText('Configuration Changes Needed')).toBeInTheDocument();
      });

      const applyAllButton = screen.getByRole('button', { name: /Apply All/i });
      fireEvent.click(applyAllButton);

      expect(mockUpdateCustomTarget).toHaveBeenCalledWith('headers', suggestion.headers);
      expect(mockUpdateCustomTarget).toHaveBeenCalledWith('body', suggestion.body);

      expect(screen.queryByDisplayValue('X-Initial-Header')).not.toBeInTheDocument();
      expect(screen.getByDisplayValue('X-New-Header')).toBeInTheDocument();
      expect(screen.getByDisplayValue('new-value')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Content-Type')).toBeInTheDocument();
      expect(screen.getByDisplayValue('application/json')).toBeInTheDocument();

      const allTextBoxes = screen.getAllByRole('textbox');
      const bodyEditor = allTextBoxes.find(
        (box) => box.textContent === JSON.stringify(suggestion.body, null, 2),
      );
      expect(bodyEditor).toBeInTheDocument();
    });

    it('should handle applying a configuration suggestion with an invalid URL format', async () => {
      const initialTarget: ProviderOptions = {
        id: 'http-provider',
        config: {
          url: 'https://example.com/api',
          method: 'POST',
          headers: { 'X-Initial-Header': 'initial-value' },
          body: JSON.stringify({ initial: 'body' }),
        },
      };

      const invalidUrl = 'invalid-url';
      const suggestion = {
        url: invalidUrl,
      };

      mockCallApi.mockResolvedValue({
        ok: true,
        json: async () => ({
          testResult: {
            changes_needed: true,
            message: 'Changes needed',
            configuration_change_suggestion: suggestion,
          },
          providerResponse: {},
        }),
      } as Response);

      renderWithTheme(
        <HttpEndpointConfiguration
          selectedTarget={initialTarget}
          updateCustomTarget={mockUpdateCustomTarget}
          bodyError={null}
          setBodyError={mockSetBodyError}
          urlError={null}
          setUrlError={mockSetUrlError}
        />,
      );

      const testTargetButton = screen.getByRole('button', { name: /Test Target/i });
      fireEvent.click(testTargetButton);

      await waitFor(() => {
        expect(screen.getByText('Configuration Changes Needed')).toBeInTheDocument();
      });

      const applyButton = screen.getByRole('button', { name: /^Apply$/i });
      fireEvent.click(applyButton);

      expect(mockUpdateCustomTarget).toHaveBeenCalledWith('url', invalidUrl);
    });

    it('should handle configuration suggestion with empty headers object', async () => {
      const initialTarget: ProviderOptions = {
        id: 'http-provider',
        config: {
          url: 'https://example.com/api',
          method: 'POST',
          headers: { 'X-Initial-Header': 'initial-value' },
          body: JSON.stringify({ initial: 'body' }),
        },
      };

      const suggestion = {
        headers: {},
        body: { new: 'body', prompt: '{{prompt}}' },
      };

      mockCallApi.mockResolvedValue({
        ok: true,
        json: async () => ({
          testResult: {
            changes_needed: true,
            message: 'Changes needed',
            configuration_change_suggestion: suggestion,
          },
          providerResponse: {},
        }),
      } as Response);

      renderWithTheme(
        <HttpEndpointConfiguration
          selectedTarget={initialTarget}
          updateCustomTarget={mockUpdateCustomTarget}
          bodyError={null}
          setBodyError={mockSetBodyError}
          urlError={null}
          setUrlError={mockSetUrlError}
        />,
      );

      const testTargetButton = screen.getByRole('button', { name: /Test Target/i });
      fireEvent.click(testTargetButton);

      await waitFor(() => {
        expect(screen.getByText('Configuration Changes Needed')).toBeInTheDocument();
      });

      const applyAllButton = screen.getByRole('button', { name: /Apply All/i });
      fireEvent.click(applyAllButton);

      expect(mockUpdateCustomTarget).toHaveBeenCalledWith('headers', {});

      expect(screen.queryByDisplayValue('X-Initial-Header')).not.toBeInTheDocument();
    });

    it('should convert non-string header values to strings when applying configuration suggestions', async () => {
      const initialTarget: ProviderOptions = {
        id: 'http-provider',
        config: {
          url: 'https://example.com/api',
          method: 'POST',
          headers: {},
          body: JSON.stringify({ initial: 'body' }),
        },
      };

      const suggestion = {
        headers: {
          'X-Number-Header': 123,
          'X-Boolean-Header': true,
          'X-Null-Header': null,
        },
        url: 'https://newexample.com/api',
      };

      mockCallApi.mockResolvedValue({
        ok: true,
        json: async () => ({
          testResult: {
            changes_needed: true,
            message: 'Changes needed',
            configuration_change_suggestion: suggestion,
          },
          providerResponse: {},
        }),
      } as Response);

      renderWithTheme(
        <HttpEndpointConfiguration
          selectedTarget={initialTarget}
          updateCustomTarget={mockUpdateCustomTarget}
          bodyError={null}
          setBodyError={mockSetBodyError}
          urlError={null}
          setUrlError={mockSetUrlError}
        />,
      );

      const testTargetButton = screen.getByRole('button', { name: /Test Target/i });
      fireEvent.click(testTargetButton);

      await waitFor(() => {
        expect(screen.getByText('Configuration Changes Needed')).toBeInTheDocument();
      });

      const applyButtons = await screen.findAllByRole('button', { name: /^Apply$/i });
      fireEvent.click(applyButtons[0]);

      expect(mockUpdateCustomTarget).toHaveBeenCalledWith('headers', {
        'X-Number-Header': '123',
        'X-Boolean-Header': 'true',
        'X-Null-Header': 'null',
      });

      expect(screen.getByDisplayValue('123')).toBeInTheDocument();
      expect(screen.getByDisplayValue('true')).toBeInTheDocument();
      expect(screen.getByDisplayValue('null')).toBeInTheDocument();

      fireEvent.click(applyButtons[1]);

      expect(mockUpdateCustomTarget).toHaveBeenCalledWith('url', 'https://newexample.com/api');
    });

    it('should validate URL and body fields correctly and show appropriate error messages when applying a configuration suggestion that updates both fields', async () => {
      const initialTarget: ProviderOptions = {
        id: 'http-provider',
        config: {
          url: 'https://example.com/api/initial',
          method: 'POST',
          headers: {},
          body: JSON.stringify({ initial: 'body', prompt: '{{prompt}}' }),
        },
      };

      const suggestion = {
        url: 'https://example.com/api/new',
        body: JSON.stringify({ new: 'body' }),
      };

      mockCallApi.mockResolvedValue({
        ok: true,
        json: async () => ({
          testResult: {
            changes_needed: true,
            message: 'Changes needed',
            configuration_change_suggestion: suggestion,
          },
          providerResponse: {},
        }),
      } as Response);

      renderWithTheme(
        <HttpEndpointConfiguration
          selectedTarget={initialTarget}
          updateCustomTarget={mockUpdateCustomTarget}
          bodyError={null}
          setBodyError={mockSetBodyError}
          urlError={null}
          setUrlError={mockSetUrlError}
        />,
      );

      const testTargetButton = screen.getByRole('button', { name: /Test Target/i });
      fireEvent.click(testTargetButton);

      await waitFor(() => {
        expect(screen.getByText('Configuration Changes Needed')).toBeInTheDocument();
      });

      const applyAllButton = screen.getByRole('button', { name: /Apply All/i });
      fireEvent.click(applyAllButton);

      expect(mockUpdateCustomTarget).toHaveBeenCalledWith('url', suggestion.url);
      expect(mockUpdateCustomTarget).toHaveBeenCalledWith('body', suggestion.body);

      expect(screen.getByDisplayValue('https://example.com/api/new')).toBeInTheDocument();

      const allTextBoxes = screen.getAllByRole('textbox');
      const bodyEditor = allTextBoxes.find(
        (box) => box.textContent === JSON.stringify(suggestion.body, null, 2),
      );
      expect(bodyEditor).toBeInTheDocument();
    });
  });

  describe('Response Parser Test Modal', () => {
    it('should pass the latest provider response (savedProviderResponse) as initialTestInput to ResponseParserTestModal after a successful test run', async () => {
      const initialTarget: ProviderOptions = {
        id: 'http-provider',
        config: {
          url: 'https://example.com/api',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: 'hello' }),
          transformResponse: 'json.message',
        },
      };

      const mockProviderResponse = {
        raw: JSON.stringify({ message: 'hello world' }),
        output: 'hello world',
      };

      mockCallApi.mockResolvedValue({
        ok: true,
        json: async () => ({
          testResult: {
            success: true,
            message: 'Target configuration is valid!',
          },
          providerResponse: mockProviderResponse,
        }),
      } as Response);

      renderWithTheme(
        <HttpEndpointConfiguration
          selectedTarget={initialTarget}
          updateCustomTarget={mockUpdateCustomTarget}
          bodyError={null}
          setBodyError={mockSetBodyError}
          urlError={null}
          setUrlError={mockSetUrlError}
        />,
      );

      const testTargetButton = screen.getByRole('button', { name: /Test Target/i });
      fireEvent.click(testTargetButton);

      await waitFor(() => {
        expect(mockCallApi).toHaveBeenCalled();
      });

      const testResponseParserButton = screen.getByRole('button', { name: /^Test$/i });
      fireEvent.click(testResponseParserButton);

      await waitFor(() => {
        const testInput = screen.getByPlaceholderText('Enter the API response from your endpoint');
        expect(testInput).toHaveValue(mockProviderResponse.raw);
      });
    });
  });
});
