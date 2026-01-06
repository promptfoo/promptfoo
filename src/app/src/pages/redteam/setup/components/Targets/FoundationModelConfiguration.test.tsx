import { act, fireEvent, render, screen } from '@testing-library/react';
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

  it('should display advanced configuration fields with values from selectedTarget.config and call updateCustomTarget with the correct field and value when changed', () => {
    render(
      <FoundationModelConfiguration
        selectedTarget={initialTarget}
        updateCustomTarget={mockUpdateCustomTarget}
        providerType="openai"
      />,
    );

    const accordionSummary = screen.getByRole('button', { name: /Advanced Configuration/ });
    fireEvent.click(accordionSummary);

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

    fireEvent.change(temperatureInput, { target: { value: '0.8' } });
    expect(mockUpdateCustomTarget).toHaveBeenCalledWith('temperature', 0.8);

    fireEvent.change(maxTokensInput, { target: { value: '2048' } });
    expect(mockUpdateCustomTarget).toHaveBeenCalledWith('max_tokens', 2048);

    fireEvent.change(topPInput, { target: { value: '0.95' } });
    expect(mockUpdateCustomTarget).toHaveBeenCalledWith('top_p', 0.95);

    fireEvent.change(apiKeyInput, { target: { value: 'new-api-key' } });
    expect(mockUpdateCustomTarget).toHaveBeenCalledWith('apiKey', 'new-api-key');

    fireEvent.change(apiBaseUrlInput, { target: { value: 'https://new.api.example.com/v2' } });
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

  it('should call updateCustomTarget with the correct arguments when the user types a new model ID', () => {
    render(
      <FoundationModelConfiguration
        selectedTarget={initialTarget}
        updateCustomTarget={mockUpdateCustomTarget}
        providerType="openai"
      />,
    );

    const modelIdInput = screen.getByRole('textbox', { name: /Model ID/i });
    fireEvent.change(modelIdInput, { target: { value: 'new-model-id' } });

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
      'openai:gpt-4o, openai:gpt-4o-mini, openai:o1-preview',
    );

    const documentationLink = screen.getByRole('link', { name: /OpenAI documentation/ });
    expect(documentationLink).toHaveAttribute(
      'href',
      'https://www.promptfoo.dev/docs/providers/openai',
    );
  });

  it('should call updateCustomTarget with undefined when Temperature field is cleared', () => {
    render(
      <FoundationModelConfiguration
        selectedTarget={initialTarget}
        updateCustomTarget={mockUpdateCustomTarget}
        providerType="openai"
      />,
    );

    const accordionSummary = screen.getByRole('button', { name: /Advanced Configuration/ });
    fireEvent.click(accordionSummary);

    const temperatureInput = screen.getByLabelText('Temperature');
    fireEvent.change(temperatureInput, { target: { value: '' } });
    expect(mockUpdateCustomTarget).toHaveBeenCalledWith('temperature', undefined);
  });

  it('should call updateCustomTarget with undefined when API Base URL field is cleared', () => {
    render(
      <FoundationModelConfiguration
        selectedTarget={initialTarget}
        updateCustomTarget={mockUpdateCustomTarget}
        providerType="openai"
      />,
    );

    const accordionSummary = screen.getByRole('button', { name: /Advanced Configuration/ });
    fireEvent.click(accordionSummary);

    const apiBaseUrlInput = screen.getByLabelText('API Base URL');
    expect(apiBaseUrlInput).toHaveValue('https://custom.api.example.com/v1');

    fireEvent.change(apiBaseUrlInput, { target: { value: '' } });
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
      'openai:gpt-4o, openai:gpt-4o-mini, openai:o1-preview',
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

  it('should call updateCustomTarget with the provided model ID, even if it does not match the expected format for the selected provider', () => {
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
    fireEvent.change(modelIdInput, { target: { value: 'openai:gpt-4' } });

    expect(mockUpdateCustomTarget).toHaveBeenCalledWith('id', 'openai:gpt-4');
  });
});
