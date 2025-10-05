import React from 'react';

import { createTheme, ThemeProvider } from '@mui/material/styles';
import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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
vi.mock('./AgentFrameworkConfiguration', () => ({
  default: () => <div data-testid="agent-config" />,
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

    it("should return true from validate() for a valid 'go' custom provider with a non-empty provider ID when providerType is 'go'", () => {
      const editorRef = React.createRef<ProviderConfigEditorRef>();
      const mockSetProvider = vi.fn();
      const mockSetError = vi.fn();
      const mockOnValidate = vi.fn();

      const validGoProvider: ProviderOptions = {
        id: 'go-provider',
        config: {},
      };

      renderWithTheme(
        <ProviderConfigEditor
          ref={editorRef}
          provider={validGoProvider}
          setProvider={mockSetProvider}
          setError={mockSetError}
          onValidate={mockOnValidate}
          providerType="go"
        />,
      );

      const isValid = editorRef.current?.validate();

      expect(isValid).toBe(true);
      expect(mockSetError).toHaveBeenCalledWith(null);
      expect(mockOnValidate).toHaveBeenCalledWith(true);
    });

    it("should return true from validate() for a valid agent framework provider (e.g., providerType is 'langchain', provider.id is 'file://path/to/agent.py')", () => {
      const editorRef = React.createRef<ProviderConfigEditorRef>();
      const mockSetProvider = vi.fn();
      const mockSetError = vi.fn();
      const mockOnValidate = vi.fn();

      const validAgentProvider: ProviderOptions = {
        id: 'file://path/to/agent.py',
        config: {},
      };

      renderWithTheme(
        <ProviderConfigEditor
          ref={editorRef}
          provider={validAgentProvider}
          setProvider={mockSetProvider}
          setError={mockSetError}
          onValidate={mockOnValidate}
          providerType="langchain"
        />,
      );

      const isValid = editorRef.current?.validate();

      expect(isValid).toBe(true);
      expect(mockSetError).toHaveBeenCalledWith(null);
      expect(mockOnValidate).toHaveBeenCalledWith(true);
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

  it("should set error and render CustomTargetConfiguration when validateAll is true and a 'go' provider has an empty ID", () => {
    const mockSetProvider = vi.fn();
    const mockSetError = vi.fn();
    const mockOnValidate = vi.fn();

    const goProvider: ProviderOptions = {
      id: '',
      config: {},
    };

    const { getByTestId } = renderWithTheme(
      <ProviderConfigEditor
        provider={goProvider}
        setProvider={mockSetProvider}
        setError={mockSetError}
        onValidate={mockOnValidate}
        validateAll={true}
        providerType="go"
      />,
    );

    expect(mockSetError).toHaveBeenCalledTimes(1);
    expect(mockSetError).toHaveBeenCalledWith('Provider ID is required');
    expect(mockOnValidate).toHaveBeenCalledTimes(1);
    expect(mockOnValidate).toHaveBeenCalledWith(false);
    expect(getByTestId('custom-config')).toBeInTheDocument();
  });

  it('should update validation rules and rendered component when providerType changes', () => {
    const editorRef = React.createRef<ProviderConfigEditorRef>();
    const mockSetProvider = vi.fn();
    const mockSetError = vi.fn();
    const mockOnValidate = vi.fn();

    const validGoProvider: ProviderOptions = {
      id: 'go-provider',
      config: {},
    };

    const { rerender } = renderWithTheme(
      <ProviderConfigEditor
        ref={editorRef}
        provider={validGoProvider}
        setProvider={mockSetProvider}
        setError={mockSetError}
        onValidate={mockOnValidate}
        providerType="go"
      />,
    );

    rerender(
      <ProviderConfigEditor
        ref={editorRef}
        provider={validGoProvider}
        setProvider={mockSetProvider}
        setError={mockSetError}
        onValidate={mockOnValidate}
        providerType="custom"
      />,
    );

    const isValid = editorRef.current?.validate();

    expect(isValid).toBe(true);
    expect(mockSetError).toHaveBeenCalledWith(null);
    expect(mockOnValidate).toHaveBeenCalledWith(true);
  });

  it('should update the rendered configuration component when providerType prop changes', async () => {
    const mockSetProvider = vi.fn();
    const mockSetError = vi.fn();
    const mockOnValidate = vi.fn();

    const initialProvider: ProviderOptions = {
      id: 'initial',
      config: {},
    };

    const TestComponent = () => {
      const [providerType, setProviderType] = React.useState('custom');

      return (
        <>
          <ProviderConfigEditor
            provider={initialProvider}
            setProvider={mockSetProvider}
            setError={mockSetError}
            onValidate={mockOnValidate}
            providerType={providerType}
          />
          <button data-testid="change-provider-type" onClick={() => setProviderType('http')}>
            Change Provider Type
          </button>
        </>
      );
    };

    renderWithTheme(<TestComponent />);

    expect(screen.getByTestId('custom-config')).toBeInTheDocument();

    const changeProviderTypeButton = screen.getByTestId('change-provider-type');
    act(() => {
      changeProviderTypeButton.click();
    });

    await waitFor(() => {
      expect(screen.getByTestId('http-config')).toBeInTheDocument();
    });
  });

  it('should update validation rules and rendered component when switching from agent framework to non-agent provider type', async () => {
    const mockSetProvider = vi.fn();
    const mockSetError = vi.fn();
    const mockOnValidate = vi.fn();
    const editorRef = React.createRef<ProviderConfigEditorRef>();

    const initialProvider: ProviderOptions = {
      id: 'file://path/to/agent.py',
      config: {},
    };

    const TestComponent = () => {
      const [providerType, setProviderType] = React.useState('langchain');
      const [provider, setProvider] = React.useState(initialProvider);

      return (
        <>
          <ProviderConfigEditor
            ref={editorRef}
            provider={provider}
            setProvider={setProvider}
            setError={mockSetError}
            onValidate={mockOnValidate}
            providerType={providerType}
          />
          <button data-testid="change-provider-type" onClick={() => setProviderType('http')}>
            Change to HTTP Provider
          </button>
        </>
      );
    };

    renderWithTheme(<TestComponent />);

    expect(screen.getByTestId('agent-config')).toBeInTheDocument();

    const changeProviderTypeButton = screen.getByTestId('change-provider-type');
    act(() => {
      changeProviderTypeButton.click();
    });

    await waitFor(() => {
      expect(screen.getByTestId('http-config')).toBeInTheDocument();
    });

    const updatedProvider: ProviderOptions = {
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
        provider={updatedProvider}
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

  it('should render without crashing and apply default validation rules when providerType is undefined', () => {
    const mockSetProvider = vi.fn();
    const mockSetError = vi.fn();
    const mockOnValidate = vi.fn();
    const editorRef = React.createRef<ProviderConfigEditorRef>();

    const emptyProvider: ProviderOptions = {
      id: '',
      config: {},
    };

    const { getByTestId } = renderWithTheme(
      <ProviderConfigEditor
        ref={editorRef}
        provider={emptyProvider}
        setProvider={mockSetProvider}
        setError={mockSetError}
        onValidate={mockOnValidate}
        validateAll={true}
      />,
    );

    expect(getByTestId('common-config')).toBeInTheDocument();

    const isValid = editorRef.current?.validate();
    expect(isValid).toBe(true);
    expect(mockSetError).toHaveBeenCalledWith(null);
    expect(mockOnValidate).toHaveBeenCalledWith(true);
  });
});
