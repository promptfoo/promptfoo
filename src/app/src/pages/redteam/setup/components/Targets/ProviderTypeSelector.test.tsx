import React from 'react';

import { createTheme, ThemeProvider } from '@mui/material/styles';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ProviderTypeSelector from './ProviderTypeSelector';
import { useTelemetry } from '@app/hooks/useTelemetry';

import type { ProviderOptions } from '../../types';

const renderWithTheme = (ui: React.ReactElement) => {
  const theme = createTheme({ palette: { mode: 'light' } });
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);
};

vi.mock('@app/hooks/useTelemetry', () => ({
  useTelemetry: vi.fn().mockReturnValue({
    recordEvent: vi.fn(),
  }),
}));

describe('ProviderTypeSelector', () => {
  it('should update selectedProviderType and call setProvider with the correct provider configuration when a provider type card is selected', () => {
    const mockSetProvider = vi.fn();
    const initialProvider: ProviderOptions = {
      id: 'http',
      label: 'My Test Provider',
      config: {},
    };

    renderWithTheme(
      <ProviderTypeSelector
        provider={initialProvider}
        setProvider={mockSetProvider}
        providerType="http"
      />,
    );

    // Component should start in collapsed state showing the selected provider
    expect(screen.getByText('HTTP/HTTPS Endpoint')).toBeVisible();
    expect(screen.getByText('Connect to REST APIs and HTTP endpoints')).toBeVisible();

    // Click the "Change" button to expand the view
    const changeButton = screen.getByRole('button', { name: 'Change' });
    fireEvent.click(changeButton);

    // Now we should see the expanded view with all providers
    const pythonProviderCard = screen
      .getByText('Python Provider')
      .closest('div[class*="MuiPaper-root"]');
    expect(pythonProviderCard).toBeInTheDocument();

    if (pythonProviderCard) {
      fireEvent.click(pythonProviderCard);
    }

    expect(mockSetProvider).toHaveBeenCalledWith(
      {
        id: 'file:///path/to/custom_provider.py',
        config: {},
        label: 'My Test Provider',
      },
      'python',
    );

    // After selection, component should collapse again and show the new selection
    expect(screen.getByText('Python Provider')).toBeVisible();
    expect(screen.getByText('Custom Python provider for specialized integrations')).toBeVisible();
  });

  it('should filter provider options by search term when the user enters text in the search box', () => {
    const mockSetProvider = vi.fn();
    // Start with no provider to get expanded view initially
    const initialProvider: ProviderOptions = {
      id: '',
      config: {},
    };

    renderWithTheme(
      <ProviderTypeSelector provider={initialProvider} setProvider={mockSetProvider} />,
    );

    // Should start in expanded view since no provider is initially selected
    const searchInput = screen.getByPlaceholderText('Search providers...');
    fireEvent.change(searchInput, { target: { value: 'openai' } });

    expect(screen.getByText('OpenAI')).toBeVisible();

    expect(screen.queryByText('HTTP/HTTPS Endpoint')).toBeNull();
  });

  it('should filter provider options by selected category when a category chip is toggled on', () => {
    const mockSetProvider = vi.fn();
    // Start with no provider to get expanded view initially
    const initialProvider: ProviderOptions = {
      id: '',
      config: {},
    };

    renderWithTheme(
      <ProviderTypeSelector provider={initialProvider} setProvider={mockSetProvider} />,
    );

    // Should start in expanded view since no provider is initially selected
    const apiEndpointsChip = screen.getByRole('button', { name: 'API Endpoints' });
    fireEvent.click(apiEndpointsChip);

    expect(screen.getByText('HTTP/HTTPS Endpoint')).toBeVisible();

    const javascriptProvider = screen.queryByText('JavaScript Provider');
    expect(javascriptProvider).toBeNull();
  });

  it('should only display provider options included in availableProviderIds when availableProviderIds prop is provided', () => {
    const mockSetProvider = vi.fn();
    // Start with no provider to get expanded view initially
    const initialProvider: ProviderOptions = {
      id: '',
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

    // Should start in expanded view since no provider is initially selected
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
    expect(mockSetProvider).toHaveBeenCalledWith(defaultHttpConfig, 'http');

    // After auto-selection, should show collapsed view with HTTP provider
    expect(screen.getByText('HTTP/HTTPS Endpoint')).toBeVisible();
    expect(screen.getByText('Connect to REST APIs and HTTP endpoints')).toBeVisible();
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
    expect(mockSetProvider).toHaveBeenCalledWith(
      {
        id: 'http',
        config: {
          url: '',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: '{{prompt}}',
          }),
        },
      },
      'http',
    );

    // After auto-selection, should show collapsed view with HTTP provider
    expect(screen.getByText('HTTP/HTTPS Endpoint')).toBeVisible();
    expect(screen.getByText('Connect to REST APIs and HTTP endpoints')).toBeVisible();
  });

  it('should maintain category filters when a search term is entered and then cleared', () => {
    const mockSetProvider = vi.fn();
    // Start with no provider to get expanded view initially
    const initialProvider: ProviderOptions = {
      id: '',
      config: {},
    };

    renderWithTheme(
      <ProviderTypeSelector provider={initialProvider} setProvider={mockSetProvider} />,
    );

    // Should start in expanded view since no provider is initially selected
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
  it('should show collapsed view when provider is selected and expand when Change button is clicked', () => {
    const mockSetProvider = vi.fn();
    const initialProvider: ProviderOptions = {
      id: 'anthropic:messages:claude-sonnet-4-20250514',
      label: 'My Claude Provider',
      config: {},
    };

    renderWithTheme(
      <ProviderTypeSelector
        provider={initialProvider}
        setProvider={mockSetProvider}
        providerType="anthropic"
      />,
    );

    // Should show collapsed view with selected provider
    expect(screen.getByText('Anthropic')).toBeVisible();
    expect(screen.getByText('Claude models including Claude Sonnet 4')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Change' })).toBeVisible();

    // Should not show other providers or search/filter UI
    expect(screen.queryByText('OpenAI')).toBeNull();
    expect(screen.queryByPlaceholderText('Search providers...')).toBeNull();

    // Click Change button to expand
    const changeButton = screen.getByRole('button', { name: 'Change' });
    fireEvent.click(changeButton);

    // Now should show expanded view with all providers and search/filter UI
    expect(screen.getByPlaceholderText('Search providers...')).toBeVisible();
    expect(screen.getByText('OpenAI')).toBeVisible();
    expect(screen.getByText('Anthropic')).toBeVisible();
    expect(screen.getByRole('button', { name: 'All Categories' })).toBeVisible();
  });

  it("should call setProvider with the correct Go provider configuration when the 'Go Provider' card is selected", () => {
    const mockSetProvider = vi.fn();
    const initialProvider: ProviderOptions = {
      id: 'http',
      label: 'My Test Provider',
      config: {},
    };

    renderWithTheme(
      <ProviderTypeSelector
        provider={initialProvider}
        setProvider={mockSetProvider}
        providerType="http"
      />,
    );

    expect(screen.getByText('HTTP/HTTPS Endpoint')).toBeVisible();
    expect(screen.getByText('Connect to REST APIs and HTTP endpoints')).toBeVisible();

    const changeButton = screen.getByRole('button', { name: 'Change' });
    fireEvent.click(changeButton);

    const goProviderCard = screen.getByText('Go Provider').closest('div[class*="MuiPaper-root"]');
    expect(goProviderCard).toBeInTheDocument();

    if (goProviderCard) {
      fireEvent.click(goProviderCard);
    }

    expect(mockSetProvider).toHaveBeenCalledWith(
      {
        id: 'file:///path/to/your/script.go',
        config: {},
        label: 'My Test Provider',
      },
      'go',
    );

    expect(screen.getByText('Go Provider')).toBeVisible();
    expect(screen.getByText('Custom Go provider for specialized integrations')).toBeVisible();
  });

  it('should initialize selectedProviderType from the providerType prop when provided, and show the corresponding provider as selected in the collapsed view', () => {
    const mockSetProvider = vi.fn();
    const initialProvider: ProviderOptions = {
      id: 'file:///path/to/your/script.go',
      label: 'My Go Provider',
      config: {
        providerType: 'go',
      },
    };

    renderWithTheme(
      <ProviderTypeSelector
        provider={initialProvider}
        setProvider={mockSetProvider}
        providerType="go"
      />,
    );

    expect(screen.getByText('Go Provider')).toBeVisible();
    expect(screen.getByText('Custom Go provider for specialized integrations')).toBeVisible();
  });

  it('should initialize correctly when providerType is undefined but provider.id is set', () => {
    const mockSetProvider = vi.fn();
    const initialProvider: ProviderOptions = {
      id: 'openai:gpt-4.1',
      label: 'My OpenAI Provider',
      config: {},
    };

    renderWithTheme(
      <ProviderTypeSelector
        provider={initialProvider}
        setProvider={mockSetProvider}
        providerType={undefined}
      />,
    );

    expect(screen.getByText('OpenAI')).toBeVisible();
    expect(screen.getByText('GPT models including GPT-4.1 and reasoning models')).toBeVisible();
  });

  it('should correctly update provider configuration when switching from Go provider to HTTP provider', () => {
    const mockSetProvider = vi.fn();
    const initialProvider: ProviderOptions = {
      id: 'file:///path/to/your/script.go',
      label: 'My Go Provider',
      config: {},
    };

    renderWithTheme(
      <ProviderTypeSelector
        provider={initialProvider}
        setProvider={mockSetProvider}
        providerType="go"
      />,
    );

    expect(screen.getByText('Go Provider')).toBeVisible();
    expect(screen.getByText('Custom Go provider for specialized integrations')).toBeVisible();

    const changeButton = screen.getByRole('button', { name: 'Change' });
    fireEvent.click(changeButton);

    const httpProviderCard = screen
      .getByText('HTTP/HTTPS Endpoint')
      .closest('div[class*="MuiPaper-root"]');
    expect(httpProviderCard).toBeInTheDocument();

    if (httpProviderCard) {
      fireEvent.click(httpProviderCard);
    }

    expect(mockSetProvider).toHaveBeenCalledWith(
      {
        id: 'http',
        label: 'My Go Provider',
        config: {
          url: '',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: '{{prompt}}',
          }),
        },
      },
      'http',
    );

    expect(screen.getByText('HTTP/HTTPS Endpoint')).toBeVisible();
    expect(screen.getByText('Connect to REST APIs and HTTP endpoints')).toBeVisible();
  });

  it('should update the UI when the providerType prop changes after initial render', () => {
    const mockSetProvider = vi.fn();
    const initialProvider: ProviderOptions = {
      id: 'http',
      label: 'My Test Provider',
      config: {},
    };

    const { rerender } = renderWithTheme(
      <ProviderTypeSelector
        provider={initialProvider}
        setProvider={mockSetProvider}
        providerType="http"
      />,
    );

    expect(screen.getByText('HTTP/HTTPS Endpoint')).toBeVisible();
    expect(screen.getByText('Connect to REST APIs and HTTP endpoints')).toBeVisible();

    rerender(
      <ProviderTypeSelector
        provider={initialProvider}
        setProvider={mockSetProvider}
        providerType="python"
      />,
    );

    expect(screen.getByText('Python Provider')).toBeVisible();
    expect(screen.getByText('Custom Python provider for specialized integrations')).toBeVisible();
  });

  it('should handle the case where providerType is set to a value that does not exist in allProviderOptions array without crashing, and default to http', () => {
    const mockSetProvider = vi.fn();
    const initialProvider: ProviderOptions = {
      id: '',
      config: {},
    };

    renderWithTheme(
      <ProviderTypeSelector
        provider={initialProvider}
        setProvider={mockSetProvider}
        providerType="nonexistent-provider"
      />,
    );

    expect(screen.getByText('HTTP/HTTPS Endpoint')).toBeVisible();
  });
  it('should call setProvider with the correct configuration when an agentic framework is selected', () => {
    const mockSetProvider = vi.fn();
    const initialProvider: ProviderOptions = {
      id: 'http',
      label: 'My Test Provider',
      config: {},
    };

    renderWithTheme(
      <ProviderTypeSelector
        provider={initialProvider}
        setProvider={mockSetProvider}
        providerType="http"
      />,
    );

    expect(screen.getByText('HTTP/HTTPS Endpoint')).toBeVisible();
    expect(screen.getByText('Connect to REST APIs and HTTP endpoints')).toBeVisible();

    const changeButton = screen.getByRole('button', { name: 'Change' });
    fireEvent.click(changeButton);

    const langchainProviderCard = screen
      .getByText('LangChain')
      .closest('div[class*="MuiPaper-root"]');
    expect(langchainProviderCard).toBeInTheDocument();

    if (langchainProviderCard) {
      fireEvent.click(langchainProviderCard);
    }

    expect(mockSetProvider).toHaveBeenCalledWith(
      {
        id: 'file:///path/to/langchain_agent.py',
        config: {},
        label: 'My Test Provider',
      },
      'langchain',
    );

    expect(screen.getByText('LangChain')).toBeVisible();
    expect(
      screen.getByText('Framework for developing applications powered by language models'),
    ).toBeVisible();
  });

  it('should filter provider options to show only agentic frameworks when the Agents category chip is selected', () => {
    const mockSetProvider = vi.fn();
    const initialProvider: ProviderOptions = {
      id: '',
      config: {},
    };

    renderWithTheme(
      <ProviderTypeSelector provider={initialProvider} setProvider={mockSetProvider} />,
    );

    const agentsChip = screen.getByRole('button', { name: 'Agents' });
    fireEvent.click(agentsChip);

    expect(screen.getByText('LangChain')).toBeVisible();
    expect(screen.getByText('AutoGen')).toBeVisible();
    expect(screen.getByText('CrewAI')).toBeVisible();
    expect(screen.getByText('LlamaIndex')).toBeVisible();
    expect(screen.getByText('LangGraph')).toBeVisible();
    expect(screen.getByText('OpenAI Agents SDK')).toBeVisible();
    expect(screen.getByText('PydanticAI')).toBeVisible();
    expect(screen.getByText('Google ADK')).toBeVisible();
    expect(screen.getByText('Other Agent')).toBeVisible();

    expect(screen.queryByText('AI/ML API')).toBeNull();
    expect(screen.queryByText('AI21 Labs')).toBeNull();
    expect(screen.queryByText('Amazon SageMaker')).toBeNull();
  });

  it('should call recordEvent with the correct parameters when a category chip is selected or a provider type is selected', () => {
    const mockSetProvider = vi.fn();
    const mockRecordEvent = vi.fn();

    (useTelemetry as any).mockReturnValue({
      recordEvent: mockRecordEvent,
    });

    const initialProvider: ProviderOptions = {
      id: '',
      config: {},
    };

    renderWithTheme(
      <ProviderTypeSelector provider={initialProvider} setProvider={mockSetProvider} />,
    );

    const agentsCategoryChip = screen.getByRole('button', { name: 'Agents' });
    fireEvent.click(agentsCategoryChip);

    expect(mockRecordEvent).toHaveBeenCalledWith('feature_used', {
      feature: 'redteam_provider_category_filtered',
      category: 'agents',
    });

    const langchainProviderCard = screen
      .getByText('LangChain')
      .closest('div[class*="MuiPaper-root"]');
    if (langchainProviderCard) {
      fireEvent.click(langchainProviderCard);
    }

    expect(mockRecordEvent).toHaveBeenCalledWith('feature_used', {
      feature: 'redteam_provider_type_selected',
      provider_type: 'langchain',
      provider_label: 'LangChain',
      provider_category: 'agents',
    });
  });

  it('should call recordEvent with the correct parameters when the Change button is clicked', () => {
    const mockSetProvider = vi.fn();
    const mockRecordEvent = vi.fn();

    (useTelemetry as any).mockReturnValue({ recordEvent: mockRecordEvent });

    const initialProvider: ProviderOptions = {
      id: 'http',
      label: 'My Test Provider',
      config: {},
    };

    renderWithTheme(
      <ProviderTypeSelector
        provider={initialProvider}
        setProvider={mockSetProvider}
        providerType="http"
      />,
    );

    const changeButton = screen.getByRole('button', { name: 'Change' });
    fireEvent.click(changeButton);

    expect(mockRecordEvent).toHaveBeenCalledTimes(1);
    expect(mockRecordEvent).toHaveBeenCalledWith('feature_used', {
      feature: 'redteam_provider_selection_changed',
      previous_provider_type: 'http',
    });
  });

  it('should update selectedProviderType and call setProvider with the correct file path format when an agent provider is selected', () => {
    const mockSetProvider = vi.fn();
    const initialProvider: ProviderOptions = {
      id: 'http',
      label: 'My Test Provider',
      config: {},
    };

    renderWithTheme(
      <ProviderTypeSelector
        provider={initialProvider}
        setProvider={mockSetProvider}
        providerType="http"
      />,
    );

    expect(screen.getByText('HTTP/HTTPS Endpoint')).toBeVisible();
    expect(screen.getByText('Connect to REST APIs and HTTP endpoints')).toBeVisible();

    const changeButton = screen.getByRole('button', { name: 'Change' });
    fireEvent.click(changeButton);

    const langchainProviderCard = screen
      .getByText('LangChain')
      .closest('div[class*="MuiPaper-root"]');
    expect(langchainProviderCard).toBeInTheDocument();

    if (langchainProviderCard) {
      fireEvent.click(langchainProviderCard);
    }

    expect(mockSetProvider).toHaveBeenCalledWith(
      {
        id: 'file:///path/to/langchain_agent.py',
        config: {},
        label: 'My Test Provider',
      },
      'langchain',
    );

    expect(screen.getByText('LangChain')).toBeVisible();
    expect(
      screen.getByText('Framework for developing applications powered by language models'),
    ).toBeVisible();
  });

  it('should correctly transform provider configuration when switching from a non-agent provider to an agent provider, preserving the provider label', () => {
    const mockSetProvider = vi.fn();
    const initialProvider: ProviderOptions = {
      id: 'http',
      label: 'My HTTP Provider',
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
      <ProviderTypeSelector
        provider={initialProvider}
        setProvider={mockSetProvider}
        providerType="http"
      />,
    );

    expect(screen.getByText('HTTP/HTTPS Endpoint')).toBeVisible();
    expect(screen.getByText('Connect to REST APIs and HTTP endpoints')).toBeVisible();

    const changeButton = screen.getByRole('button', { name: 'Change' });
    fireEvent.click(changeButton);

    const langchainProviderCard = screen
      .getByText('LangChain')
      .closest('div[class*="MuiPaper-root"]');
    expect(langchainProviderCard).toBeInTheDocument();

    if (langchainProviderCard) {
      fireEvent.click(langchainProviderCard);
    }

    expect(mockSetProvider).toHaveBeenCalledWith(
      {
        id: 'file:///path/to/langchain_agent.py',
        config: {},
        label: 'My HTTP Provider',
      },
      'langchain',
    );

    expect(screen.getByText('LangChain')).toBeVisible();
    expect(
      screen.getByText('Framework for developing applications powered by language models'),
    ).toBeVisible();
  });
});
