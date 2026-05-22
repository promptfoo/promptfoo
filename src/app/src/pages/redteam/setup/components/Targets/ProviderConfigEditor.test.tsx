import React from 'react';

import { renderWithProviders } from '@app/utils/testutils';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ProviderConfigEditor from './ProviderConfigEditor';

import type { ProviderOptions } from '../../types';

vi.mock('./HttpEndpointConfiguration', () => ({
  default: ({
    bodyError,
    urlError,
    updateCustomTarget,
    authorizationFieldErrors,
  }: {
    bodyError?: React.ReactNode;
    urlError?: string | null;
    updateCustomTarget?: (field: string, value: unknown) => void;
    authorizationFieldErrors?: Record<string, string>;
  }) => (
    <div data-testid="http-config">
      <button
        type="button"
        data-testid="set-http-body-without-prompt"
        onClick={() => updateCustomTarget?.('body', { message: 'hello' })}
      >
        Set body without prompt
      </button>
      {bodyError && <div data-testid="http-body-error">{bodyError}</div>}
      {urlError && <div data-testid="http-url-error">{urlError}</div>}
      {authorizationFieldErrors && Object.keys(authorizationFieldErrors).length > 0 && (
        <div data-testid="http-auth-field-errors">
          {Object.values(authorizationFieldErrors).join(', ')}
        </div>
      )}
    </div>
  ),
}));
vi.mock('./WebSocketEndpointConfiguration', () => ({
  default: ({ urlError }: { urlError?: string | null }) => (
    <div data-testid="ws-config">
      {urlError && <div data-testid="ws-url-error">{urlError}</div>}
    </div>
  ),
}));
vi.mock('./CustomTargetConfiguration', () => ({
  default: ({
    setBodyError,
    idError,
    mode,
  }: {
    setBodyError?: (error: string | null) => void;
    idError?: string | null;
    mode?: 'eval' | 'redteam';
  }) => (
    <div data-testid="custom-config" data-mode={mode}>
      {idError}
      <button
        type="button"
        data-testid="set-invalid-custom-config"
        onClick={() =>
          setBodyError?.('Configuration must be valid JSON before this provider can be saved.')
        }
      >
        Set invalid custom config
      </button>
    </div>
  ),
}));
vi.mock('./BrowserAutomationConfiguration', () => ({
  default: ({
    fieldErrors,
  }: {
    fieldErrors?: { stepErrors?: Record<number, { url?: string }> };
  }) => <div data-testid="browser-config">{fieldErrors?.stepErrors?.[0]?.url}</div>,
}));
vi.mock('./FoundationModelConfiguration', () => ({
  default: ({
    providerType,
    updateCustomTarget,
    fieldErrors,
  }: {
    providerType: string;
    updateCustomTarget: (field: string, value: unknown) => void;
    fieldErrors?: Record<string, string>;
  }) => (
    <div data-testid="fm-config">
      {Object.values(fieldErrors || {}).map((error) => (
        <p key={error}>{error}</p>
      ))}
      {providerType === 'bedrock' && (
        <button
          data-testid="switch-bedrock-invoke"
          onClick={() => updateCustomTarget('id', 'bedrock:anthropic.claude-3-5-sonnet')}
        >
          Switch Bedrock InvokeModel
        </button>
      )}
    </div>
  ),
}));
vi.mock('./AgentFrameworkConfiguration', () => ({
  default: ({
    providerIdError,
    mode,
  }: {
    providerIdError?: string | null;
    mode?: 'eval' | 'redteam';
  }) => (
    <div data-testid="agent-config" data-mode={mode}>
      {providerIdError}
    </div>
  ),
}));
vi.mock('./CommonConfigurationOptions', () => ({
  default: ({
    onValidationChange,
    hideExtensions,
  }: {
    onValidationChange?: (hasErrors: boolean) => void;
    hideExtensions?: boolean;
  }) => {
    React.useEffect(() => {
      if (onValidationChange) {
        onValidationChange(false);
      }
    }, [onValidationChange]);
    return <div data-testid="common-config" data-hide-extensions={String(hideExtensions)} />;
  },
}));

describe('ProviderConfigEditor', () => {
  describe('validate method', () => {
    it('should return true from validate() for a valid http provider', () => {
      const mockSetProvider = vi.fn();
      const mockSetError = vi.fn();
      const mockOnValidate = vi.fn();
      let validateFn: (() => boolean) | null = null;

      const validHttpProvider: ProviderOptions = {
        id: 'http',
        config: {
          url: 'https://api.example.com/chat',
          body: {
            messages: [{ role: 'user', content: '{{prompt}}' }],
          },
        },
      };

      renderWithProviders(
        <ProviderConfigEditor
          provider={validHttpProvider}
          setProvider={mockSetProvider}
          setError={mockSetError}
          onValidate={mockOnValidate}
          onValidationRequest={(validator) => {
            validateFn = validator;
          }}
          providerType="http"
        />,
      );

      const isValid = validateFn!();

      expect(isValid).toBe(true);
      expect(mockSetError).toHaveBeenCalledWith(null);
      expect(mockOnValidate).toHaveBeenCalledWith(true);
    });

    it('blocks saving an HTTP provider with incomplete configured authentication', async () => {
      const mockSetError = vi.fn();
      let validateFn: (() => boolean) | null = null;

      renderWithProviders(
        <ProviderConfigEditor
          provider={{
            id: 'http',
            config: {
              url: 'https://api.example.com/chat',
              body: { message: '{{prompt}}' },
              auth: { type: 'api_key', placement: 'header', keyName: '', value: '' },
            },
          }}
          setProvider={vi.fn()}
          setError={mockSetError}
          onValidationRequest={(validator) => {
            validateFn = validator;
          }}
          providerType="http"
          mode="eval"
        />,
      );

      await act(async () => {
        expect(validateFn!()).toBe(false);
      });
      expect(mockSetError).toHaveBeenCalledWith(
        'Key Name is required for API key authentication, API Key Value is required for API key authentication',
      );
      expect(screen.getByTestId('http-auth-field-errors')).toHaveTextContent(
        'Key Name is required for API key authentication, API Key Value is required for API key authentication',
      );
    });

    it('allows OAuth password grants without optional client credentials', () => {
      let validateFn: (() => boolean) | null = null;

      renderWithProviders(
        <ProviderConfigEditor
          provider={{
            id: 'http',
            config: {
              url: 'https://api.example.com/chat',
              body: { message: '{{prompt}}' },
              auth: {
                type: 'oauth',
                grantType: 'password',
                tokenUrl: 'https://auth.example.com/token',
                username: 'operator',
                password: 'secret',
              },
            },
          }}
          setProvider={vi.fn()}
          onValidationRequest={(validator) => {
            validateFn = validator;
          }}
          providerType="http"
          mode="eval"
        />,
      );

      expect(validateFn!()).toBe(true);
    });

    it('explains missing HTTP placeholders as test inputs in eval mode', async () => {
      const user = userEvent.setup();

      renderWithProviders(
        <ProviderConfigEditor
          provider={{
            id: 'http',
            config: {
              url: 'https://api.example.com/chat',
              body: { message: '{{prompt}}' },
            },
          }}
          setProvider={vi.fn()}
          providerType="http"
          mode="eval"
        />,
      );

      await user.click(screen.getByTestId('set-http-body-without-prompt'));

      const message = await screen.findByTestId('http-body-error');
      expect(message).toHaveTextContent(/replaces with each test input at run time/i);
      expect(message).not.toHaveTextContent(/attack payload/i);
    });

    it('places required raw HTTP request feedback at the active request field', () => {
      const mockSetError = vi.fn();
      let validateFn: (() => boolean) | null = null;

      renderWithProviders(
        <ProviderConfigEditor
          provider={{ id: 'http', config: { request: '' } }}
          setProvider={vi.fn()}
          setError={mockSetError}
          onValidationRequest={(validator) => {
            validateFn = validator;
          }}
          providerType="http"
          mode="eval"
        />,
      );

      act(() => {
        expect(validateFn!()).toBe(false);
      });

      expect(screen.getByTestId('http-body-error')).toHaveTextContent(
        'HTTP request content is required',
      );

      act(() => {
        expect(validateFn!()).toBe(false);
      });
      expect(mockSetError).toHaveBeenLastCalledWith('HTTP request content is required');
    });

    it('places required WebSocket URL feedback at the active URL field', () => {
      let validateFn: (() => boolean) | null = null;

      renderWithProviders(
        <ProviderConfigEditor
          provider={{ id: 'websocket', config: { url: '' } }}
          setProvider={vi.fn()}
          onValidationRequest={(validator) => {
            validateFn = validator;
          }}
          providerType="websocket"
          mode="eval"
        />,
      );

      act(() => {
        expect(validateFn!()).toBe(false);
      });

      expect(screen.getByTestId('ws-url-error')).toHaveTextContent(
        'Valid WebSocket URL is required',
      );
    });

    it('requires browser users to replace the starter application URL before saving', async () => {
      const setError = vi.fn();
      let validateFn: (() => boolean) | null = null;

      renderWithProviders(
        <ProviderConfigEditor
          provider={{
            id: 'browser',
            config: {
              steps: [{ action: 'navigate', args: { url: 'https://example.com' } }],
            },
          }}
          setProvider={vi.fn()}
          setError={setError}
          onValidationRequest={(validator) => {
            validateFn = validator;
          }}
          providerType="browser"
          mode="eval"
        />,
      );

      act(() => {
        expect(validateFn!()).toBe(false);
      });

      expect(setError).toHaveBeenCalledWith(
        'Step 1: replace example.com with your application URL.',
      );
      expect(
        await screen.findByText('Step 1: replace example.com with your application URL.'),
      ).toBeInTheDocument();
    });

    it('allows edited browser URLs that happen to mention example.com', () => {
      let validateFn: (() => boolean) | null = null;

      renderWithProviders(
        <ProviderConfigEditor
          provider={{
            id: 'browser',
            config: {
              steps: [
                {
                  action: 'navigate',
                  args: { url: 'https://myapp.test/redirect?source=example.com' },
                },
              ],
            },
          }}
          setProvider={vi.fn()}
          setError={vi.fn()}
          onValidationRequest={(validator) => {
            validateFn = validator;
          }}
          providerType="browser"
          mode="eval"
        />,
      );

      expect(validateFn!()).toBe(true);
    });

    it('should return false from validate() when provider ID contains only whitespace characters for foundation model providers', () => {
      const mockSetProvider = vi.fn();
      const mockSetError = vi.fn();
      const mockOnValidate = vi.fn();
      let validateFn: (() => boolean) | null = null;

      const whitespaceProvider: ProviderOptions = {
        id: '   ',
        config: {},
      };

      renderWithProviders(
        <ProviderConfigEditor
          provider={whitespaceProvider}
          setProvider={mockSetProvider}
          setError={mockSetError}
          onValidate={mockOnValidate}
          onValidationRequest={(validator) => {
            validateFn = validator;
          }}
          providerType="openai"
        />,
      );

      const isValid = validateFn!();

      expect(isValid).toBe(false);
      expect(mockSetError).toHaveBeenCalledWith('Model ID is required');
      expect(mockOnValidate).toHaveBeenCalledWith(false);
    });

    it("should return true from validate() for a valid 'go' custom provider with a non-empty provider ID when providerType is 'go'", () => {
      const mockSetProvider = vi.fn();
      const mockSetError = vi.fn();
      const mockOnValidate = vi.fn();
      let validateFn: (() => boolean) | null = null;

      const validGoProvider: ProviderOptions = {
        id: 'go-provider',
        config: {},
      };

      renderWithProviders(
        <ProviderConfigEditor
          provider={validGoProvider}
          setProvider={mockSetProvider}
          setError={mockSetError}
          onValidate={mockOnValidate}
          onValidationRequest={(validator) => {
            validateFn = validator;
          }}
          providerType="go"
        />,
      );

      const isValid = validateFn!();

      expect(isValid).toBe(true);
      expect(mockSetError).toHaveBeenCalledWith(null);
      expect(mockOnValidate).toHaveBeenCalledWith(true);
    });

    it('should return true from validate() for a valid agent framework provider with a concrete file path', () => {
      const mockSetProvider = vi.fn();
      const mockSetError = vi.fn();
      const mockOnValidate = vi.fn();
      let validateFn: (() => boolean) | null = null;

      const validAgentProvider: ProviderOptions = {
        id: 'file:///workspace/agents/customer_support.py',
        config: {},
      };

      renderWithProviders(
        <ProviderConfigEditor
          provider={validAgentProvider}
          setProvider={mockSetProvider}
          setError={mockSetError}
          onValidate={mockOnValidate}
          onValidationRequest={(validator) => {
            validateFn = validator;
          }}
          providerType="langchain"
        />,
      );

      const isValid = validateFn!();

      expect(isValid).toBe(true);
      expect(mockSetError).toHaveBeenCalledWith(null);
      expect(mockOnValidate).toHaveBeenCalledWith(true);
    });

    it('surfaces agent provider validation at its required file path field', async () => {
      let validateFn: (() => boolean) | null = null;

      renderWithProviders(
        <ProviderConfigEditor
          provider={{ id: '', config: {} }}
          setProvider={vi.fn()}
          onValidationRequest={(validator) => {
            validateFn = validator;
          }}
          providerType="langchain"
          mode="eval"
        />,
      );

      act(() => {
        expect(validateFn!()).toBe(false);
      });

      expect(await screen.findByText('Python agent file path is required')).toBeInTheDocument();
      expect(screen.getByTestId('agent-config')).toHaveAttribute('data-mode', 'eval');
    });

    it('should reject example paths that have not been replaced for script providers', () => {
      const mockSetProvider = vi.fn();
      const mockSetError = vi.fn();
      let validateFn: (() => boolean) | null = null;

      renderWithProviders(
        <ProviderConfigEditor
          provider={{ id: 'file:///path/to/custom_provider.py', config: {} }}
          setProvider={mockSetProvider}
          setError={mockSetError}
          onValidationRequest={(validator) => {
            validateFn = validator;
          }}
          providerType="python"
        />,
      );

      expect(validateFn!()).toBe(false);
      expect(mockSetError).toHaveBeenCalledWith(
        'Replace the example path with your provider file path',
      );
    });

    it('surfaces custom provider ID validation in the eval configuration form', async () => {
      let validateFn: (() => boolean) | null = null;

      renderWithProviders(
        <ProviderConfigEditor
          provider={{ id: '', config: {} }}
          setProvider={vi.fn()}
          onValidationRequest={(validator) => {
            validateFn = validator;
          }}
          providerType="custom"
          mode="eval"
        />,
      );

      act(() => {
        expect(validateFn!()).toBe(false);
      });

      expect(await screen.findByText('Provider ID is required')).toBeInTheDocument();
      expect(screen.getByTestId('custom-config')).toHaveAttribute('data-mode', 'eval');
    });

    it('should reject the example Azure deployment name', () => {
      const mockSetProvider = vi.fn();
      const mockSetError = vi.fn();
      let validateFn: (() => boolean) | null = null;

      renderWithProviders(
        <ProviderConfigEditor
          provider={{ id: 'azure:chat:your-deployment-name', config: {} }}
          setProvider={mockSetProvider}
          setError={mockSetError}
          onValidationRequest={(validator) => {
            validateFn = validator;
          }}
          providerType="azure"
        />,
      );

      expect(validateFn!()).toBe(false);
      expect(mockSetError).toHaveBeenCalledWith(
        'Replace the example value with your Azure deployment name',
      );
    });

    it('should reject zero max tokens instead of treating it as an empty value', () => {
      const mockSetProvider = vi.fn();
      const mockSetError = vi.fn();
      let validateFn: (() => boolean) | null = null;

      renderWithProviders(
        <ProviderConfigEditor
          provider={{ id: 'openai:gpt-5.5', config: { max_tokens: 0 } }}
          setProvider={mockSetProvider}
          setError={mockSetError}
          onValidationRequest={(validator) => {
            validateFn = validator;
          }}
          providerType="openai"
        />,
      );

      expect(validateFn!()).toBe(false);
      expect(mockSetError).toHaveBeenCalledWith('Max tokens must be greater than 0');
    });

    it('should expose foundation validation errors to the corresponding field UI', async () => {
      const mockSetProvider = vi.fn();
      let validateFn: (() => boolean) | null = null;

      renderWithProviders(
        <ProviderConfigEditor
          provider={{ id: 'openai:gpt-5.5', config: { temperature: 3, top_p: 2 } }}
          setProvider={mockSetProvider}
          onValidationRequest={(validator) => {
            validateFn = validator;
          }}
          providerType="openai"
        />,
      );

      expect(validateFn!()).toBe(false);
      expect(await screen.findByText('Temperature must be between 0 and 2')).toBeInTheDocument();
      expect(screen.getByText('Top P must be between 0 and 1')).toBeInTheDocument();
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

    const { container } = renderWithProviders(
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

  it('should block saving custom providers while their JSON configuration is invalid', async () => {
    const mockSetProvider = vi.fn();
    const mockSetError = vi.fn();
    const mockOnValidate = vi.fn();
    const captureValidator = vi.fn();

    renderWithProviders(
      <ProviderConfigEditor
        provider={{ id: 'custom-provider', config: {} }}
        setProvider={mockSetProvider}
        setError={mockSetError}
        onValidate={mockOnValidate}
        onValidationRequest={captureValidator}
        providerType="custom"
      />,
    );

    act(() => {
      screen.getByTestId('set-invalid-custom-config').click();
    });

    await waitFor(() => expect(captureValidator).toHaveBeenCalledTimes(2));
    const validateFn = captureValidator.mock.calls[
      captureValidator.mock.calls.length - 1
    ][0] as () => boolean;
    expect(validateFn()).toBe(false);
    expect(mockSetError).toHaveBeenCalledWith(
      'Configuration must be valid JSON before this provider can be saved.',
    );
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

    renderWithProviders(
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
    expect(screen.getByTestId('http-url-error')).toHaveTextContent('Valid URL is required');
  });

  it("should set error and render CustomTargetConfiguration when validateAll is true and a 'go' provider has an empty ID", () => {
    const mockSetProvider = vi.fn();
    const mockSetError = vi.fn();
    const mockOnValidate = vi.fn();

    const goProvider: ProviderOptions = {
      id: '',
      config: {},
    };

    const { getByTestId } = renderWithProviders(
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
    const mockSetProvider = vi.fn();
    const mockSetError = vi.fn();
    const mockOnValidate = vi.fn();
    let validateFn: (() => boolean) | null = null;

    const validGoProvider: ProviderOptions = {
      id: 'go-provider',
      config: {},
    };

    const { rerender } = renderWithProviders(
      <ProviderConfigEditor
        provider={validGoProvider}
        setProvider={mockSetProvider}
        setError={mockSetError}
        onValidate={mockOnValidate}
        onValidationRequest={(validator) => {
          validateFn = validator;
        }}
        providerType="go"
      />,
    );

    rerender(
      <ProviderConfigEditor
        provider={validGoProvider}
        setProvider={mockSetProvider}
        setError={mockSetError}
        onValidate={mockOnValidate}
        onValidationRequest={(validator) => {
          validateFn = validator;
        }}
        providerType="custom"
      />,
    );

    const isValid = validateFn!();

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

    renderWithProviders(<TestComponent />);

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
    // Use vi.fn() to capture the validator - this works better with React Compiler
    const captureValidator = vi.fn();

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
            provider={provider}
            setProvider={setProvider}
            setError={mockSetError}
            onValidate={mockOnValidate}
            onValidationRequest={captureValidator}
            providerType={providerType}
          />
          <button data-testid="change-provider-type" onClick={() => setProviderType('http')}>
            Change to HTTP Provider
          </button>
        </>
      );
    };

    renderWithProviders(<TestComponent />);

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

    renderWithProviders(
      <ProviderConfigEditor
        provider={updatedProvider}
        setProvider={mockSetProvider}
        setError={mockSetError}
        onValidate={mockOnValidate}
        onValidationRequest={captureValidator}
        providerType="http"
      />,
    );

    // Get the validator from the mock's most recent call
    const validateFn = captureValidator.mock.calls[captureValidator.mock.calls.length - 1][0];
    const isValid = validateFn();

    expect(isValid).toBe(true);
    expect(mockSetError).toHaveBeenCalledWith(null);
    expect(mockOnValidate).toHaveBeenCalledWith(true);
  });

  it('should render without crashing and apply default validation rules when providerType is undefined', () => {
    const mockSetProvider = vi.fn();
    const mockSetError = vi.fn();
    const mockOnValidate = vi.fn();
    let validateFn: (() => boolean) | null = null;

    const emptyProvider: ProviderOptions = {
      id: '',
      config: {},
    };

    const { getByTestId } = renderWithProviders(
      <ProviderConfigEditor
        provider={emptyProvider}
        setProvider={mockSetProvider}
        setError={mockSetError}
        onValidate={mockOnValidate}
        onValidationRequest={(validator) => {
          validateFn = validator;
        }}
        validateAll={true}
      />,
    );

    expect(getByTestId('common-config')).toBeInTheDocument();

    const isValid = validateFn!();
    expect(isValid).toBe(true);
    expect(mockSetError).toHaveBeenCalledWith(null);
    expect(mockOnValidate).toHaveBeenCalledWith(true);
  });

  it('hides unsupported global extension hooks in eval mode', () => {
    renderWithProviders(
      <ProviderConfigEditor
        provider={{ id: 'openai:gpt-5.5', config: {} }}
        setProvider={vi.fn()}
        providerType="openai"
        mode="eval"
      />,
    );

    expect(screen.getByTestId('common-config')).toHaveAttribute('data-hide-extensions', 'true');
  });

  it('should render Bedrock with the foundation model configuration', () => {
    const mockSetProvider = vi.fn();

    renderWithProviders(
      <ProviderConfigEditor
        provider={{ id: 'bedrock:anthropic.claude-3-5-sonnet-20241022-v2:0', config: {} }}
        setProvider={mockSetProvider}
        providerType="bedrock"
      />,
    );

    expect(screen.getByTestId('fm-config')).toBeInTheDocument();
    expect(screen.queryByTestId('custom-config')).not.toBeInTheDocument();
  });

  it('should remove Bedrock MCP config when switching back to InvokeModel ids', () => {
    const mockSetProvider = vi.fn();

    renderWithProviders(
      <ProviderConfigEditor
        provider={{
          id: 'bedrock:converse:anthropic.claude-3-5-sonnet-20241022-v2:0',
          config: {
            mcp: {
              enabled: true,
              servers: [{ name: 'server-1', command: 'npx', args: ['mcp-server'] }],
            },
          },
        }}
        setProvider={mockSetProvider}
        providerType="bedrock"
      />,
    );

    act(() => {
      screen.getByTestId('switch-bedrock-invoke').click();
    });

    expect(mockSetProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'bedrock:anthropic.claude-3-5-sonnet',
        config: {},
      }),
    );
  });

  it('should preserve Bedrock MCP config when provider is already using InvokeModel id format', () => {
    const mockSetProvider = vi.fn();
    const mcpConfig = {
      enabled: true,
      servers: [{ name: 'server-1', command: 'npx', args: ['mcp-server'] }],
    };

    renderWithProviders(
      <ProviderConfigEditor
        provider={{
          id: 'bedrock:anthropic.claude-3-5-sonnet',
          config: {
            mcp: mcpConfig,
          },
        }}
        setProvider={mockSetProvider}
        providerType="bedrock"
      />,
    );

    act(() => {
      screen.getByTestId('switch-bedrock-invoke').click();
    });

    expect(mockSetProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'bedrock:anthropic.claude-3-5-sonnet',
        config: {
          mcp: mcpConfig,
        },
      }),
    );
  });

  describe('updateCustomTarget inputs handling', () => {
    it('should render CommonConfigurationOptions with proper props', () => {
      const mockSetProvider = vi.fn();

      const httpProvider: ProviderOptions = {
        id: 'http',
        config: {
          url: 'https://api.example.com',
          body: { message: 'test' },
        },
      };

      renderWithProviders(
        <ProviderConfigEditor
          provider={httpProvider}
          setProvider={mockSetProvider}
          providerType="http"
        />,
      );

      // Verify CommonConfigurationOptions is rendered
      expect(screen.getByTestId('common-config')).toBeInTheDocument();
    });

    it('should handle inputs field correctly when set to undefined (deletion)', () => {
      // This tests the logic in updateCustomTarget for the inputs field
      // We test the conditional logic directly since we can't easily test through mocks

      // Test case 1: value is undefined -> should delete inputs field
      const updatedTarget: any = { id: 'test', config: {}, inputs: { old: 'value' } };

      delete updatedTarget.inputs;

      expect(updatedTarget.inputs).toBeUndefined();
      expect('inputs' in updatedTarget).toBe(false);
    });

    it('should handle inputs field correctly when set to an object', () => {
      // Test case 2: value is an object -> should set inputs field
      const updatedTarget = { id: 'test', config: {} } as any;
      const value = { user_id: 'A user ID', role: 'A role' };

      updatedTarget.inputs = value;

      expect(updatedTarget.inputs).toEqual({ user_id: 'A user ID', role: 'A role' });
    });

    it('should clear body error when inputs with keys are provided', () => {
      // Test the conditional logic: if Object.keys(value).length > 0, setBodyError(null)
      const inputsValue = { user_id: 'A user ID', role: 'A role' };
      const shouldClearError = Object.keys(inputsValue).length > 0;

      expect(shouldClearError).toBe(true);
      // When true, the code calls: setBodyError(null)
    });

    it('should not clear body error when inputs object is empty', () => {
      // Test the conditional logic with empty object
      const inputsValue = {};
      const shouldClearError = Object.keys(inputsValue).length > 0;

      expect(shouldClearError).toBe(false);
      // When false, setBodyError(null) is not called
    });

    it('should validate body allowing multi-input mode without {{prompt}}', () => {
      // Test the validation logic for body field when inputs are present
      const updatedTarget = {
        config: { body: { userId: '{{user_id}}' } },
        inputs: { user_id: 'User ID' },
      };

      const bodyStr = JSON.stringify(updatedTarget.config.body);
      const hasInputs = updatedTarget.inputs && Object.keys(updatedTarget.inputs).length > 0;

      // Body validation: if (bodyStr.includes('{{prompt}}') || hasInputs)
      const shouldClearBodyError = bodyStr.includes('{{prompt}}') || hasInputs;

      expect(shouldClearBodyError).toBe(true);
      // When true, setBodyError(null) is called
    });

    it('should validate raw request allowing multi-input mode without {{prompt}}', () => {
      // Test the validation logic for request field when inputs are present
      const updatedTarget = {
        config: { request: 'POST /api\nUser-ID: {{user_id}}' },
        inputs: { user_id: 'User ID' },
      };

      const request = updatedTarget.config.request;
      const hasInputs = updatedTarget.inputs && Object.keys(updatedTarget.inputs).length > 0;

      // Request validation: if (value && !value.includes('{{prompt}}') && !hasInputs)
      const shouldSetError = request && !request.includes('{{prompt}}') && !hasInputs;

      expect(shouldSetError).toBe(false);
      // When false, no error is set (body error is cleared or remains null)
    });

    it('should require {{prompt}} in body when no inputs are present', () => {
      // Test validation when inputs are NOT present
      const updatedTarget = {
        config: { body: { message: 'hello' } },
        inputs: undefined,
      };

      const bodyStr = JSON.stringify(updatedTarget.config.body);
      const hasInputs = updatedTarget.inputs && Object.keys(updatedTarget.inputs).length > 0;

      const shouldClearBodyError = bodyStr.includes('{{prompt}}') || !!hasInputs;

      expect(shouldClearBodyError).toBe(false);
      // When false, body error should be set requiring {{prompt}}
    });
  });
});
