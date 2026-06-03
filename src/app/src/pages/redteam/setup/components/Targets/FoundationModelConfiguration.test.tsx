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
    expect(apiKeyInput).toHaveAttribute('type', 'password');
    expect(apiKeyInput).toHaveAttribute('autocomplete', 'new-password');
    expect(apiKeyInput).toHaveAttribute('spellcheck', 'false');
    expect(apiKeyInput).toHaveAttribute('data-1p-ignore');
    expect(apiKeyInput).toHaveAttribute('data-lpignore', 'true');
    expect(apiKeyInput).toHaveAttribute('data-form-type', 'other');
    expect(apiKeyInput).toHaveAccessibleDescription(/included in this provider configuration/i);
    expect(apiBaseUrlInput).toHaveValue('https://custom.api.example.com/v1');
    expect(apiBaseUrlInput).toHaveAccessibleDescription(/For proxies, local models/i);
    expect(screen.getByText(/Prefer the OPENAI_API_KEY environment variable/i)).toBeInTheDocument();
    expect(screen.getByText(/not restored after a page reload/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show API Key' }));
    expect(apiKeyInput).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide API Key' })).toBeInTheDocument();

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

    const modelIdInput = screen.getByRole('textbox', { name: 'Model ID' });
    expect(modelIdInput).toHaveValue('test-model-id');
    expect(modelIdInput).toBeRequired();
    expect(modelIdInput).toHaveAccessibleDescription(/Specify the model to use/i);
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

  it('preserves zero values for sampling controls and max token validation', async () => {
    const user = userEvent.setup();
    render(
      <FoundationModelConfiguration
        selectedTarget={initialTarget}
        updateCustomTarget={mockUpdateCustomTarget}
        providerType="openai"
      />,
    );

    await user.click(screen.getByRole('button', { name: /Advanced Configuration/ }));

    await user.click(screen.getByLabelText('Temperature'));
    await user.keyboard('{Control>}a{/Control}');
    await user.paste('0');
    await user.click(screen.getByLabelText('Max Tokens'));
    await user.keyboard('{Control>}a{/Control}');
    await user.paste('0');
    await user.click(screen.getByLabelText('Top P'));
    await user.keyboard('{Control>}a{/Control}');
    await user.paste('0');

    expect(mockUpdateCustomTarget).toHaveBeenCalledWith('temperature', 0);
    expect(mockUpdateCustomTarget).toHaveBeenCalledWith('max_tokens', 0);
    expect(mockUpdateCustomTarget).toHaveBeenCalledWith('top_p', 0);
  });

  it('associates validation messages with fields and reveals invalid advanced settings', async () => {
    render(
      <FoundationModelConfiguration
        selectedTarget={initialTarget}
        updateCustomTarget={mockUpdateCustomTarget}
        providerType="openai"
        fieldErrors={{
          modelId: 'Model ID is required',
          temperature: 'Temperature must be between 0 and 2',
          maxTokens: 'Max tokens must be greater than 0',
        }}
      />,
    );

    const modelIdInput = screen.getByLabelText(/Model ID/i);
    expect(modelIdInput).toHaveAttribute('aria-invalid', 'true');
    expect(modelIdInput).toHaveAccessibleDescription(/Model ID is required.*Specify the model/i);

    const temperatureInput = await screen.findByLabelText('Temperature');
    expect(temperatureInput).toHaveAttribute('aria-invalid', 'true');
    expect(temperatureInput).toHaveAccessibleDescription(
      /Temperature must be between 0 and 2.*Controls randomness/i,
    );

    const maxTokensInput = screen.getByLabelText('Max Tokens');
    expect(maxTokensInput).toHaveAttribute('aria-invalid', 'true');
    expect(maxTokensInput).toHaveAccessibleDescription(
      /Max tokens must be greater than 0.*Maximum number of tokens/i,
    );
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

  it('masks a revealed API key again when the configured model changes', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <FoundationModelConfiguration
        selectedTarget={initialTarget}
        updateCustomTarget={mockUpdateCustomTarget}
        providerType="openai"
      />,
    );

    await user.click(screen.getByRole('button', { name: /Advanced Configuration/ }));
    await user.click(screen.getByRole('button', { name: 'Show API Key' }));
    expect(screen.getByLabelText('API Key')).toHaveAttribute('type', 'text');

    rerender(
      <FoundationModelConfiguration
        selectedTarget={{ ...initialTarget, id: 'openai:gpt-5.4' }}
        updateCustomTarget={mockUpdateCustomTarget}
        providerType="openai"
      />,
    );

    expect(screen.getByLabelText('API Key')).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: 'Show API Key' })).toBeInTheDocument();
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

    expect(screen.getByRole('combobox', { name: 'Bedrock API' })).toHaveValue('invoke');
    expect(screen.getByRole('combobox', { name: 'Bedrock API' })).toBeRequired();
    expect(screen.getByRole('combobox', { name: 'Bedrock API' })).toHaveAccessibleDescription(
      /Use Converse for Bedrock-native tool calling and MCP servers/i,
    );
    expect(screen.getByRole('textbox', { name: 'Model ID' })).toHaveValue(
      'anthropic.claude-3-5-sonnet-20241022-v2:0',
    );
    expect(screen.queryByText('MCP Servers')).not.toBeInTheDocument();
  });

  it('should associate disclosed Bedrock setting guidance with its fields', async () => {
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

    await user.click(screen.getByRole('button', { name: /Bedrock Settings/i }));

    expect(screen.getByLabelText('AWS Region')).toHaveAccessibleDescription(
      /Defaults to us-east-1/i,
    );
    expect(screen.getByLabelText('AWS Profile')).toHaveAccessibleDescription(
      /Falls back to the default credential chain/i,
    );
    expect(screen.getByLabelText('Inference Model Type')).toHaveAccessibleDescription(
      /Required when the model ID is an Application Inference Profile ARN/i,
    );
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
    expect(commandInput).toHaveAccessibleDescription(
      'Not active. Enter a command, path, or URL to enable this server.',
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'Not active. Enter a command, path, or URL to enable this server.',
    );
    expect(screen.getByRole('button', { name: 'Remove MCP server 1' })).toBeInTheDocument();
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
    expect(screen.getByRole('status')).toHaveTextContent(
      'Active. This server will be available during Bedrock Converse evaluations.',
    );
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
