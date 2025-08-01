import React from 'react';

import { createTheme, ThemeProvider } from '@mui/material/styles';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import ProviderTypeSelector from './ProviderTypeSelector';
import type { ProviderOptions } from '../../types';

const renderWithTheme = (ui: React.ReactElement) => {
  const theme = createTheme({ palette: { mode: 'light' } });
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);
};

describe('ProviderTypeSelector', () => {
  it('should update selectedProviderType and call setProvider with the correct provider configuration when a provider type card is selected', () => {
    const mockSetProvider = vi.fn();
    const initialProvider: ProviderOptions = {
      id: 'http',
      label: 'My Test Provider',
      config: {},
    };

    renderWithTheme(
      <ProviderTypeSelector provider={initialProvider} setProvider={mockSetProvider} />,
    );

    const httpRadio = screen.getByDisplayValue('http') as HTMLInputElement;
    expect(httpRadio.checked).toBe(true);

    const pythonProviderCard = screen
      .getByText('Python Provider')
      .closest('div[class*="MuiPaper-root"]');
    expect(pythonProviderCard).toBeInTheDocument();

    if (pythonProviderCard) {
      fireEvent.click(pythonProviderCard);
    }

    expect(mockSetProvider).toHaveBeenCalledTimes(1);
    expect(mockSetProvider).toHaveBeenCalledWith({
      id: 'file:///path/to/custom_provider.py',
      config: {},
      label: 'My Test Provider',
    });

    const pythonRadio = screen.getByDisplayValue('python') as HTMLInputElement;
    expect(pythonRadio.checked).toBe(true);

    expect(httpRadio.checked).toBe(false);
  });

  it('should filter provider options by search term when the user enters text in the search box', () => {
    const mockSetProvider = vi.fn();
    const initialProvider: ProviderOptions = {
      id: 'http',
      label: 'My Test Provider',
      config: {},
    };

    renderWithTheme(
      <ProviderTypeSelector provider={initialProvider} setProvider={mockSetProvider} />,
    );

    const searchInput = screen.getByPlaceholderText('Search providers...');
    fireEvent.change(searchInput, { target: { value: 'openai' } });

    expect(screen.getByText('OpenAI')).toBeVisible();

    expect(screen.queryByText('HTTP/HTTPS Endpoint')).toBeNull();
  });

  it('should filter provider options by selected category when a category chip is toggled on', () => {
    const mockSetProvider = vi.fn();
    const initialProvider: ProviderOptions = {
      id: 'http',
      label: 'My Test Provider',
      config: {},
    };

    renderWithTheme(
      <ProviderTypeSelector provider={initialProvider} setProvider={mockSetProvider} />,
    );

    const apiEndpointsChip = screen.getByRole('button', { name: 'API Endpoints' });
    fireEvent.click(apiEndpointsChip);

    expect(screen.getByText('HTTP/HTTPS Endpoint')).toBeVisible();

    const javascriptProvider = screen.queryByText('JavaScript Provider');
    expect(javascriptProvider).toBeNull();
  });

  it('should only display provider options included in availableProviderIds when availableProviderIds prop is provided', () => {
    const mockSetProvider = vi.fn();
    const initialProvider: ProviderOptions = {
      id: 'http',
      label: 'My Test Provider',
      config: {},
    };

    const availableProviderIds = ['http', 'python', 'openai'];

    renderWithTheme(
      <ProviderTypeSelector
        provider={initialProvider}
        setProvider={mockSetProvider}
        availableProviderIds={availableProviderIds}
      />,
    );

    expect(screen.getByText('HTTP/HTTPS Endpoint')).toBeVisible();

    expect(screen.getByText('Python Provider')).toBeVisible();

    expect(screen.getByText('OpenAI')).toBeVisible();

    expect(screen.queryByText('WebSocket Endpoint')).toBeNull();
  });

  it("should default to 'http' provider and call setProvider with default HTTP config when mounted with no provider.id", () => {
    const mockSetProvider = vi.fn();
    const defaultHttpConfig = {
      id: 'http',
      config: {
        url: '',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: '{{prompt}}',
        }),
      },
    };

    renderWithTheme(
      <ProviderTypeSelector provider={{ id: '', config: {} }} setProvider={mockSetProvider} />,
    );

    expect(mockSetProvider).toHaveBeenCalledTimes(1);
    expect(mockSetProvider).toHaveBeenCalledWith(defaultHttpConfig);

    const httpRadio = screen.getByDisplayValue('http') as HTMLInputElement;
    expect(httpRadio.checked).toBe(true);
  });

  it('should handle a provider with a malformed ID (empty string) and default to HTTP provider', () => {
    const mockSetProvider = vi.fn();
    const initialProvider: ProviderOptions = {
      id: '',
      label: 'Invalid Provider',
      config: {},
    };

    renderWithTheme(
      <ProviderTypeSelector provider={initialProvider} setProvider={mockSetProvider} />,
    );

    expect(mockSetProvider).toHaveBeenCalledTimes(1);
    expect(mockSetProvider).toHaveBeenCalledWith({
      id: 'http',
      config: {
        url: '',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: '{{prompt}}',
        }),
      },
    });

    const httpRadio = screen.getByDisplayValue('http') as HTMLInputElement;
    expect(httpRadio.checked).toBe(true);
  });

  it('should maintain category filters when a search term is entered and then cleared', () => {
    const mockSetProvider = vi.fn();
    const initialProvider: ProviderOptions = {
      id: 'http',
      label: 'My Test Provider',
      config: {},
    };

    renderWithTheme(
      <ProviderTypeSelector provider={initialProvider} setProvider={mockSetProvider} />,
    );

    const customCategoryChip = screen.getByText('Custom');
    fireEvent.click(customCategoryChip);

    const searchInput = screen.getByPlaceholderText('Search providers...');
    fireEvent.change(searchInput, { target: { value: 'javascript' } });

    fireEvent.change(searchInput, { target: { value: '' } });

    const customProviders = [
      'JavaScript Provider',
      'Python Provider',
      'Go Provider',
      'Custom Provider',
      'MCP Server',
      'Web Browser',
      'Shell Command',
    ];

    customProviders.forEach((providerLabel) => {
      expect(screen.getByText(providerLabel)).toBeVisible();
    });

    expect(screen.queryByText('HTTP/HTTPS Endpoint')).toBeNull();
  });
});
