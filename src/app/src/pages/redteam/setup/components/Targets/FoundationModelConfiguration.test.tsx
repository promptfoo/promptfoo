import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FoundationModelConfiguration from './FoundationModelConfiguration';

import type { ProviderOptions } from '../../types';

describe('FoundationModelConfiguration', () => {
  let mockUpdateCustomTarget: (field: string, value: unknown) => void;

  const initialTarget: ProviderOptions = {
    id: 'openai:gpt-4o',
    config: {
      temperature: 0.7,
      max_tokens: 1024,
      top_p: 0.9,
      apiKey: 'test-key-123',
      apiBaseUrl: 'https://custom.api.example.com/v1',
    },
  };

  beforeEach(() => {
    mockUpdateCustomTarget = vi.fn();
  });

  it('should display advanced configuration fields with values from selectedTarget.config and call updateCustomTarget with the correct field and value when changed', async () => {
    const user = userEvent.setup();
    render(
      <FoundationModelConfiguration
        selectedTarget={initialTarget}
        updateCustomTarget={mockUpdateCustomTarget}
        providerType="openai"
      />,
    );

    const accordionSummary = screen.getByRole('button', { name: /Advanced Configuration/ });
    await user.click(accordionSummary);

    const temperatureInput = screen.getByLabelText('Temperature');
    const maxTokensInput = screen.getByLabelText('Max Tokens');
    const topPInput = screen.getByLabelText('Top P');
    const apiKeyInput = screen.getByLabelText('API Key');
    const apiBaseUrlInput = screen.getByLabelText('API Base URL');

    expect(temperatureInput).toHaveValue(0.7);
    expect(maxTokensInput).toHaveValue(1024);
    expect(topPInput).toHaveValue(0.9);
    expect(apiKeyInput).toHaveValue('test-key-123');
    expect(apiBaseUrlInput).toHaveValue('https://custom.api.example.com/v1');

    await user.click(temperatureInput);
    await user.keyboard('{Control>}a{/Control}');
    await user.paste('0.8');
    expect(mockUpdateCustomTarget).toHaveBeenCalledWith('temperature', 0.8);

    await user.click(maxTokensInput);
    await user.keyboard('{Control>}a{/Control}');
    await user.paste('2048');
    expect(mockUpdateCustomTarget).toHaveBeenCalledWith('max_tokens', 2048);

    await user.click(topPInput);
    await user.keyboard('{Control>}a{/Control}');
    await user.paste('0.95');
    expect(mockUpdateCustomTarget).toHaveBeenCalledWith('top_p', 0.95);

    await user.click(apiKeyInput);
    await user.keyboard('{Control>}a{/Control}');
    await user.paste('new-api-key');
    expect(mockUpdateCustomTarget).toHaveBeenCalledWith('apiKey', 'new-api-key');

    await user.click(apiBaseUrlInput);
    await user.keyboard('{Control>}a{/Control}');
    await user.paste('https://new.api.example.com/v2');
    expect(mockUpdateCustomTarget).toHaveBeenCalledWith(
      'apiBaseUrl',
      'https://new.api.example.com/v2',
    );
  });

  it('should display the initial Model ID from selectedTarget.id when rendered', () => {
    const initialTarget: ProviderOptions = {
      id: 'test-model-id',
      config: {},
    };

    render(
      <FoundationModelConfiguration
        selectedTarget={initialTarget}
        updateCustomTarget={mockUpdateCustomTarget}
        providerType="openai"
      />,
    );

    const modelIdInput = screen.getByRole('textbox', { name: /Model ID/i });
    expect(modelIdInput).toHaveValue('test-model-id');
  });

  it('should call updateCustomTarget with the correct arguments when the user types a new model ID', async () => {
    const user = userEvent.setup();
    render(
      <FoundationModelConfiguration
        selectedTarget={initialTarget}
        updateCustomTarget={mockUpdateCustomTarget}
        providerType="openai"
      />,
    );

    const modelIdInput = screen.getByRole('textbox', { name: /Model ID/i });
    await user.click(modelIdInput);
    await user.keyboard('{Control>}a{/Control}');
    await user.paste('new-model-id');

    expect(mockUpdateCustomTarget).toHaveBeenCalledWith('id', 'new-model-id');
  });

  it('should display the correct placeholder and documentation link for the Model ID input based on the providerType prop', () => {
    const providerType = 'openai';
    render(
      <FoundationModelConfiguration
        selectedTarget={initialTarget}
        updateCustomTarget={mockUpdateCustomTarget}
        providerType={providerType}
      />,
    );

    const modelIdInput = screen.getByRole('textbox', { name: /Model ID/i });
    expect(modelIdInput).toHaveAttribute(
      'placeholder',
      'openai:gpt-5.5, openai:gpt-5.5-pro, openai:gpt-5.4',
    );

    const documentationLink = screen.getByRole('link', { name: /OpenAI documentation/ });
    expect(documentationLink).toHaveAttribute(
      'href',
      'https://www.promptfoo.dev/docs/providers/openai',
    );
  });

  it('should call updateCustomTarget with undefined when Temperature field is cleared', async () => {
    const user = userEvent.setup();
    render(
      <FoundationModelConfiguration
        selectedTarget={initialTarget}
        updateCustomTarget={mockUpdateCustomTarget}
        providerType="openai"
      />,
    );

    const accordionSummary = screen.getByRole('button', { name: /Advanced Configuration/ });
    await user.click(accordionSummary);

    const temperatureInput = screen.getByLabelText('Temperature');
    await user.clear(temperatureInput);
    expect(mockUpdateCustomTarget).toHaveBeenCalledWith('temperature', undefined);
  });

  it('should call updateCustomTarget with undefined when API Base URL field is cleared', async () => {
    const user = userEvent.setup();
    render(
      <FoundationModelConfiguration
        selectedTarget={initialTarget}
        updateCustomTarget={mockUpdateCustomTarget}
        providerType="openai"
      />,
    );

    const accordionSummary = screen.getByRole('button', { name: /Advanced Configuration/ });
    await user.click(accordionSummary);

    const apiBaseUrlInput = screen.getByLabelText('API Base URL');
    expect(apiBaseUrlInput).toHaveValue('https://custom.api.example.com/v1');

    await user.clear(apiBaseUrlInput);
    expect(mockUpdateCustomTarget).toHaveBeenCalledWith('apiBaseUrl', undefined);
  });

  it('should display the correct Model ID placeholder for the azure provider', () => {
    render(
      <FoundationModelConfiguration
        selectedTarget={initialTarget}
        updateCustomTarget={mockUpdateCustomTarget}
        providerType="azure"
      />,
    );

    const modelIdInput = screen.getByPlaceholderText('azure:chat:your-deployment-name');
    expect(modelIdInput).toHaveAttribute('placeholder', 'azure:chat:your-deployment-name');
  });

  it('should display the correct placeholder and documentation link for the openrouter provider', () => {
    render(
      <FoundationModelConfiguration
        selectedTarget={initialTarget}
        updateCustomTarget={mockUpdateCustomTarget}
        providerType="openrouter"
      />,
    );

    const modelIdInput = screen.getByRole('textbox', { name: /Model ID/i });
    expect(modelIdInput).toHaveAttribute(
      'placeholder',
      'openrouter:openai/gpt-5.4, openrouter:anthropic/claude-opus-4.7',
    );

    const documentationLink = screen.getByRole('link', { name: /OpenRouter documentation/ });
    expect(documentationLink).toHaveAttribute(
      'href',
      'https://www.promptfoo.dev/docs/providers/openrouter',
    );
  });

  it('should update the Model ID input value when selectedTarget.id prop changes', () => {
    const { rerender } = render(
      <FoundationModelConfiguration
        selectedTarget={initialTarget}
        updateCustomTarget={mockUpdateCustomTarget}
        providerType="openai"
      />,
    );

    const modelIdInput = screen.getByRole('textbox', { name: /Model ID/i });
    expect(modelIdInput).toHaveValue('openai:gpt-4o');

    const updatedTarget: ProviderOptions = {
      ...initialTarget,
      id: 'openai:gpt-4o-turbo',
    };

    act(() => {
      rerender(
        <FoundationModelConfiguration
          selectedTarget={updatedTarget}
          updateCustomTarget={mockUpdateCustomTarget}
          providerType="openai"
        />,
      );
    });

    expect(modelIdInput).toHaveValue('openai:gpt-4o-turbo');
  });

  it('should update the placeholder and documentation link when the providerType prop changes', () => {
    const { rerender } = render(
      <FoundationModelConfiguration
        selectedTarget={initialTarget}
        updateCustomTarget={mockUpdateCustomTarget}
        providerType="openai"
      />,
    );

    let modelIdInput = screen.getByRole('textbox', { name: /Model ID/i });
    expect(modelIdInput).toHaveAttribute(
      'placeholder',
      'openai:gpt-5.5, openai:gpt-5.5-pro, openai:gpt-5.4',
    );
    let documentationLink = screen.getByRole('link', { name: /OpenAI documentation/ });
    expect(documentationLink).toHaveAttribute(
      'href',
      'https://www.promptfoo.dev/docs/providers/openai',
    );

    act(() => {
      rerender(
        <FoundationModelConfiguration
          selectedTarget={initialTarget}
          updateCustomTarget={mockUpdateCustomTarget}
          providerType="vertex"
        />,
      );
    });

    modelIdInput = screen.getByRole('textbox', { name: /Model ID/i });
    expect(modelIdInput).toHaveAttribute(
      'placeholder',
      'vertex:gemini-2.5-pro, vertex:gemini-2.5-flash',
    );
    documentationLink = screen.getByRole('link', { name: /Google Vertex AI documentation/ });
    expect(documentationLink).toHaveAttribute(
      'href',
      'https://www.promptfoo.dev/docs/providers/vertex',
    );
  });

  it('should prioritize Google AI Studio when both Google AI Studio and Vertex API keys are present', () => {
    render(
      <FoundationModelConfiguration
        selectedTarget={initialTarget}
        updateCustomTarget={mockUpdateCustomTarget}
        providerType="google"
      />,
    );

    const modelIdInput = screen.getByRole('textbox', { name: /Model ID/i });
    expect(modelIdInput).toHaveAttribute(
      'placeholder',
      'google:gemini-2.5-pro, google:gemini-2.5-flash',
    );

    const documentationLink = screen.getByRole('link', { name: /Google AI Studio documentation/ });
    expect(documentationLink).toHaveAttribute(
      'href',
      'https://www.promptfoo.dev/docs/providers/google',
    );
  });

  it('should handle transition from older model versions to newer ones', () => {
    const initialTarget: ProviderOptions = {
      id: 'google:gemini-2.5-pro',
      config: {},
    };

    render(
      <FoundationModelConfiguration
        selectedTarget={initialTarget}
        updateCustomTarget={mockUpdateCustomTarget}
        providerType="google"
      />,
    );

    const modelIdInput = screen.getByRole('textbox', { name: /Model ID/i });
    expect(modelIdInput).toHaveValue('google:gemini-2.5-pro');
  });

  it('should handle undefined selectedTarget.id without errors', () => {
    const emptyTarget: ProviderOptions = {
      id: '',
      config: {},
    };

    render(
      <FoundationModelConfiguration
        selectedTarget={emptyTarget}
        updateCustomTarget={mockUpdateCustomTarget}
        providerType="openai"
      />,
    );

    const modelIdInput = screen.getByRole('textbox', { name: /Model ID/i });
    expect(modelIdInput).toHaveValue('');
  });

  it('should handle empty string selectedTarget.id without errors', () => {
    const emptyStringTarget: ProviderOptions = {
      id: '',
      config: {},
    };

    render(
      <FoundationModelConfiguration
        selectedTarget={emptyStringTarget}
        updateCustomTarget={mockUpdateCustomTarget}
        providerType="openai"
      />,
    );

    const modelIdInput = screen.getByRole('textbox', { name: /Model ID/i });
    expect(modelIdInput).toHaveValue('');
  });

  it('should call updateCustomTarget with the provided model ID, even if it does not match the expected format for the selected provider', async () => {
    const user = userEvent.setup();
    const googleTarget: ProviderOptions = {
      id: 'google:gemini-2.5-pro',
      config: {},
    };

    render(
      <FoundationModelConfiguration
        selectedTarget={googleTarget}
        updateCustomTarget={mockUpdateCustomTarget}
        providerType="google"
      />,
    );

    const modelIdInput = screen.getByRole('textbox', { name: /Model ID/i });
    await user.click(modelIdInput);
    await user.keyboard('{Control>}a{/Control}');
    await user.paste('openai:gpt-4');

    expect(mockUpdateCustomTarget).toHaveBeenCalledWith('id', 'openai:gpt-4');
  });

  it('should show the Bedrock API selector and use legacy InvokeModel ids by default', () => {
    render(
      <FoundationModelConfiguration
        selectedTarget={{
          id: 'bedrock:anthropic.claude-3-5-sonnet-20241022-v2:0',
          config: {},
        }}
        updateCustomTarget={mockUpdateCustomTarget}
        providerType="bedrock"
      />,
    );

    expect(screen.getByLabelText(/Bedrock API/i)).toHaveValue('invoke');
    expect(screen.getByRole('textbox', { name: /Model ID/i })).toHaveValue(
      'anthropic.claude-3-5-sonnet-20241022-v2:0',
    );
    expect(screen.queryByText('MCP Servers')).not.toBeInTheDocument();
  });

  it('should switch Bedrock to Converse ids and show MCP configuration', async () => {
    const user = userEvent.setup();
    render(
      <FoundationModelConfiguration
        selectedTarget={{
          id: 'bedrock:anthropic.claude-3-5-sonnet-20241022-v2:0',
          config: {},
        }}
        updateCustomTarget={mockUpdateCustomTarget}
        providerType="bedrock"
      />,
    );

    await user.selectOptions(screen.getByLabelText(/Bedrock API/i), 'converse');

    expect(mockUpdateCustomTarget).toHaveBeenCalledWith(
      'id',
      'bedrock:converse:anthropic.claude-3-5-sonnet-20241022-v2:0',
    );
  });

  it('should render Bedrock Converse MCP configuration and save servers under config.mcp', async () => {
    const user = userEvent.setup();
    render(
      <FoundationModelConfiguration
        selectedTarget={{
          id: 'bedrock:converse:anthropic.claude-3-5-sonnet-20241022-v2:0',
          config: {},
        }}
        updateCustomTarget={mockUpdateCustomTarget}
        providerType="bedrock"
      />,
    );

    expect(screen.getByText('MCP Servers')).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', {
        name: /MCP Servers Configure Model Context Protocol servers/i,
      }),
    );
    await user.click(screen.getByRole('button', { name: /Add MCP Server/i }));

    // A freshly-added server has no command/path/url yet, so MCP must remain
    // disabled. Without this guard, MCPClient.initialize() throws "Either
    // command+args or path or url must be specified" the first time an eval
    // runs against the saved config.
    expect(mockUpdateCustomTarget).toHaveBeenCalledWith('config', {
      mcp: {
        enabled: false,
        servers: [{ name: 'server-1', args: [] }],
      },
    });
  });

  it('should enable MCP only after a server has a usable transport', async () => {
    const user = userEvent.setup();
    render(
      <FoundationModelConfiguration
        selectedTarget={{
          id: 'bedrock:converse:anthropic.claude-3-5-sonnet-20241022-v2:0',
          config: {
            mcp: {
              enabled: false,
              servers: [{ name: 'server-1', args: [] }],
            },
          },
        }}
        updateCustomTarget={mockUpdateCustomTarget}
        providerType="bedrock"
      />,
    );

    const commandInput = screen.getByLabelText(/Command/i);
    await user.click(commandInput);
    await user.paste('npx');

    const calls = vi.mocked(mockUpdateCustomTarget).mock.calls;
    const lastCall = calls[calls.length - 1];
    expect(lastCall[0]).toBe('config');
    expect(lastCall[1]).toMatchObject({
      mcp: {
        enabled: true,
        servers: [expect.objectContaining({ name: 'server-1', command: 'npx' })],
      },
    });
  });

  it('should disable MCP when the only server is cleared back to no transport', async () => {
    const user = userEvent.setup();
    render(
      <FoundationModelConfiguration
        selectedTarget={{
          id: 'bedrock:converse:anthropic.claude-3-5-sonnet-20241022-v2:0',
          config: {
            mcp: {
              enabled: true,
              servers: [{ name: 'server-1', command: 'npx', args: [] }],
            },
          },
        }}
        updateCustomTarget={mockUpdateCustomTarget}
        providerType="bedrock"
      />,
    );

    const commandInput = screen.getByLabelText(/Command/i);
    await user.clear(commandInput);

    const calls = vi.mocked(mockUpdateCustomTarget).mock.calls;
    const lastCall = calls[calls.length - 1];
    expect(lastCall[0]).toBe('config');
    expect(lastCall[1]).toMatchObject({
      mcp: {
        enabled: false,
        servers: [expect.objectContaining({ name: 'server-1' })],
      },
    });
  });

  it('should update Bedrock Converse model input while preserving the Converse id prefix', async () => {
    const user = userEvent.setup();
    render(
      <FoundationModelConfiguration
        selectedTarget={{
          id: 'bedrock:converse:anthropic.claude-3-5-sonnet-20241022-v2:0',
          config: {},
        }}
        updateCustomTarget={mockUpdateCustomTarget}
        providerType="bedrock"
      />,
    );

    const modelIdInput = screen.getByRole('textbox', { name: /Model ID/i });
    await user.clear(modelIdInput);
    await user.paste('amazon.nova-pro-v1:0');

    expect(mockUpdateCustomTarget).toHaveBeenLastCalledWith(
      'id',
      'bedrock:converse:amazon.nova-pro-v1:0',
    );
  });
});
