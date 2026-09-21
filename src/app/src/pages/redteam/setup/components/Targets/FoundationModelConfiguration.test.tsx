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
      'openai:gpt-5.6-luna, openai:gpt-5.6-terra, openai:gpt-5.6-sol, openai:gpt-6-astra',
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
      'openai:gpt-5.6-luna, openai:gpt-5.6-terra, openai:gpt-5.6-sol, openai:gpt-6-astra',
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
      'vertex:gemini-3.8-flash, vertex:gemini-3.5-flash-lite',
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
      'google:gemini-3.8-flash, google:gemini-3.5-flash-lite',
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

  it('should switch Bedrock to Responses ids without showing Converse-only MCP settings', async () => {
    const user = userEvent.setup();
    render(
      <FoundationModelConfiguration
        selectedTarget={{
          id: 'bedrock:openai.gpt-oss-120b-1:0',
          config: {},
        }}
        updateCustomTarget={mockUpdateCustomTarget}
        providerType="bedrock"
      />,
    );

    await user.selectOptions(screen.getByLabelText(/Bedrock API/i), 'responses');

    expect(mockUpdateCustomTarget).toHaveBeenCalledWith(
      'id',
      'bedrock:responses:openai.gpt-oss-120b',
    );
    expect(screen.queryByText('MCP Servers')).not.toBeInTheDocument();
  });

  it('allows choosing the API first and validates the model against that choice', async () => {
    const user = userEvent.setup();
    render(
      <FoundationModelConfiguration
        selectedTarget={{ id: 'bedrock:global.anthropic.claude-sonnet-5', config: {} }}
        updateCustomTarget={mockUpdateCustomTarget}
        providerType="bedrock"
      />,
    );
    expect(screen.getByRole('option', { name: 'Responses API (OpenAI Models)' })).toBeEnabled();
    expect(screen.getByRole('option', { name: 'Anthropic Messages' })).toBeEnabled();
    expect(screen.getByRole('option', { name: 'Converse' })).toBeEnabled();
    await user.selectOptions(screen.getByLabelText(/Bedrock API/i), 'responses');
    expect(screen.getByLabelText(/Bedrock API/i)).toHaveValue('responses');
    expect(screen.getByLabelText(/Model ID/i)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent(/Responses requires a bare OpenAI/);
    await user.selectOptions(screen.getByLabelText(/Bedrock API/i), 'messages');
    expect(
      screen.getByText(/not supported by the Bedrock Anthropic Messages adapter/),
    ).toBeVisible();
  });

  it('keeps all API choices available for native Grok profiles', () => {
    render(
      <FoundationModelConfiguration
        selectedTarget={{ id: 'bedrock:converse:us.xai.grok-4.6', config: {} }}
        updateCustomTarget={mockUpdateCustomTarget}
        providerType="bedrock"
      />,
    );
    expect(screen.getByRole('option', { name: 'InvokeModel' })).toBeEnabled();
    expect(screen.getByRole('option', { name: 'Converse' })).toBeEnabled();
    expect(screen.getByRole('option', { name: 'Responses API (OpenAI Models)' })).toBeEnabled();
    expect(screen.getByRole('option', { name: 'Chat Completions' })).toBeEnabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(mockUpdateCustomTarget).not.toHaveBeenCalled();
  });

  it.each([
    ['bedrock:responses:global.anthropic.claude-sonnet-5', 'responses'],
    ['bedrock:responses:openai.gpt-oss-120b-1:0', 'responses'],
    ['bedrock:messages:openai.gpt-oss-120b', 'messages'],
    ['bedrock:mantle:openai.gpt-5.5', 'chat'],
    ['bedrock:converse:anthropic.claude-mythos-5', 'converse'],
    ['bedrock:converse:us.anthropic.claude-mythos-5', 'converse'],
    ['bedrock:mantle:us.xai.grok-4.6', 'chat'],
    ['bedrock:converse:us.xai.grok-4.3', 'converse'],
  ])('reports an invalid existing target %s without rewriting it', (id, mode) => {
    render(
      <FoundationModelConfiguration
        selectedTarget={{ id, config: { max_tokens: 512, profile: 'work' } }}
        updateCustomTarget={mockUpdateCustomTarget}
        providerType="bedrock"
      />,
    );
    expect(screen.getByLabelText(/Bedrock API/i)).toHaveValue(mode);
    expect(screen.getByLabelText(/Model ID/i)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(mockUpdateCustomTarget).not.toHaveBeenCalled();
  });

  it.each([
    ['bedrock:amazon.nova-pro-v1:0', 'model-specific InvokeModel API on Bedrock Runtime'],
    ['bedrock:converse:amazon.nova-pro-v1:0', 'Bedrock Converse API on Bedrock Runtime'],
    ['bedrock:responses:openai.gpt-oss-120b', 'OpenAI-compatible Responses API'],
    ['bedrock:mantle:zai.glm-4.6', 'OpenAI-compatible Chat Completions API'],
    ['bedrock:messages:anthropic.claude-fable-5', 'Anthropic Messages API'],
  ])('explains the API format for %s', (id, explanation) => {
    render(
      <FoundationModelConfiguration
        selectedTarget={{ id, config: {} }}
        updateCustomTarget={mockUpdateCustomTarget}
        providerType="bedrock"
      />,
    );
    expect(screen.getByRole('option', { name: 'Chat Completions' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Bedrock API/i)).toHaveAccessibleDescription(
      expect.stringContaining(explanation),
    );
    if (id.includes(':responses:') || id.includes(':mantle:')) {
      expect(screen.getByText(/defaults to the Bedrock Mantle endpoint/)).toBeInTheDocument();
    }
    if (id.includes(':messages:')) {
      expect(screen.getByText(/Mantle or Runtime based on the model ID/)).toBeInTheDocument();
    }
  });

  it.each([
    'bedrock:responses:openai.gpt-oss-120b',
    'bedrock:mantle:custom.future-model',
    'bedrock:messages:us.anthropic.claude-fable-5-1',
  ])('acknowledges a custom endpoint for %s without inventing new model restrictions', (id) => {
    render(
      <FoundationModelConfiguration
        selectedTarget={{ id, config: { apiBaseUrl: 'https://proxy.example/v1' } }}
        updateCustomTarget={mockUpdateCustomTarget}
        providerType="bedrock"
      />,
    );
    expect(screen.getByText(/Uses your custom endpoint/)).toBeInTheDocument();
    expect(screen.queryByText(/defaults to the Bedrock Mantle endpoint/)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(mockUpdateCustomTarget).not.toHaveBeenCalled();
  });

  it('rehydrates the API and model when an external target replaces an edited target', async () => {
    const user = userEvent.setup();
    const props = { updateCustomTarget: mockUpdateCustomTarget, providerType: 'bedrock' };
    const { rerender } = render(
      <FoundationModelConfiguration
        {...props}
        selectedTarget={{ id: 'bedrock:amazon.nova-pro-v1:0', config: {} }}
      />,
    );
    await user.selectOptions(screen.getByLabelText(/Bedrock API/i), 'responses');
    rerender(
      <FoundationModelConfiguration
        {...props}
        selectedTarget={{ id: 'bedrock:messages:anthropic.claude-fable-5', config: {} }}
      />,
    );
    expect(screen.getByLabelText(/Bedrock API/i)).toHaveValue('messages');
    expect(screen.getByLabelText(/Model ID/i)).toHaveValue('anthropic.claude-fable-5');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each([
    ['gpt-5.6-sol', 'bedrock:responses:openai.gpt-5.6-sol'],
    ['gpt-oss-120b', 'bedrock:responses:openai.gpt-oss-120b'],
    ['openai.gpt-5.6-sol', 'bedrock:responses:openai.gpt-5.6-sol'],
    ['custom.model', 'bedrock:responses:custom.model'],
    ['us.openai.gpt-5.6-sol', 'bedrock:responses:us.openai.gpt-5.6-sol'],
    [
      'arn:aws:bedrock:us-east-1:123:application-inference-profile/example',
      'bedrock:responses:arn:aws:bedrock:us-east-1:123:application-inference-profile/example',
    ],
  ])('normalizes only recognized GPT shorthand %s', async (model, expectedId) => {
    const user = userEvent.setup();
    render(
      <FoundationModelConfiguration
        selectedTarget={{ id: 'bedrock:responses:openai.gpt-5.5', config: {} }}
        updateCustomTarget={mockUpdateCustomTarget}
        providerType="bedrock"
      />,
    );
    const input = screen.getByLabelText(/Model ID/i);
    await user.clear(input);
    await user.paste(model);
    expect(input).toHaveValue(model);
    expect(mockUpdateCustomTarget).toHaveBeenLastCalledWith('id', expectedId);
  });

  it('should preserve the Responses prefix and use Responses-specific settings', async () => {
    const user = userEvent.setup();
    render(
      <FoundationModelConfiguration
        selectedTarget={{
          id: 'bedrock:responses:openai.gpt-oss-120b',
          config: {},
        }}
        updateCustomTarget={mockUpdateCustomTarget}
        providerType="bedrock"
      />,
    );

    expect(screen.getByLabelText(/Bedrock API/i)).toHaveValue('responses');
    expect(screen.getByRole('textbox', { name: /Model ID/i })).toHaveValue('openai.gpt-oss-120b');
    expect(screen.queryByText('MCP Servers')).not.toBeInTheDocument();

    const modelIdInput = screen.getByRole('textbox', { name: /Model ID/i });
    await user.clear(modelIdInput);
    await user.paste('openai.gpt-oss-20b');
    expect(mockUpdateCustomTarget).toHaveBeenLastCalledWith(
      'id',
      'bedrock:responses:openai.gpt-oss-20b',
    );

    await user.click(
      screen.getByRole('button', {
        name: /Advanced Configuration Model parameters and API settings/i,
      }),
    );
    const maxOutputTokensInput = screen.getByLabelText(/Max Output Tokens/i);
    await user.click(maxOutputTokensInput);
    await user.paste('2048');
    expect(mockUpdateCustomTarget).toHaveBeenLastCalledWith('max_output_tokens', 2048);
    await user.click(screen.getByRole('button', { name: /Bedrock Settings/ }));
    expect(screen.getByText(/AWS_BEARER_TOKEN_BEDROCK/)).toBeInTheDocument();
  });

  it.each([
    [
      'bedrock:openai.gpt-oss-120b-1:0',
      'responses',
      'bedrock:responses:openai.gpt-oss-120b',
      'max_tokens',
      'max_output_tokens',
    ],
    [
      'bedrock:responses:openai.gpt-oss-20b',
      'invoke',
      'bedrock:openai.gpt-oss-20b-1:0',
      'max_output_tokens',
      'max_tokens',
    ],
    [
      'bedrock:responses:openai.gpt-oss-120b',
      'converse',
      'bedrock:converse:openai.gpt-oss-120b-1:0',
      'max_output_tokens',
      'max_tokens',
    ],
  ])(
    'preserves token limits when switching %s to %s',
    async (id, mode, expectedId, source, destination) => {
      const user = userEvent.setup();
      render(
        <FoundationModelConfiguration
          selectedTarget={{ id, config: { [source]: 4096, region: 'us-east-1' } }}
          updateCustomTarget={mockUpdateCustomTarget}
          providerType="bedrock"
        />,
      );
      await user.selectOptions(screen.getByLabelText(/Bedrock API/i), mode);
      expect(mockUpdateCustomTarget).toHaveBeenCalledWith('config', {
        [destination]: 4096,
        region: 'us-east-1',
      });
      expect(mockUpdateCustomTarget).toHaveBeenLastCalledWith('id', expectedId);
    },
  );

  it('allows editing an AWS profile for Responses authentication', async () => {
    const user = userEvent.setup();
    render(
      <FoundationModelConfiguration
        selectedTarget={{
          id: 'bedrock:responses:openai.gpt-oss-120b',
          config: { profile: 'old-profile' },
        }}
        updateCustomTarget={mockUpdateCustomTarget}
        providerType="bedrock"
      />,
    );
    const profile = screen.getByLabelText(/AWS Profile/i);
    expect(profile).toHaveValue('old-profile');
    await user.tripleClick(profile);
    await user.paste('bedrock-prod');
    expect(mockUpdateCustomTarget).toHaveBeenLastCalledWith('profile', 'bedrock-prod');
  });

  it.each([
    ['bedrock:openai.gpt-5.5', 'responses', 'openai.gpt-5.5'],
    ['bedrock:converse:openai.gpt-5.5', 'responses', 'openai.gpt-5.5'],
    ['bedrock:completion:xai.grok-4.3', 'responses', 'xai.grok-4.3'],
    ['bedrock:mantle:openai.gpt-oss-120b', 'chat', 'openai.gpt-oss-120b'],
    ['bedrock:messages:us.anthropic.claude-fable-5-1', 'messages', 'us.anthropic.claude-fable-5-1'],
    ['bedrock:anthropic.claude-mythos-5', 'messages', 'anthropic.claude-mythos-5'],
  ])(
    'displays the resolved API and settings for %s without rewriting it',
    async (id, mode, model) => {
      const user = userEvent.setup();
      render(
        <FoundationModelConfiguration
          selectedTarget={{
            id,
            config: {
              region: 'us-west-2',
              profile: 'work',
              max_output_tokens: 512,
              max_tokens: 1024,
            },
          }}
          updateCustomTarget={mockUpdateCustomTarget}
          providerType="bedrock"
        />,
      );
      expect(screen.getByLabelText(/Bedrock API/i)).toHaveValue(mode);
      expect(screen.getByLabelText(/Model ID/i)).toHaveValue(model);
      expect(screen.getByText(`Provider ID: ${id}.`, { exact: false })).toBeInTheDocument();
      expect(mockUpdateCustomTarget).not.toHaveBeenCalled();
      expect(screen.queryByText('MCP Servers')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Inference Model Type')).not.toBeInTheDocument();
      expect(screen.getByText(/Configure the AWS region and authentication/)).toBeInTheDocument();
      expect(screen.getByText(/model-specific default/)).toBeInTheDocument();
      expect(screen.getByText(/generate refreshable Bedrock tokens/)).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /Advanced Configuration/ }));
      const tokenField = screen.getByLabelText(
        mode === 'responses' ? 'Max Output Tokens' : 'Max Tokens',
      );
      expect(tokenField).toHaveValue(mode === 'responses' ? 512 : 1024);
      expect(screen.queryByLabelText('Bedrock Bearer Token')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Authentication')).toHaveValue('profile');
      expect(screen.getByLabelText('API Base URL')).toHaveAttribute(
        'placeholder',
        'Use the provider-selected Bedrock endpoint',
      );
      await user.click(tokenField);
      await user.keyboard('{Control>}a{/Control}');
      await user.paste('2048');
      expect(mockUpdateCustomTarget).toHaveBeenLastCalledWith(
        mode === 'responses' ? 'max_output_tokens' : 'max_tokens',
        2048,
      );
    },
  );

  it.each([
    [
      'bedrock:mantle:openai.gpt-oss-120b',
      'openai.gpt-oss-20b',
      'bedrock:mantle:openai.gpt-oss-20b',
    ],
    [
      'bedrock:messages:us.anthropic.claude-fable-5-1',
      'global.anthropic.claude-fable-5-1',
      'bedrock:messages:global.anthropic.claude-fable-5-1',
    ],
    [
      'bedrock:completion:amazon.nova-pro-v1:0',
      'amazon.nova-lite-v1:0',
      'bedrock:amazon.nova-lite-v1:0',
    ],
  ])('preserves the API when editing %s', async (id, model, expectedId) => {
    const user = userEvent.setup();
    render(
      <FoundationModelConfiguration
        selectedTarget={{ id, config: {} }}
        updateCustomTarget={mockUpdateCustomTarget}
        providerType="bedrock"
      />,
    );
    const input = screen.getByLabelText(/Model ID/i);
    await user.clear(input);
    await user.paste(model);
    expect(mockUpdateCustomTarget).toHaveBeenLastCalledWith('id', expectedId);
  });

  it.each(['bedrock:openai.gpt-5.5', 'bedrock:anthropic.claude-mythos-5'])(
    'allows selecting native APIs but reports incompatible model %s',
    async (id) => {
      const user = userEvent.setup();
      render(
        <FoundationModelConfiguration
          selectedTarget={{ id, config: {} }}
          updateCustomTarget={mockUpdateCustomTarget}
          providerType="bedrock"
        />,
      );
      expect(screen.getByRole('option', { name: 'InvokeModel' })).toBeEnabled();
      expect(screen.getByRole('option', { name: 'Converse' })).toBeEnabled();
      await user.selectOptions(screen.getByLabelText(/Bedrock API/i), 'converse');
      expect(screen.getByLabelText(/Bedrock API/i)).toHaveValue('converse');
      expect(screen.getByLabelText(/Model ID/i)).toHaveAttribute('aria-invalid', 'true');
    },
  );

  it('keeps native Bedrock settings separate from HTTP endpoint overrides', async () => {
    const user = userEvent.setup();
    render(
      <FoundationModelConfiguration
        selectedTarget={{
          id: 'bedrock:converse:amazon.nova-pro-v1:0',
          config: { region: 'eu-west-1' },
        }}
        updateCustomTarget={mockUpdateCustomTarget}
        providerType="bedrock"
      />,
    );
    expect(screen.getByLabelText('Inference Model Type')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Advanced Configuration/ }));
    expect(screen.queryByLabelText('API Base URL')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Bedrock Bearer Token')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Authentication')).toHaveValue('default');
  });

  it('does not relabel specialized Bedrock providers as InvokeModel', () => {
    render(
      <FoundationModelConfiguration
        selectedTarget={{ id: 'bedrock:kb:example', config: {} }}
        updateCustomTarget={mockUpdateCustomTarget}
        providerType="bedrock"
      />,
    );
    expect(screen.getByText(/specialized API/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Bedrock API/i)).not.toBeInTheDocument();
    expect(mockUpdateCustomTarget).not.toHaveBeenCalled();
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
