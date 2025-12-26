import React from 'react';

import { useTelemetry } from '@app/hooks/useTelemetry';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ProviderTypeSelector from './ProviderTypeSelector';

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

    // Component should always be expanded, showing the selected provider at the top
    expect(screen.getByText('Currently Selected')).toBeVisible();
    const httpEndpoints = screen.getAllByText('HTTP/HTTPS Endpoint');
    expect(httpEndpoints.length).toBeGreaterThan(0);
    const httpDescriptions = screen.getAllByText('Connect to REST APIs and HTTP endpoints');
    expect(httpDescriptions.length).toBeGreaterThan(0);

    // Search and filters should be visible
    expect(screen.getByPlaceholderText('Search providers...')).toBeVisible();

    // Now click on Python provider in the list
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

    // The selected provider at the top should still show (always expanded)
    const pythonProviders = screen.getAllByText('Python Provider');
    expect(pythonProviders.length).toBeGreaterThan(0);
    const pythonDescriptions = screen.getAllByText(
      'Custom Python provider for specialized integrations',
    );
    expect(pythonDescriptions.length).toBeGreaterThan(0);
  });

  it('should filter provider options by search term when the user enters text in the search box', () => {
    const mockSetProvider = vi.fn();
    // Start with no provider to get the list view
    const initialProvider: ProviderOptions = {
      id: '',
      config: {},
    };

    renderWithTheme(
      <ProviderTypeSelector provider={initialProvider} setProvider={mockSetProvider} />,
    );

    // Component is always expanded, should show search
    const searchInput = screen.getByPlaceholderText('Search providers...');
    fireEvent.change(searchInput, { target: { value: 'openai' } });

    expect(screen.getByText('OpenAI')).toBeVisible();

    expect(screen.queryByText(/HTTP\/HTTPS Endpoint/)).toBeNull();
  });

  it('should filter provider options by selected category when a category chip is toggled on', () => {
    const mockSetProvider = vi.fn();
    const initialProvider: ProviderOptions = {
      id: '',
      config: {},
    };

    renderWithTheme(
      <ProviderTypeSelector provider={initialProvider} setProvider={mockSetProvider} />,
    );

    // Component is always expanded
    const apiEndpointsChip = screen.getByRole('button', { name: 'API Endpoints' });
    fireEvent.click(apiEndpointsChip);

    expect(screen.getByText(/HTTP\/HTTPS Endpoint/)).toBeVisible();

    const javascriptProvider = screen.queryByText('JavaScript Provider');
    expect(javascriptProvider).toBeNull();
  });

  it('should only display provider options included in availableProviderIds when availableProviderIds prop is provided', () => {
    const mockSetProvider = vi.fn();
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

    // Component is always expanded
    expect(screen.getByText(/HTTP\/HTTPS Endpoint/)).toBeVisible();

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

    // After auto-selection, should show the selected provider in the list (but no "Currently Selected" card since provider.id is empty initially)
    // The component will auto-select HTTP but since we started with empty id, it won't show "Currently Selected" until re-render
    // Just verify HTTP appears in the list
    const httpEndpoints = screen.getAllByText(/HTTP\/HTTPS Endpoint/);
    expect(httpEndpoints.length).toBeGreaterThan(0);
    const httpDescriptions = screen.getAllByText(/Connect to REST APIs and HTTP endpoints/);
    expect(httpDescriptions.length).toBeGreaterThan(0);
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

    // After auto-selection, should show the selected provider at top (always expanded)
    const httpEndpoints = screen.getAllByText(/HTTP\/HTTPS Endpoint/);
    expect(httpEndpoints.length).toBeGreaterThan(0);
    const httpDescriptions = screen.getAllByText(/Connect to REST APIs and HTTP endpoints/);
    expect(httpDescriptions.length).toBeGreaterThan(0);
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

    expect(screen.queryByText(/HTTP\/HTTPS Endpoint/)).toBeNull();
  });
  it('should show always-expanded view with selected provider at top and full list below', () => {
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

    // Should show selected provider at the top with "Currently Selected" label
    expect(screen.getByText('Currently Selected')).toBeVisible();
    const anthropicLabels = screen.getAllByText('Anthropic');
    expect(anthropicLabels.length).toBeGreaterThan(0);
    const claudeDescriptions = screen.getAllByText(/Claude models including Claude Sonnet 4/);
    expect(claudeDescriptions.length).toBeGreaterThan(0);

    // Should also show search/filter UI and other providers (always expanded)
    expect(screen.getByPlaceholderText('Search providers...')).toBeVisible();
    expect(screen.getByText('OpenAI')).toBeVisible();
    expect(screen.getByRole('button', { name: 'All Tags' })).toBeVisible();
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

    expect(screen.getByText('Currently Selected')).toBeVisible();
    const httpEndpoints = screen.getAllByText(/HTTP\/HTTPS Endpoint/);
    expect(httpEndpoints.length).toBeGreaterThan(0);
    const httpDescriptions = screen.getAllByText(/Connect to REST APIs and HTTP endpoints/);
    expect(httpDescriptions.length).toBeGreaterThan(0);

    // Component is always expanded, so we can click Go Provider directly
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

    const goProviders = screen.getAllByText('Go Provider');
    expect(goProviders.length).toBeGreaterThan(0);
    const goDescriptions = screen.getAllByText('Custom Go provider for specialized integrations');
    expect(goDescriptions.length).toBeGreaterThan(0);
  });

  it('should initialize selectedProviderType from the providerType prop when provided, and show the corresponding provider as selected at the top', () => {
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

    expect(screen.getByText('Currently Selected')).toBeVisible();
    const goProviders = screen.getAllByText('Go Provider');
    expect(goProviders.length).toBeGreaterThan(0);
    const goDescriptions = screen.getAllByText('Custom Go provider for specialized integrations');
    expect(goDescriptions.length).toBeGreaterThan(0);
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

    expect(screen.getByText('Currently Selected')).toBeVisible();
    const goProviders = screen.getAllByText('Go Provider');
    expect(goProviders.length).toBeGreaterThan(0);
    const goDescriptions = screen.getAllByText(/Custom Go provider for specialized integrations/);
    expect(goDescriptions.length).toBeGreaterThan(0);

    // Component is always expanded, so we can click HTTP provider directly
    const httpProviderCard = screen
      .getByText(/HTTP\/HTTPS Endpoint/)
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

    const httpEndpoints = screen.getAllByText(/HTTP\/HTTPS Endpoint/);
    expect(httpEndpoints.length).toBeGreaterThan(0);
    const httpDescriptions = screen.getAllByText(/Connect to REST APIs and HTTP endpoints/);
    expect(httpDescriptions.length).toBeGreaterThan(0);
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

    const httpEndpoints = screen.getAllByText(/HTTP\/HTTPS Endpoint/);
    expect(httpEndpoints.length).toBeGreaterThan(0);
    const httpDescriptions = screen.getAllByText(/Connect to REST APIs and HTTP endpoints/);
    expect(httpDescriptions.length).toBeGreaterThan(0);

    rerender(
      <ProviderTypeSelector
        provider={initialProvider}
        setProvider={mockSetProvider}
        providerType="python"
      />,
    );

    const pythonProviders = screen.getAllByText('Python Provider');
    expect(pythonProviders.length).toBeGreaterThan(0);
    const pythonDescriptions = screen.getAllByText(
      'Custom Python provider for specialized integrations',
    );
    expect(pythonDescriptions.length).toBeGreaterThan(0);
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

    expect(screen.getByText(/HTTP\/HTTPS Endpoint/)).toBeVisible();
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

    expect(screen.getByText('Currently Selected')).toBeVisible();
    const httpEndpoints = screen.getAllByText(/HTTP\/HTTPS Endpoint/);
    expect(httpEndpoints.length).toBeGreaterThan(0);
    const httpDescriptions = screen.getAllByText(/Connect to REST APIs and HTTP endpoints/);
    expect(httpDescriptions.length).toBeGreaterThan(0);

    // Component is always expanded, so we can click LangChain directly
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

    const langchainLabels = screen.getAllByText('LangChain');
    expect(langchainLabels.length).toBeGreaterThan(0);
    const langchainDescriptions = screen.getAllByText(
      'Framework for developing applications powered by language models',
    );
    expect(langchainDescriptions.length).toBeGreaterThan(0);
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
      feature: 'redteam_provider_tag_filtered',
      tag: 'agents',
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
      provider_tag: 'agents',
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

    const httpEndpoints = screen.getAllByText(/HTTP\/HTTPS Endpoint/);
    expect(httpEndpoints.length).toBeGreaterThan(0);
    const httpDescriptions = screen.getAllByText(/Connect to REST APIs and HTTP endpoints/);
    expect(httpDescriptions.length).toBeGreaterThan(0);

    // Component is always expanded, so we can click LangChain directly

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

    const langchainLabels = screen.getAllByText('LangChain');
    expect(langchainLabels.length).toBeGreaterThan(0);
    const langchainDescriptions = screen.getAllByText(
      'Framework for developing applications powered by language models',
    );
    expect(langchainDescriptions.length).toBeGreaterThan(0);
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

    expect(screen.getByText('Currently Selected')).toBeVisible();
    const httpEndpoints = screen.getAllByText(/HTTP\/HTTPS Endpoint/);
    expect(httpEndpoints.length).toBeGreaterThan(0);
    const httpDescriptions = screen.getAllByText(/Connect to REST APIs and HTTP endpoints/);
    expect(httpDescriptions.length).toBeGreaterThan(0);

    // Component is always expanded, so we can click LangChain directly
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

    const langchainLabels = screen.getAllByText('LangChain');
    expect(langchainLabels.length).toBeGreaterThan(0);
    const langchainDescriptions = screen.getAllByText(
      'Framework for developing applications powered by language models',
    );
    expect(langchainDescriptions.length).toBeGreaterThan(0);
  });

  it('should filter provider options by selected tag and call recordEvent with the correct tag when a tag chip is toggled on', () => {
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

    expect(mockRecordEvent).toHaveBeenCalledWith('feature_used', {
      feature: 'redteam_provider_tag_filtered',
      tag: 'agents',
    });
  });

  it('should call recordEvent with the correct provider_tag when a provider type is selected', () => {
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

    const pythonProviderCard = screen
      .getByText('Python Provider')
      .closest('div[class*="MuiPaper-root"]');
    if (pythonProviderCard) {
      fireEvent.click(pythonProviderCard);
    }

    expect(mockRecordEvent).toHaveBeenCalledWith('feature_used', {
      feature: 'redteam_provider_type_selected',
      provider_type: 'python',
      provider_label: 'Python Provider',
      provider_tag: 'custom',
    });
  });

  it('should reset the tag filter and display all provider options when the "All Tags" chip is clicked', () => {
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

    expect(screen.queryByText('HTTP/HTTPS Endpoint')).toBeNull();

    const allTagsChip = screen.getByRole('button', { name: 'All Tags' });
    fireEvent.click(allTagsChip);

    expect(screen.getByText('HTTP/HTTPS Endpoint')).toBeVisible();
  });

  it('should show all provider options when the "All Tags" button is clicked after filtering', () => {
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

    expect(screen.getByText('Currently Selected')).toBeVisible();
    const httpEndpoints = screen.getAllByText(/HTTP\/HTTPS Endpoint/);
    expect(httpEndpoints.length).toBeGreaterThan(0);
    const httpDescriptions = screen.getAllByText(/Connect to REST APIs and HTTP endpoints/);
    expect(httpDescriptions.length).toBeGreaterThan(0);

    // Component is always expanded, so filter by Agents
    const agentsChip = screen.getByRole('button', { name: 'Agents' });
    fireEvent.click(agentsChip);

    // HTTP should still be visible in "Currently Selected" card at top, but not in the filtered list below
    // Since the component is always expanded with the selected card at top, we need to check more carefully
    // The filter only affects the scrollable list, not the "Currently Selected" section
    const httpElements = screen.queryAllByText(/HTTP\/HTTPS Endpoint/);
    // Should have exactly 1 (in the Currently Selected card only, not in the filtered list)
    expect(httpElements.length).toBe(1);

    // Click "All Tags" to show all providers again
    const allTagsButton = screen.getByRole('button', { name: 'All Tags' });
    fireEvent.click(allTagsButton);

    // Now HTTP should appear in both places (Currently Selected + provider list)
    const httpEndpointsAfter = screen.getAllByText(/HTTP\/HTTPS Endpoint/);
    expect(httpEndpointsAfter.length).toBeGreaterThan(1);
  });

  it('should filter provider options correctly when availableProviderIds, search term, and tag are all provided', () => {
    const mockSetProvider = vi.fn();
    const initialProvider: ProviderOptions = {
      id: '',
      config: {},
    };

    const availableProviderIds = ['langchain', 'autogen', 'http'];

    renderWithTheme(
      <ProviderTypeSelector
        provider={initialProvider}
        setProvider={mockSetProvider}
        availableProviderIds={availableProviderIds}
      />,
    );

    const searchInput = screen.getByPlaceholderText('Search providers...');
    fireEvent.change(searchInput, { target: { value: 'lang' } });

    const agentsChip = screen.getByRole('button', { name: 'Agents' });
    fireEvent.click(agentsChip);

    expect(screen.getByText('LangChain')).toBeVisible();
    expect(screen.queryByText('AutoGen')).toBeNull();
    expect(screen.queryByText('HTTP/HTTPS Endpoint')).toBeNull();
  });

  it('should scroll selected provider card into view when provider type changes', () => {
    const mockSetProvider = vi.fn();
    const mockScrollIntoView = vi.fn();

    // Mock scrollIntoView on HTMLElement prototype
    HTMLElement.prototype.scrollIntoView = mockScrollIntoView;

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

    // Initial render should call scrollIntoView for HTTP provider
    expect(mockScrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'center',
    });

    // Clear the mock to check for subsequent calls
    mockScrollIntoView.mockClear();

    // Change to a different provider type
    rerender(
      <ProviderTypeSelector
        provider={initialProvider}
        setProvider={mockSetProvider}
        providerType="python"
      />,
    );

    // Should scroll again when provider type changes
    expect(mockScrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'center',
    });

    // Cleanup
    delete (HTMLElement.prototype as any).scrollIntoView;
  });
});
