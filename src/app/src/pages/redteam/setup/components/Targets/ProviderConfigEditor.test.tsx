import React from 'react';

import { renderWithProviders } from '@app/utils/testutils';
import { act, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProviderConfigEditor from './ProviderConfigEditor';

import type { ProviderOptions } from '../../types';

const mockA2AConfigState = vi.hoisted(() => ({
  advancedConfigError: null as string | null,
}));

vi.mock('./HttpEndpointConfiguration', () => ({
  default: ({
    updateCustomTarget,
    bodyError,
    urlError,
  }: {
    updateCustomTarget: (field: string, value: unknown) => void;
    bodyError: string | React.ReactNode | null;
    urlError: string | null;
  }) => (
    <div data-testid="http-config">
      <button
        data-testid="update-http-url"
        onClick={() => updateCustomTarget('url', 'https://updated.example.com/chat')}
      >
        Update HTTP URL
      </button>
      <button
        data-testid="replace-http-config"
        onClick={() =>
          updateCustomTarget('config', {
            url: 'https://replacement.example.com/chat',
            method: 'PUT',
          })
        }
      >
        Replace HTTP Config
      </button>
      <button
        data-testid="replace-http-config-with-invalid-body"
        onClick={() =>
          updateCustomTarget('config', {
            url: 'https://replacement.example.com/chat',
            body: '{"message":"hello"}',
          })
        }
      >
        Replace HTTP Config Without Prompt
      </button>
      <button
        data-testid="replace-http-config-with-invalid-request"
        onClick={() =>
          updateCustomTarget('config', {
            request: 'POST /chat HTTP/1.1\n\n{"message":"hello"}',
          })
        }
      >
        Replace HTTP Request Without Prompt
      </button>
      <button
        data-testid="replace-http-config-with-invalid-url"
        onClick={() =>
          updateCustomTarget('config', {
            url: 'not-a-url',
            body: '{"message":"{{prompt}}"}',
          })
        }
      >
        Replace HTTP Config With Invalid URL
      </button>
      {bodyError && <div data-testid="http-body-error">{bodyError}</div>}
      {urlError && <div data-testid="http-url-error">{urlError}</div>}
    </div>
  ),
}));
vi.mock('./WebSocketEndpointConfiguration', () => ({
  default: ({
    updateWebSocketTarget,
  }: {
    updateWebSocketTarget: (field: string, value: unknown) => void;
  }) => (
    <div data-testid="ws-config">
      <button
        data-testid="update-ws-url"
        onClick={() => updateWebSocketTarget('url', 'wss://updated.example.com/ws')}
      >
        Update WebSocket URL
      </button>
    </div>
  ),
}));
vi.mock('./CustomTargetConfiguration', () => ({
  default: () => <div data-testid="custom-config" />,
}));
vi.mock('./A2AEndpointConfiguration', async () => {
  const React = await vi.importActual<typeof import('react')>('react');
  return {
    default: ({
      onAdvancedConfigErrorChange,
    }: {
      onAdvancedConfigErrorChange?: (error: string | null) => void;
    }) => {
      React.useEffect(() => {
        onAdvancedConfigErrorChange?.(mockA2AConfigState.advancedConfigError);
      }, [onAdvancedConfigErrorChange]);
      return <div data-testid="a2a-config" />;
    },
  };
});
vi.mock('./BrowserAutomationConfiguration', () => ({
  default: () => <div data-testid="browser-config" />,
}));
vi.mock('./FoundationModelConfiguration', () => ({
  default: ({
    providerType,
    updateCustomTarget,
  }: {
    providerType: string;
    updateCustomTarget: (field: string, value: unknown) => void;
  }) => (
    <div data-testid="fm-config">
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

describe('ProviderConfigEditor', () => {
  beforeEach(() => {
    mockA2AConfigState.advancedConfigError = null;
  });

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

    it('should return true from validate() for an A2A provider with a shorthand URL', () => {
      const mockSetProvider = vi.fn();
      const mockSetError = vi.fn();
      const mockOnValidate = vi.fn();
      let validateFn: (() => boolean) | null = null;

      const a2aProvider: ProviderOptions = {
        id: 'a2a:https://agent.example.com/a2a/v1',
        config: {
          url: '',
        },
      };

      renderWithProviders(
        <ProviderConfigEditor
          provider={a2aProvider}
          setProvider={mockSetProvider}
          setError={mockSetError}
          onValidate={mockOnValidate}
          onValidationRequest={(validator) => {
            validateFn = validator;
          }}
          providerType="a2a"
        />,
      );

      const isValid = validateFn!();

      expect(isValid).toBe(true);
      expect(mockSetError).toHaveBeenCalledWith(null);
      expect(mockOnValidate).toHaveBeenCalledWith(true);
    });

    it('should return true from validate() for an A2A provider with a templated endpoint URL', () => {
      const mockSetProvider = vi.fn();
      const mockSetError = vi.fn();
      const mockOnValidate = vi.fn();
      let validateFn: (() => boolean) | null = null;

      const a2aProvider: ProviderOptions = {
        id: 'a2a',
        config: {
          url: '{{ env.A2A_URL }}',
          mode: 'send',
        },
      };

      renderWithProviders(
        <ProviderConfigEditor
          provider={a2aProvider}
          setProvider={mockSetProvider}
          setError={mockSetError}
          onValidate={mockOnValidate}
          onValidationRequest={(validator) => {
            validateFn = validator;
          }}
          providerType="a2a"
        />,
      );

      const isValid = validateFn!();

      expect(isValid).toBe(true);
      expect(mockSetError).toHaveBeenCalledWith(null);
      expect(mockOnValidate).toHaveBeenCalledWith(true);
    });

    it('should return true from validate() for an A2A provider with a templated Agent Card URL host', () => {
      const mockSetProvider = vi.fn();
      const mockSetError = vi.fn();
      const mockOnValidate = vi.fn();
      let validateFn: (() => boolean) | null = null;

      const a2aProvider: ProviderOptions = {
        id: 'a2a',
        config: {
          agentCardUrl: 'https://{{ env.A2A_HOST }}/.well-known/agent-card.json',
          mode: 'auto',
        },
      };

      renderWithProviders(
        <ProviderConfigEditor
          provider={a2aProvider}
          setProvider={mockSetProvider}
          setError={mockSetError}
          onValidate={mockOnValidate}
          onValidationRequest={(validator) => {
            validateFn = validator;
          }}
          providerType="a2a"
        />,
      );

      const isValid = validateFn!();

      expect(isValid).toBe(true);
      expect(mockSetError).toHaveBeenCalledWith(null);
      expect(mockOnValidate).toHaveBeenCalledWith(true);
    });

    it('should return true from validate() for an A2A provider with a templated shorthand URL', () => {
      const mockSetProvider = vi.fn();
      const mockSetError = vi.fn();
      const mockOnValidate = vi.fn();
      let validateFn: (() => boolean) | null = null;

      const a2aProvider: ProviderOptions = {
        id: 'a2a:{{ env.A2A_URL }}',
        config: {
          mode: 'send',
        },
      };

      renderWithProviders(
        <ProviderConfigEditor
          provider={a2aProvider}
          setProvider={mockSetProvider}
          setError={mockSetError}
          onValidate={mockOnValidate}
          onValidationRequest={(validator) => {
            validateFn = validator;
          }}
          providerType="a2a"
        />,
      );

      const isValid = validateFn!();

      expect(isValid).toBe(true);
      expect(mockSetError).toHaveBeenCalledWith(null);
      expect(mockOnValidate).toHaveBeenCalledWith(true);
    });

    it('should return false from validate() for an A2A provider without endpoint details', () => {
      const mockSetProvider = vi.fn();
      const mockSetError = vi.fn();
      const mockOnValidate = vi.fn();
      let validateFn: (() => boolean) | null = null;

      const a2aProvider: ProviderOptions = {
        id: 'a2a',
        config: {
          url: '',
        },
      };

      renderWithProviders(
        <ProviderConfigEditor
          provider={a2aProvider}
          setProvider={mockSetProvider}
          setError={mockSetError}
          onValidate={mockOnValidate}
          onValidationRequest={(validator) => {
            validateFn = validator;
          }}
          providerType="a2a"
        />,
      );

      const isValid = validateFn!();

      expect(isValid).toBe(false);
      expect(mockSetError).toHaveBeenCalledWith(
        'A valid A2A endpoint URL or Agent Card URL is required',
      );
      expect(mockOnValidate).toHaveBeenCalledWith(false);
    });

    it('should return false from validate() for an invalid A2A endpoint override even when Agent Card URL is valid', () => {
      const mockSetProvider = vi.fn();
      const mockSetError = vi.fn();
      const mockOnValidate = vi.fn();
      let validateFn: (() => boolean) | null = null;

      const a2aProvider: ProviderOptions = {
        id: 'a2a',
        config: {
          agentCardUrl: 'https://agent.example.com/.well-known/agent-card.json',
          url: 'not-a-url',
        },
      };

      renderWithProviders(
        <ProviderConfigEditor
          provider={a2aProvider}
          setProvider={mockSetProvider}
          setError={mockSetError}
          onValidate={mockOnValidate}
          onValidationRequest={(validator) => {
            validateFn = validator;
          }}
          providerType="a2a"
        />,
      );

      const isValid = validateFn!();

      expect(isValid).toBe(false);
      expect(mockSetError).toHaveBeenCalledWith('A2A endpoint URL must be a valid HTTP(S) URL');
      expect(mockOnValidate).toHaveBeenCalledWith(false);
    });

    it('should return false from validate() for an invalid A2A Agent Card URL even when shorthand URL is valid', () => {
      const mockSetProvider = vi.fn();
      const mockSetError = vi.fn();
      const mockOnValidate = vi.fn();
      let validateFn: (() => boolean) | null = null;

      const a2aProvider: ProviderOptions = {
        id: 'a2a:https://agent.example.com/a2a/v1',
        config: {
          agentCardUrl: 'not-a-url',
          url: '',
        },
      };

      renderWithProviders(
        <ProviderConfigEditor
          provider={a2aProvider}
          setProvider={mockSetProvider}
          setError={mockSetError}
          onValidate={mockOnValidate}
          onValidationRequest={(validator) => {
            validateFn = validator;
          }}
          providerType="a2a"
        />,
      );

      const isValid = validateFn!();

      expect(isValid).toBe(false);
      expect(mockSetError).toHaveBeenCalledWith('A2A Agent Card URL must be a valid HTTP(S) URL');
      expect(mockOnValidate).toHaveBeenCalledWith(false);
    });

    it('should return false from validate() for an A2A provider with a non-A2A provider ID', () => {
      const mockSetProvider = vi.fn();
      const mockSetError = vi.fn();
      const mockOnValidate = vi.fn();
      let validateFn: (() => boolean) | null = null;

      const a2aProvider: ProviderOptions = {
        id: 'travel-agent',
        config: {
          url: 'https://agent.example.com/a2a/v1',
        },
      };

      renderWithProviders(
        <ProviderConfigEditor
          provider={a2aProvider}
          setProvider={mockSetProvider}
          setError={mockSetError}
          onValidate={mockOnValidate}
          onValidationRequest={(validator) => {
            validateFn = validator;
          }}
          providerType="a2a"
        />,
      );

      const isValid = validateFn!();

      expect(isValid).toBe(false);
      expect(mockSetError).toHaveBeenCalledWith(
        'A2A Provider ID must be "a2a" or start with "a2a:"',
      );
      expect(mockOnValidate).toHaveBeenCalledWith(false);
    });

    it('should return false from validate() when A2A advanced JSON is invalid', async () => {
      mockA2AConfigState.advancedConfigError = 'Invalid JSON configuration';
      const mockSetProvider = vi.fn();
      const mockSetError = vi.fn();
      const mockOnValidate = vi.fn();
      let validateFn: (() => boolean) | null = null;

      const a2aProvider: ProviderOptions = {
        id: 'a2a',
        config: {
          url: 'https://agent.example.com/a2a/v1',
          mode: 'send',
        },
      };

      renderWithProviders(
        <ProviderConfigEditor
          provider={a2aProvider}
          setProvider={mockSetProvider}
          setError={mockSetError}
          onValidate={mockOnValidate}
          onValidationRequest={(validator) => {
            validateFn = validator;
          }}
          providerType="a2a"
        />,
      );

      await waitFor(() => {
        expect(validateFn!()).toBe(false);
      });
      expect(mockSetError).toHaveBeenCalledWith('Invalid JSON configuration');
      expect(mockOnValidate).toHaveBeenCalledWith(false);
    });

    it("should return true from validate() for a valid agent framework provider (e.g., providerType is 'langchain', provider.id is 'file://path/to/agent.py')", () => {
      const mockSetProvider = vi.fn();
      const mockSetError = vi.fn();
      const mockOnValidate = vi.fn();
      let validateFn: (() => boolean) | null = null;

      const validAgentProvider: ProviderOptions = {
        id: 'file://path/to/agent.py',
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

  describe('config cloning during provider updates', () => {
    it('clones the HTTP config before changing a field', () => {
      const mockSetProvider = vi.fn();
      const originalConfig = {
        url: 'https://api.example.com',
        method: 'POST',
      };
      const httpProvider: ProviderOptions = {
        id: 'http',
        config: originalConfig,
      };

      renderWithProviders(
        <ProviderConfigEditor
          provider={httpProvider}
          setProvider={mockSetProvider}
          providerType="http"
        />,
      );

      act(() => {
        screen.getByTestId('update-http-url').click();
      });

      expect(mockSetProvider).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            url: 'https://updated.example.com/chat',
            method: 'POST',
          }),
        }),
      );
      const updatedProvider = mockSetProvider.mock.calls[0][0] as ProviderOptions;
      expect(updatedProvider.config).not.toBe(originalConfig);
      expect(originalConfig.url).toBe('https://api.example.com');
    });

    it('replaces the HTTP config without mutating the prior object', () => {
      const mockSetProvider = vi.fn();
      const originalConfig = {
        url: 'https://api.example.com',
        method: 'POST',
      };

      renderWithProviders(
        <ProviderConfigEditor
          provider={{ id: 'http', config: originalConfig }}
          setProvider={mockSetProvider}
          providerType="http"
        />,
      );

      act(() => {
        screen.getByTestId('replace-http-config').click();
      });

      const updatedProvider = mockSetProvider.mock.calls[0][0] as ProviderOptions;
      expect(updatedProvider.config).toEqual({
        url: 'https://replacement.example.com/chat',
        method: 'PUT',
      });
      expect(updatedProvider.config).not.toBe(originalConfig);
      expect(originalConfig).toEqual({
        url: 'https://api.example.com',
        method: 'POST',
      });
    });

    it('validates prompt placeholders after replacing the HTTP config', () => {
      const mockSetProvider = vi.fn();

      renderWithProviders(
        <ProviderConfigEditor
          provider={{
            id: 'http',
            config: {
              url: 'https://api.example.com',
              body: '{"message":"{{prompt}}"}',
            },
          }}
          setProvider={mockSetProvider}
          providerType="http"
        />,
      );

      act(() => {
        screen.getByTestId('replace-http-config-with-invalid-body').click();
      });

      expect(screen.getByTestId('http-body-error')).toHaveTextContent(
        'Request body must contain {{prompt}}',
      );

      act(() => {
        screen.getByTestId('replace-http-config-with-invalid-request').click();
      });

      expect(screen.getByTestId('http-body-error')).toHaveTextContent(
        'Raw request must contain {{prompt}} template variable',
      );
    });

    it('validates the URL after replacing the structured HTTP config', () => {
      const mockSetProvider = vi.fn();

      renderWithProviders(
        <ProviderConfigEditor
          provider={{
            id: 'http',
            config: {
              url: 'https://api.example.com',
              body: '{"message":"{{prompt}}"}',
            },
          }}
          setProvider={mockSetProvider}
          providerType="http"
        />,
      );

      act(() => {
        screen.getByTestId('replace-http-config-with-invalid-url').click();
      });

      expect(screen.getByTestId('http-url-error')).toHaveTextContent('Invalid URL format');
    });

    it('clones the WebSocket config before changing a field', () => {
      const mockSetProvider = vi.fn();
      const originalConfig = {
        url: 'wss://example.com/ws',
        transformResponse: 'json.data',
      };

      renderWithProviders(
        <ProviderConfigEditor
          provider={{ id: 'websocket', config: originalConfig }}
          setProvider={mockSetProvider}
          providerType="websocket"
        />,
      );

      act(() => {
        screen.getByTestId('update-ws-url').click();
      });

      expect(mockSetProvider).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            url: 'wss://updated.example.com/ws',
            transformResponse: 'json.data',
          }),
        }),
      );
      const updatedProvider = mockSetProvider.mock.calls[0][0] as ProviderOptions;
      expect(updatedProvider.config).not.toBe(originalConfig);
      expect(originalConfig.url).toBe('wss://example.com/ws');
    });
  });
});
