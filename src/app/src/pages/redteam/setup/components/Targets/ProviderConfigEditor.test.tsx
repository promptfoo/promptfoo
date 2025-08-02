import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { createTheme, ThemeProvider } from '@mui/material/styles';

import ProviderConfigEditor, { ProviderConfigEditorRef } from './ProviderConfigEditor';
import type { ProviderOptions } from '../../types';

vi.mock('./HttpEndpointConfiguration', () => ({
  default: () => <div data-testid="http-config" />,
}));
vi.mock('./WebSocketEndpointConfiguration', () => ({
  default: () => <div data-testid="ws-config" />,
}));
vi.mock('./CustomTargetConfiguration', () => ({
  default: () => <div data-testid="custom-config" />,
}));
vi.mock('./BrowserAutomationConfiguration', () => ({
  default: () => <div data-testid="browser-config" />,
}));
vi.mock('./FoundationModelConfiguration', () => ({
  default: () => <div data-testid="fm-config" />,
}));
vi.mock('./CommonConfigurationOptions', () => ({
  default: ({ onValidationChange }: { onValidationChange?: (hasErrors: boolean) => void }) => {
    React.useEffect(() => {
      if (onValidationChange) {
        onValidationChange(false);
      }
    }, [onValidationChange]);
    return <div data-testid="common-config" />;
  },
}));

const renderWithTheme = (ui: React.ReactElement) => {
  const theme = createTheme({ palette: { mode: 'light' } });
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);
};

describe('ProviderConfigEditor', () => {
  describe('validate method', () => {
    it('should return true from validate() for a valid http provider', () => {
      const editorRef = React.createRef<ProviderConfigEditorRef>();
      const mockSetProvider = vi.fn();
      const mockSetError = vi.fn();
      const mockOnValidate = vi.fn();

      const validHttpProvider: ProviderOptions = {
        id: 'http',
        config: {
          url: 'https://api.example.com/chat',
          body: {
            messages: [{ role: 'user', content: '{{prompt}}' }],
          },
        },
      };

      renderWithTheme(
        <ProviderConfigEditor
          ref={editorRef}
          provider={validHttpProvider}
          setProvider={mockSetProvider}
          setError={mockSetError}
          onValidate={mockOnValidate}
          providerType="http"
        />,
      );

      const isValid = editorRef.current?.validate();

      expect(isValid).toBe(true);
      expect(mockSetError).toHaveBeenCalledWith(null);
      expect(mockOnValidate).toHaveBeenCalledWith(true);
    });

    it('should return false from validate() when provider ID contains only whitespace characters for foundation model providers', () => {
      const editorRef = React.createRef<ProviderConfigEditorRef>();
      const mockSetProvider = vi.fn();
      const mockSetError = vi.fn();
      const mockOnValidate = vi.fn();

      const whitespaceProvider: ProviderOptions = {
        id: '   ',
        config: {},
      };

      renderWithTheme(
        <ProviderConfigEditor
          ref={editorRef}
          provider={whitespaceProvider}
          setProvider={mockSetProvider}
          setError={mockSetError}
          onValidate={mockOnValidate}
          providerType="openai"
        />,
      );

      const isValid = editorRef.current?.validate();

      expect(isValid).toBe(false);
      expect(mockSetError).toHaveBeenCalledWith('Model ID is required');
      expect(mockOnValidate).toHaveBeenCalledWith(false);
    });
  });

  it('should render without crashing when provider is an empty object', () => {
    const mockSetProvider = vi.fn();
    const mockSetError = vi.fn();
    const mockOnValidate = vi.fn();

    const emptyProvider: ProviderOptions = {
      id: '',
      config: {},
    };

    const { container } = renderWithTheme(
      <ProviderConfigEditor
        provider={emptyProvider}
        setProvider={mockSetProvider}
        setError={mockSetError}
        onValidate={mockOnValidate}
        providerType="custom"
        validateAll={true}
      />,
    );

    expect(container).toBeInTheDocument();
    expect(mockSetError).toHaveBeenCalledWith('Provider ID is required');
    expect(mockOnValidate).toHaveBeenCalledWith(false);
  });

  it('should call setError and onValidate when validateAll is true and the provider config is invalid', () => {
    const mockSetProvider = vi.fn();
    const mockSetError = vi.fn();
    const mockOnValidate = vi.fn();

    const invalidHttpProvider: ProviderOptions = {
      id: 'http',
      config: {
        body: {
          messages: [{ role: 'user', content: '{{prompt}}' }],
        },
      },
    };

    renderWithTheme(
      <ProviderConfigEditor
        provider={invalidHttpProvider}
        setProvider={mockSetProvider}
        setError={mockSetError}
        onValidate={mockOnValidate}
        validateAll={true}
        providerType="http"
      />,
    );

    expect(mockSetError).toHaveBeenCalledTimes(1);
    expect(mockSetError).toHaveBeenCalledWith('Valid URL is required');
    expect(mockOnValidate).toHaveBeenCalledTimes(1);
    expect(mockOnValidate).toHaveBeenCalledWith(false);
  });
});
