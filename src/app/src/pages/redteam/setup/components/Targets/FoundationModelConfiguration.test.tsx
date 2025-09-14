import React from 'react';

import { createTheme, ThemeProvider } from '@mui/material/styles';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FoundationModelConfiguration from './FoundationModelConfiguration';

import type { ProviderOptions } from '../../types';

const renderWithTheme = (ui: React.ReactElement) => {
  const theme = createTheme({ palette: { mode: 'light' } });
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);
};

describe('FoundationModelConfiguration', () => {
  let mockUpdateCustomTarget: ReturnType<typeof vi.fn>;

  const initialTarget: ProviderOptions = {
    id: 'openai:gpt-4o',
    config: {
      temperature: 0.7,
      max_tokens: 1024,
      top_p: 0.9,
      apiKey: 'test-key-123',
    },
  };

  beforeEach(() => {
    mockUpdateCustomTarget = vi.fn();
  });

  it('should display advanced configuration fields with values from selectedTarget.config and call updateCustomTarget with the correct field and value when changed', () => {
    renderWithTheme(
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

    expect(temperatureInput).toHaveValue(0.7);
    expect(maxTokensInput).toHaveValue(1024);
    expect(topPInput).toHaveValue(0.9);
    expect(apiKeyInput).toHaveValue('test-key-123');

    fireEvent.change(temperatureInput, { target: { value: '0.8' } });
    expect(mockUpdateCustomTarget).toHaveBeenCalledWith('temperature', 0.8);

    fireEvent.change(maxTokensInput, { target: { value: '2048' } });
    expect(mockUpdateCustomTarget).toHaveBeenCalledWith('max_tokens', 2048);

    fireEvent.change(topPInput, { target: { value: '0.95' } });
    expect(mockUpdateCustomTarget).toHaveBeenCalledWith('top_p', 0.95);

    fireEvent.change(apiKeyInput, { target: { value: 'new-api-key' } });
    expect(mockUpdateCustomTarget).toHaveBeenCalledWith('apiKey', 'new-api-key');
  });

  it('should display the initial Model ID from selectedTarget.id when rendered', () => {
    const initialTarget: ProviderOptions = {
      id: 'test-model-id',
      config: {},
    };

    renderWithTheme(
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
    renderWithTheme(
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
    renderWithTheme(
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
    renderWithTheme(
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

  it('should display the correct Model ID placeholder for the azure provider', () => {
    renderWithTheme(
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
    const { rerender } = renderWithTheme(
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

    expect(modelIdInput).toHaveValue('openai:gpt-4o');
  });

  it('should update the placeholder and documentation link when the providerType prop changes', () => {
    const { rerender } = renderWithTheme(
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
    renderWithTheme(
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
      id: 'google:gemini-1.5-pro',
      config: {},
    };

    renderWithTheme(
      <FoundationModelConfiguration
        selectedTarget={initialTarget}
        updateCustomTarget={mockUpdateCustomTarget}
        providerType="google"
      />,
    );

    const modelIdInput = screen.getByRole('textbox', { name: /Model ID/i });
    expect(modelIdInput).toHaveValue('google:gemini-1.5-pro');
  });

  it('should handle undefined selectedTarget.id without errors', () => {
    const emptyTarget: ProviderOptions = {
      id: '',
      config: {},
    };

    renderWithTheme(
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

    renderWithTheme(
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

    renderWithTheme(
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
