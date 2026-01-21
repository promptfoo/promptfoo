import React from 'react';

import { TooltipProvider } from '@app/components/ui/tooltip';
import { useTelemetry } from '@app/hooks/useTelemetry';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ProviderTypeSelector from './ProviderTypeSelector';

import type { ProviderOptions } from '../../types';

const renderWithTooltipProvider = (ui: React.ReactElement) => {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
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

    renderWithTooltipProvider(
      <ProviderTypeSelector
        provider={initialProvider}
        setProvider={mockSetProvider}
        providerType="http"
      />,
    );

    // Provider list is always expanded
    expect(screen.getByText('HTTP/HTTPS Endpoint')).toBeVisible();
    expect(screen.getByText('Python')).toBeVisible();

    // Select Python provider
    const pythonProviderCard = screen.getByText('Python').closest('[role="button"]');
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

    // List remains expanded after selection
    expect(screen.getByText('Python')).toBeVisible();
  });

  it('should filter provider options by search term when the user enters text in the search box', () => {
    const mockSetProvider = vi.fn();
    // Start with no provider to get expanded view initially
    const initialProvider: ProviderOptions = {
      id: '',
      config: {},
    };

    renderWithTooltipProvider(
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

    renderWithTooltipProvider(
      <ProviderTypeSelector provider={initialProvider} setProvider={mockSetProvider} />,
    );

    // Should start in expanded view since no provider is initially selected
    // Click on 'AI Providers' tag to filter to only AI providers
    const aiProvidersChip = screen.getByText(/^AI Providers \(/);
    fireEvent.click(aiProvidersChip);

    // OpenAI should be visible under AI Providers
    expect(screen.getByText('OpenAI')).toBeVisible();

    // HTTP should be hidden since it's in 'My Application' tag
    const httpProvider = screen.queryByText('HTTP/HTTPS Endpoint');
    expect(httpProvider).toBeNull();
  });

  it('should only display provider options included in availableProviderIds when availableProviderIds prop is provided', () => {
    const mockSetProvider = vi.fn();
    // Start with no provider to get expanded view initially
    const initialProvider: ProviderOptions = {
      id: '',
      config: {},
    };

    const availableProviderIds = ['http', 'python', 'openai'];

    renderWithTooltipProvider(
      <ProviderTypeSelector
        provider={initialProvider}
        setProvider={mockSetProvider}
        availableProviderIds={availableProviderIds}
      />,
    );

    // Should start in expanded view since no provider is initially selected
    expect(screen.getByText('HTTP/HTTPS Endpoint')).toBeVisible();

    expect(screen.getByText('Python')).toBeVisible();

    expect(screen.getByText('OpenAI')).toBeVisible();

    expect(screen.queryByText('WebSocket')).toBeNull();
  });

  it('should show expanded provider list when mounted with no provider.id (no auto-selection)', () => {
    const mockSetProvider = vi.fn();

    renderWithTooltipProvider(
      <ProviderTypeSelector provider={{ id: '', config: {} }} setProvider={mockSetProvider} />,
    );

    // Should NOT auto-select any provider
    expect(mockSetProvider).not.toHaveBeenCalled();

    // Should show expanded provider list
    expect(screen.getByText('HTTP/HTTPS Endpoint')).toBeVisible();
    expect(screen.getByText('OpenAI')).toBeVisible();
    expect(screen.getByText('Python')).toBeVisible();
  });

  it('should show expanded provider list with empty provider id (no auto-selection)', () => {
    const mockSetProvider = vi.fn();
    const initialProvider: ProviderOptions = {
      id: '',
      label: 'My Provider',
      config: {},
    };

    renderWithTooltipProvider(
      <ProviderTypeSelector provider={initialProvider} setProvider={mockSetProvider} />,
    );

    // Should NOT auto-select any provider
    expect(mockSetProvider).not.toHaveBeenCalled();

    // Should show expanded provider list
    expect(screen.getByText('HTTP/HTTPS Endpoint')).toBeVisible();
    expect(screen.getByText('OpenAI')).toBeVisible();
  });

  it('should maintain category filters when a search term is entered and then cleared', () => {
    const mockSetProvider = vi.fn();
    // Start with no provider to get expanded view initially
    const initialProvider: ProviderOptions = {
      id: '',
      config: {},
    };

    renderWithTooltipProvider(
      <ProviderTypeSelector provider={initialProvider} setProvider={mockSetProvider} />,
    );

    // Should start in expanded view since no provider is initially selected
    const myAppCategoryChip = screen.getByText(/^My Application \(/);
    fireEvent.click(myAppCategoryChip);

    const searchInput = screen.getByPlaceholderText('Search providers...');
    fireEvent.change(searchInput, { target: { value: 'javascript' } });

    fireEvent.change(searchInput, { target: { value: '' } });

    // Providers in the 'My Application' (app) tag
    const appProviders = [
      'JavaScript / TypeScript',
      'Python',
      'Go',
      'Custom Provider',
      'Browser Automation',
      'Shell Command',
      'HTTP/HTTPS Endpoint',
      'WebSocket',
    ];

    appProviders.forEach((providerLabel) => {
      expect(screen.getByText(providerLabel)).toBeVisible();
    });

    // OpenAI should be hidden when filtering to 'My Application' tag
    expect(screen.queryByText('OpenAI')).toBeNull();
  });
  it('should always show expanded provider list when provider is selected', () => {
    const mockSetProvider = vi.fn();
    const initialProvider: ProviderOptions = {
      id: 'anthropic:messages:claude-sonnet-4-20250514',
      label: 'My Claude Provider',
      config: {},
    };

    renderWithTooltipProvider(
      <ProviderTypeSelector
        provider={initialProvider}
        setProvider={mockSetProvider}
        providerType="anthropic"
      />,
    );

    // Provider list is always expanded
    expect(screen.getByText('Anthropic')).toBeVisible();
    expect(screen.getByText('OpenAI')).toBeVisible();
    expect(screen.getByPlaceholderText('Search providers...')).toBeVisible();
    expect(screen.getByText(/^All \(/)).toBeVisible();
  });

  it("should call setProvider with the correct Go provider configuration when the 'Go' card is selected", () => {
    const mockSetProvider = vi.fn();
    const initialProvider: ProviderOptions = {
      id: 'http',
      label: 'My Test Provider',
      config: {},
    };

    renderWithTooltipProvider(
      <ProviderTypeSelector
        provider={initialProvider}
        setProvider={mockSetProvider}
        providerType="http"
      />,
    );

    // Provider list is always expanded
    expect(screen.getByText('HTTP/HTTPS Endpoint')).toBeVisible();
    expect(screen.getByText('Go')).toBeVisible();

    const goProviderCard = screen.getByText('Go').closest('[role="button"]');
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

    expect(screen.getByText('Go')).toBeVisible();
    expect(screen.getByText('Custom Go integration')).toBeVisible();
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

    renderWithTooltipProvider(
      <ProviderTypeSelector
        provider={initialProvider}
        setProvider={mockSetProvider}
        providerType="go"
      />,
    );

    expect(screen.getByText('Go')).toBeVisible();
    expect(screen.getByText('Custom Go integration')).toBeVisible();
  });

  it('should initialize correctly when providerType is undefined but provider.id is set', () => {
    const mockSetProvider = vi.fn();
    const initialProvider: ProviderOptions = {
      id: 'openai:gpt-4.1',
      label: 'My OpenAI Provider',
      config: {},
    };

    renderWithTooltipProvider(
      <ProviderTypeSelector
        provider={initialProvider}
        setProvider={mockSetProvider}
        providerType={undefined}
      />,
    );

    expect(screen.getByText('OpenAI')).toBeVisible();
    expect(screen.getByText('GPT-5.2, GPT-5.1, and GPT-5 models')).toBeVisible();
  });

  it('should correctly update provider configuration when switching from Go provider to HTTP provider', () => {
    const mockSetProvider = vi.fn();
    const initialProvider: ProviderOptions = {
      id: 'file:///path/to/your/script.go',
      label: 'My Go Provider',
      config: {},
    };

    renderWithTooltipProvider(
      <ProviderTypeSelector
        provider={initialProvider}
        setProvider={mockSetProvider}
        providerType="go"
      />,
    );

    expect(screen.getByText('Go')).toBeVisible();
    expect(screen.getByText('Custom Go integration')).toBeVisible();

    // Provider list is always expanded - no Change button needed

    const httpProviderCard = screen.getByText('HTTP/HTTPS Endpoint').closest('[role="button"]');
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
          stateful: true,
        },
      },
      'http',
    );

    expect(screen.getByText('HTTP/HTTPS Endpoint')).toBeVisible();
    expect(screen.getByText('Connect to your REST API or HTTP endpoint')).toBeVisible();
  });

  // Skip: Component uses providerType prop for initial value only, not for controlled updates
  it.skip('should update the UI when the providerType prop changes after initial render', () => {
    const mockSetProvider = vi.fn();
    const initialProvider: ProviderOptions = {
      id: 'http',
      label: 'My Test Provider',
      config: {},
    };

    const { rerender } = renderWithTooltipProvider(
      <ProviderTypeSelector
        provider={initialProvider}
        setProvider={mockSetProvider}
        providerType="http"
      />,
    );

    expect(screen.getByText('HTTP/HTTPS Endpoint')).toBeVisible();
    expect(screen.getByText('Connect to your REST API or HTTP endpoint')).toBeVisible();

    rerender(
      <TooltipProvider>
        <ProviderTypeSelector
          provider={initialProvider}
          setProvider={mockSetProvider}
          providerType="python"
        />
      </TooltipProvider>,
    );

    expect(screen.getByText('Python')).toBeVisible();
    expect(screen.getByText('Custom Python script or integration')).toBeVisible();
  });

  it('should handle the case where providerType is set to a value that does not exist in allProviderOptions array without crashing, and default to http', () => {
    const mockSetProvider = vi.fn();
    const initialProvider: ProviderOptions = {
      id: '',
      config: {},
    };

    renderWithTooltipProvider(
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

    renderWithTooltipProvider(
      <ProviderTypeSelector
        provider={initialProvider}
        setProvider={mockSetProvider}
        providerType="http"
      />,
    );

    expect(screen.getByText('HTTP/HTTPS Endpoint')).toBeVisible();
    expect(screen.getByText('Connect to your REST API or HTTP endpoint')).toBeVisible();

    // Provider list is always expanded - no Change button needed

    const langchainProviderCard = screen.getByText('LangChain').closest('[role="button"]');
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
    expect(screen.getByText('Popular framework for LLM applications')).toBeVisible();
  });

  it('should filter provider options to show only agentic frameworks when the Agent Frameworks category chip is selected', () => {
    const mockSetProvider = vi.fn();
    const initialProvider: ProviderOptions = {
      id: '',
      config: {},
    };

    renderWithTooltipProvider(
      <ProviderTypeSelector provider={initialProvider} setProvider={mockSetProvider} />,
    );

    const agentsChip = screen.getByText(/^Agent Frameworks \(/);
    fireEvent.click(agentsChip);

    expect(screen.getByText('LangChain')).toBeVisible();
    expect(screen.getByText('AutoGen')).toBeVisible();
    expect(screen.getByText('CrewAI')).toBeVisible();
    expect(screen.getByText('LlamaIndex')).toBeVisible();
    expect(screen.getByText('LangGraph')).toBeVisible();
    expect(screen.getByText('OpenAI Agents SDK')).toBeVisible();
    expect(screen.getByText('PydanticAI')).toBeVisible();
    expect(screen.getByText('Google ADK')).toBeVisible();
    expect(screen.getByText('Other Agent Framework')).toBeVisible();

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

    renderWithTooltipProvider(
      <ProviderTypeSelector provider={initialProvider} setProvider={mockSetProvider} />,
    );

    const agentsCategoryChip = screen.getByText(/^Agent Frameworks \(/);
    fireEvent.click(agentsCategoryChip);

    expect(mockRecordEvent).toHaveBeenCalledWith('feature_used', {
      feature: 'redteam_provider_tag_filtered',
      tag: 'agents',
    });

    const langchainProviderCard = screen.getByText('LangChain').closest('[role="button"]');
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

  // Test removed - collapsed view and Change button no longer exist

  it('should update selectedProviderType and call setProvider with the correct file path format when an agent provider is selected', () => {
    const mockSetProvider = vi.fn();
    const initialProvider: ProviderOptions = {
      id: 'http',
      label: 'My Test Provider',
      config: {},
    };

    renderWithTooltipProvider(
      <ProviderTypeSelector
        provider={initialProvider}
        setProvider={mockSetProvider}
        providerType="http"
      />,
    );

    expect(screen.getByText('HTTP/HTTPS Endpoint')).toBeVisible();
    expect(screen.getByText('Connect to your REST API or HTTP endpoint')).toBeVisible();

    // Provider list is always expanded - no Change button needed

    const langchainProviderCard = screen.getByText('LangChain').closest('[role="button"]');
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
    expect(screen.getByText('Popular framework for LLM applications')).toBeVisible();
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

    renderWithTooltipProvider(
      <ProviderTypeSelector
        provider={initialProvider}
        setProvider={mockSetProvider}
        providerType="http"
      />,
    );

    expect(screen.getByText('HTTP/HTTPS Endpoint')).toBeVisible();
    expect(screen.getByText('Connect to your REST API or HTTP endpoint')).toBeVisible();

    // Provider list is always expanded - no Change button needed

    const langchainProviderCard = screen.getByText('LangChain').closest('[role="button"]');
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
    expect(screen.getByText('Popular framework for LLM applications')).toBeVisible();
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

    renderWithTooltipProvider(
      <ProviderTypeSelector provider={initialProvider} setProvider={mockSetProvider} />,
    );

    const agentsChip = screen.getByText(/^Agent Frameworks \(/);
    fireEvent.click(agentsChip);

    expect(screen.getByText('LangChain')).toBeVisible();
    expect(screen.getByText('AutoGen')).toBeVisible();
    expect(screen.getByText('CrewAI')).toBeVisible();
    expect(screen.getByText('LlamaIndex')).toBeVisible();
    expect(screen.getByText('LangGraph')).toBeVisible();
    expect(screen.getByText('OpenAI Agents SDK')).toBeVisible();
    expect(screen.getByText('PydanticAI')).toBeVisible();
    expect(screen.getByText('Google ADK')).toBeVisible();
    expect(screen.getByText('Other Agent Framework')).toBeVisible();

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

    renderWithTooltipProvider(
      <ProviderTypeSelector provider={initialProvider} setProvider={mockSetProvider} />,
    );

    const pythonProviderCard = screen.getByText('Python').closest('[role="button"]');
    if (pythonProviderCard) {
      fireEvent.click(pythonProviderCard);
    }

    expect(mockRecordEvent).toHaveBeenCalledWith('feature_used', {
      feature: 'redteam_provider_type_selected',
      provider_type: 'python',
      provider_label: 'Python',
      provider_tag: 'app',
    });
  });

  it('should reset the tag filter and display all provider options when the "All Tags" chip is clicked', () => {
    const mockSetProvider = vi.fn();
    const initialProvider: ProviderOptions = {
      id: '',
      config: {},
    };

    renderWithTooltipProvider(
      <ProviderTypeSelector provider={initialProvider} setProvider={mockSetProvider} />,
    );

    const agentsChip = screen.getByText(/^Agent Frameworks \(/);
    fireEvent.click(agentsChip);

    expect(screen.queryByText('HTTP/HTTPS Endpoint')).toBeNull();

    const allTagsChip = screen.getByText(/^All \(/);
    fireEvent.click(allTagsChip);

    expect(screen.getByText('HTTP/HTTPS Endpoint')).toBeVisible();
  });

  it('should clear the selectedTag and show all provider options when All filter is clicked', () => {
    const mockSetProvider = vi.fn();
    const initialProvider: ProviderOptions = {
      id: 'http',
      label: 'My Test Provider',
      config: {},
    };

    renderWithTooltipProvider(
      <ProviderTypeSelector
        provider={initialProvider}
        setProvider={mockSetProvider}
        providerType="http"
      />,
    );

    // Provider list is always expanded
    expect(screen.getByText('HTTP/HTTPS Endpoint')).toBeVisible();

    const agentsChip = screen.getByText(/^Agent Frameworks \(/);
    fireEvent.click(agentsChip);

    expect(screen.queryByText('HTTP/HTTPS Endpoint')).toBeNull();

    const allTagsButton = screen.getByText(/^All \(/);
    fireEvent.click(allTagsButton);

    expect(screen.getByText('HTTP/HTTPS Endpoint')).toBeVisible();
  });

  it('should filter provider options correctly when availableProviderIds, search term, and tag are all provided', () => {
    const mockSetProvider = vi.fn();
    const initialProvider: ProviderOptions = {
      id: '',
      config: {},
    };

    const availableProviderIds = ['langchain', 'autogen', 'http'];

    renderWithTooltipProvider(
      <ProviderTypeSelector
        provider={initialProvider}
        setProvider={mockSetProvider}
        availableProviderIds={availableProviderIds}
      />,
    );

    const searchInput = screen.getByPlaceholderText('Search providers...');
    fireEvent.change(searchInput, { target: { value: 'lang' } });

    const agentsChip = screen.getByText(/^Agent Frameworks \(/);
    fireEvent.click(agentsChip);

    expect(screen.getByText('LangChain')).toBeVisible();
    expect(screen.queryByText('AutoGen')).toBeNull();
    expect(screen.queryByText('HTTP/HTTPS Endpoint')).toBeNull();
  });

  describe('handleProviderTypeChange - default configuration values', () => {
    it('should set stateful: true in HTTP provider config by default', () => {
      const mockSetProvider = vi.fn();
      const initialProvider: ProviderOptions = {
        id: 'python',
        label: 'My Provider',
        config: {},
      };

      renderWithTooltipProvider(
        <ProviderTypeSelector
          provider={initialProvider}
          setProvider={mockSetProvider}
          providerType="python"
        />,
      );

      const httpProviderCard = screen.getByText('HTTP/HTTPS Endpoint').closest('[role="button"]');
      if (httpProviderCard) {
        fireEvent.click(httpProviderCard);
      }

      expect(mockSetProvider).toHaveBeenCalledWith(
        {
          id: 'http',
          label: 'My Provider',
          config: {
            url: '',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: '{{prompt}}',
            }),
            stateful: true,
          },
        },
        'http',
      );
    });

    it('should set comprehensive default values for WebSocket provider including type, url, messageTemplate, transformResponse, timeoutMs, and stateful', () => {
      const mockSetProvider = vi.fn();
      const initialProvider: ProviderOptions = {
        id: 'http',
        label: 'My WebSocket Provider',
        config: {},
      };

      renderWithTooltipProvider(
        <ProviderTypeSelector
          provider={initialProvider}
          setProvider={mockSetProvider}
          providerType="http"
        />,
      );

      const websocketProviderCard = screen.getByText('WebSocket').closest('[role="button"]');
      if (websocketProviderCard) {
        fireEvent.click(websocketProviderCard);
      }

      expect(mockSetProvider).toHaveBeenCalledWith(
        {
          id: 'websocket',
          label: 'My WebSocket Provider',
          config: {
            type: 'websocket',
            url: 'wss://example.com/ws',
            messageTemplate: '{"message": {{prompt | dump}}}',
            transformResponse: 'data.message',
            timeoutMs: 300000,
            stateful: true,
          },
        },
        'websocket',
      );
    });

    it('should use DEFAULT_WEBSOCKET_TRANSFORM_RESPONSE constant for WebSocket transformResponse value', () => {
      const mockSetProvider = vi.fn();
      const initialProvider: ProviderOptions = {
        id: 'http',
        label: 'Test Label',
        config: {},
      };

      renderWithTooltipProvider(
        <ProviderTypeSelector
          provider={initialProvider}
          setProvider={mockSetProvider}
          providerType="http"
        />,
      );

      const websocketProviderCard = screen.getByText('WebSocket').closest('[role="button"]');
      if (websocketProviderCard) {
        fireEvent.click(websocketProviderCard);
      }

      const callArgs = mockSetProvider.mock.calls[0][0];
      expect(callArgs.config.transformResponse).toBe('data.message');
    });

    it('should use DEFAULT_WEBSOCKET_TIMEOUT_MS constant for WebSocket timeoutMs value', () => {
      const mockSetProvider = vi.fn();
      const initialProvider: ProviderOptions = {
        id: 'http',
        label: 'Test Label',
        config: {},
      };

      renderWithTooltipProvider(
        <ProviderTypeSelector
          provider={initialProvider}
          setProvider={mockSetProvider}
          providerType="http"
        />,
      );

      const websocketProviderCard = screen.getByText('WebSocket').closest('[role="button"]');
      if (websocketProviderCard) {
        fireEvent.click(websocketProviderCard);
      }

      const callArgs = mockSetProvider.mock.calls[0][0];
      expect(callArgs.config.timeoutMs).toBe(300000);
    });

    it('should set default navigate step for Browser provider with example.com URL', () => {
      const mockSetProvider = vi.fn();
      const initialProvider: ProviderOptions = {
        id: 'http',
        label: 'My Browser Provider',
        config: {},
      };

      renderWithTooltipProvider(
        <ProviderTypeSelector
          provider={initialProvider}
          setProvider={mockSetProvider}
          providerType="http"
        />,
      );

      const browserProviderCard = screen.getByText('Browser Automation').closest('[role="button"]');
      if (browserProviderCard) {
        fireEvent.click(browserProviderCard);
      }

      expect(mockSetProvider).toHaveBeenCalledWith(
        {
          id: 'browser',
          label: 'My Browser Provider',
          config: {
            steps: [
              {
                action: 'navigate',
                args: { url: 'https://example.com' },
              },
            ],
          },
        },
        'browser',
      );
    });

    it('should set enabled: true and verbose: false for MCP provider by default', () => {
      const mockSetProvider = vi.fn();
      const initialProvider: ProviderOptions = {
        id: 'http',
        label: 'My MCP Provider',
        config: {},
      };

      renderWithTooltipProvider(
        <ProviderTypeSelector
          provider={initialProvider}
          setProvider={mockSetProvider}
          providerType="http"
        />,
      );

      const mcpProviderCard = screen.getByText('MCP Server').closest('[role="button"]');
      if (mcpProviderCard) {
        fireEvent.click(mcpProviderCard);
      }

      expect(mockSetProvider).toHaveBeenCalledWith(
        {
          id: 'mcp',
          label: 'My MCP Provider',
          config: {
            enabled: true,
            verbose: false,
          },
        },
        'mcp',
      );
    });

    it('should preserve provider label when switching to WebSocket provider with new defaults', () => {
      const mockSetProvider = vi.fn();
      const initialProvider: ProviderOptions = {
        id: 'openai:gpt-4',
        label: 'Custom Label Name',
        config: {},
      };

      renderWithTooltipProvider(
        <ProviderTypeSelector
          provider={initialProvider}
          setProvider={mockSetProvider}
          providerType="openai"
        />,
      );

      const websocketProviderCard = screen.getByText('WebSocket').closest('[role="button"]');
      if (websocketProviderCard) {
        fireEvent.click(websocketProviderCard);
      }

      const callArgs = mockSetProvider.mock.calls[0][0];
      expect(callArgs.label).toBe('Custom Label Name');
      expect(callArgs.config.type).toBe('websocket');
      expect(callArgs.config.stateful).toBe(true);
    });

    it('should preserve provider label when switching to Browser provider with new defaults', () => {
      const mockSetProvider = vi.fn();
      const initialProvider: ProviderOptions = {
        id: 'anthropic:claude',
        label: 'My Anthropic Setup',
        config: {},
      };

      renderWithTooltipProvider(
        <ProviderTypeSelector
          provider={initialProvider}
          setProvider={mockSetProvider}
          providerType="anthropic"
        />,
      );

      const browserProviderCard = screen.getByText('Browser Automation').closest('[role="button"]');
      if (browserProviderCard) {
        fireEvent.click(browserProviderCard);
      }

      const callArgs = mockSetProvider.mock.calls[0][0];
      expect(callArgs.label).toBe('My Anthropic Setup');
      expect(callArgs.config.steps).toEqual([
        {
          action: 'navigate',
          args: { url: 'https://example.com' },
        },
      ]);
    });

    it('should preserve provider label when switching to MCP provider with new defaults', () => {
      const mockSetProvider = vi.fn();
      const initialProvider: ProviderOptions = {
        id: 'python',
        label: 'Python Integration',
        config: {},
      };

      renderWithTooltipProvider(
        <ProviderTypeSelector
          provider={initialProvider}
          setProvider={mockSetProvider}
          providerType="python"
        />,
      );

      const mcpProviderCard = screen.getByText('MCP Server').closest('[role="button"]');
      if (mcpProviderCard) {
        fireEvent.click(mcpProviderCard);
      }

      const callArgs = mockSetProvider.mock.calls[0][0];
      expect(callArgs.label).toBe('Python Integration');
      expect(callArgs.config.enabled).toBe(true);
      expect(callArgs.config.verbose).toBe(false);
    });
  });
});
