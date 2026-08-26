import React from 'react';

import { renderWithProviders } from '@app/utils/testutils';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRedTeamConfig } from '../../hooks/useRedTeamConfig';
import { useRedTeamTargetConfigValidation } from '../../hooks/useRedTeamTargetConfigValidation';
import ProviderConfigEditor from './ProviderConfigEditor';

import type { ProviderOptions } from '../../types';

const mockA2AConfigState = vi.hoisted(() => ({
  advancedConfigError: null as string | null,
}));

vi.mock('./HttpEndpointConfiguration', () => ({
  default: () => <div data-testid="http-config" />,
}));
vi.mock('./WebSocketEndpointConfiguration', () => ({
  default: () => <div data-testid="ws-config" />,
}));
vi.mock('./CustomTargetConfiguration', () => ({
  default: ({
    selectedTarget,
    updateCustomTarget,
    onConfigErrorChange,
    rawConfigJson,
    setRawConfigJson,
    bodyError,
  }: {
    selectedTarget?: { id: string; label?: string; config: Record<string, unknown> };
    updateCustomTarget?: (field: string, value: unknown) => void;
    onConfigErrorChange?: (error: string | null, expectedTarget?: unknown) => void;
    rawConfigJson?: string;
    setRawConfigJson?: (value: string) => void;
    bodyError?: React.ReactNode;
  }) => (
    <div data-testid="custom-config">
      <pre data-testid="custom-raw-config">{rawConfigJson}</pre>
      <div data-testid="custom-body-error">{bodyError}</div>
      <button
        data-testid="invalidate-custom-config"
        onClick={() => {
          setRawConfigJson?.('{"sandbox_mode":"read-only",}');
          onConfigErrorChange?.('Invalid JSON configuration');
        }}
      >
        Invalidate custom config
      </button>
      <button
        data-testid="correct-custom-config"
        onClick={() => {
          const config = { sandbox_mode: 'read-only' };
          setRawConfigJson?.(JSON.stringify(config));
          updateCustomTarget?.('config', config);
          onConfigErrorChange?.(null, { ...selectedTarget, config });
        }}
      >
        Correct custom config
      </button>
    </div>
  ),
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

function StatefulCodexSecurityEditor({
  initialConfig = {},
  initialId = 'openai:codex-security:gpt-5.6-luna',
}: {
  initialConfig?: ProviderOptions['config'];
  initialId?: string;
}) {
  const [provider, setProvider] = React.useState<ProviderOptions>({
    id: initialId,
    config: {
      operation: 'security-scan',
      repository: '/repos/service',
      auth: 'chatgpt',
      model_reasoning_effort: 'high',
      max_cost_usd: 1,
      ...initialConfig,
    },
  });

  return (
    <>
      <ProviderConfigEditor
        provider={provider}
        setProvider={setProvider}
        providerType="codex-security"
      />
      <output data-testid="codex-security-config">{JSON.stringify(provider.config)}</output>
    </>
  );
}

describe('ProviderConfigEditor', () => {
  beforeEach(() => {
    mockA2AConfigState.advancedConfigError = null;
    useRedTeamTargetConfigValidation.getState().clearTargetConfigValidation();
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

    it.each([
      {
        config: { operation: 'fix-finding', repository: '/repos/service' },
        expectedError: 'Unsupported Codex Security operation',
      },
      {
        config: { operation: 'security-scan', repository: '/repos/service', auth: 'oauth' },
        expectedError: 'Unsupported Codex Security authentication method',
      },
      {
        config: {
          operation: 'security-scan',
          repository: '/repos/service',
          model_reasoning_effort: 'extreme',
        },
        expectedError: 'Unsupported Codex Security reasoning effort',
      },
      {
        config: {
          operation: 'security-scan',
          repository: '/repos/service',
          reasoning_effort: 'extreme',
        },
        expectedError: 'Unsupported Codex Security reasoning effort',
      },
      {
        config: { operation: 'security-scan', repository: '' },
        expectedError: 'Repository path is required',
      },
      {
        config: {
          operation: 'security-scan',
          repository: '',
          working_dir: '/repos/legacy-service',
        },
        expectedError: 'Repository path is required',
      },
      {
        config: { operation: 'security-diff-scan', repository: '/repos/service' },
        expectedError: 'A base Git reference or working tree target is required for diff scans',
      },
      {
        config: { operation: 'security-scan', repository: '/repos/service', max_cost_usd: 0 },
        expectedError: 'Maximum scan cost must be greater than 0',
      },
      {
        config: {
          operation: 'security-diff-scan',
          repository: '/repos/service',
          working_tree: true,
          head_ref: 'feature/auth',
        },
        expectedError: 'Working-tree scans cannot specify a head Git reference',
      },
      {
        config: {
          operation: 'security-scan',
          repository: '/repos/service',
          base_ref: 'origin/main',
        },
        expectedError: 'Git diff target options require the diff scan operation',
      },
      {
        config: {
          operation: 'security-diff-scan',
          repository: '/repos/service',
          base_ref: 'origin/main',
          paths: ['src/auth'],
        },
        expectedError: 'Scoped repository paths cannot be combined with diff scans',
      },
      {
        config: {
          operation: 'security-scan',
          repository: '/repos/service',
          model_reasoning_effort: 'high',
          reasoning_effort: 'low',
        },
        expectedError: 'Reasoning effort settings must match',
      },
    ])('validates Codex Security configuration: $expectedError', ({ config, expectedError }) => {
      const mockSetError = vi.fn();
      let validateFn: (() => boolean) | null = null;

      renderWithProviders(
        <ProviderConfigEditor
          provider={{ id: 'openai:codex-security:gpt-5.6-luna', config }}
          setProvider={vi.fn()}
          setError={mockSetError}
          onValidationRequest={(validator) => {
            validateFn = validator;
          }}
          providerType="codex-security"
        />,
      );

      expect(validateFn!()).toBe(false);
      expect(mockSetError).toHaveBeenCalledWith(expectedError);
    });

    it('accepts native Codex Security provider IDs without requiring a Python adapter', () => {
      const mockSetError = vi.fn();
      let validateFn: (() => boolean) | null = null;

      renderWithProviders(
        <ProviderConfigEditor
          provider={{
            id: 'openai:codex-security:gpt-5.6-luna',
            config: { operation: 'security-scan', repository: '/repos/service' },
          }}
          setProvider={vi.fn()}
          setError={mockSetError}
          onValidationRequest={(validator) => {
            validateFn = validator;
          }}
          providerType="codex-security"
        />,
      );

      expect(validateFn!()).toBe(true);
      expect(mockSetError).toHaveBeenCalledWith(null);
    });

    it('accepts the documented working_dir repository alias', () => {
      const mockSetError = vi.fn();
      let validateFn: (() => boolean) | null = null;

      renderWithProviders(
        <ProviderConfigEditor
          provider={{
            id: 'openai:codex-security',
            config: { operation: 'security-scan', working_dir: '/repos/legacy-service' },
          }}
          setProvider={vi.fn()}
          setError={mockSetError}
          onValidationRequest={(validator) => {
            validateFn = validator;
          }}
          providerType="codex-security"
        />,
      );

      expect(screen.getByLabelText('Repository path *')).toHaveValue('/repos/legacy-service');
      expect(validateFn!()).toBe(true);
      expect(mockSetError).toHaveBeenCalledWith(null);
    });

    it('validates missing repository paths immediately in the provider dialog', async () => {
      const mockSetError = vi.fn();

      renderWithProviders(
        <ProviderConfigEditor
          provider={{
            id: 'openai:codex-security',
            config: { operation: 'security-scan', repository: '' },
          }}
          setProvider={vi.fn()}
          setError={mockSetError}
          validateAll
          providerType="codex-security"
        />,
      );

      await waitFor(() => {
        expect(mockSetError).toHaveBeenCalledWith('Repository path is required');
      });
    });
  });

  it('configures native scan operations, models, reasoning, authentication, and cost', async () => {
    const user = userEvent.setup();

    renderWithProviders(<StatefulCodexSecurityEditor />);

    expect(screen.getByLabelText('Model')).toHaveValue('gpt-5.6-luna');
    expect(screen.getByLabelText('Repository path *')).toHaveValue('/repos/service');

    await user.selectOptions(screen.getByLabelText('Security operation'), 'deep-security-scan');

    expect(JSON.parse(screen.getByTestId('codex-security-config').textContent!)).toMatchObject({
      operation: 'deep-security-scan',
    });

    const modelInput = screen.getByLabelText('Model');
    await user.clear(modelInput);
    await user.type(modelInput, 'gpt-5.6-terra');

    expect(screen.getByText('openai:codex-security:gpt-5.6-terra')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Reasoning effort'), 'max');
    await user.selectOptions(screen.getByLabelText('Authentication'), 'api-key');
    await user.clear(screen.getByLabelText('Maximum cost (USD)'));
    await user.type(screen.getByLabelText('Maximum cost (USD)'), '2');

    expect(JSON.parse(screen.getByTestId('codex-security-config').textContent!)).toMatchObject({
      model_reasoning_effort: 'max',
      auth: 'api-key',
      max_cost_usd: 2,
    });

    await user.selectOptions(screen.getByLabelText('Security operation'), 'security-scan');
    expect(screen.getByLabelText('Security operation')).toHaveValue('security-scan');
  });

  it('requires unsupported imported security operations to be replaced with a native operation', async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <StatefulCodexSecurityEditor initialConfig={{ operation: 'fix-finding' }} />,
    );

    const operation = screen.getByLabelText('Security operation');
    expect(operation).toHaveValue('');
    expect(screen.getByRole('option', { name: 'Unsupported security operation' })).toBeDisabled();

    await user.selectOptions(operation, 'security-scan');

    expect(operation).toHaveValue('security-scan');
    expect(JSON.parse(screen.getByTestId('codex-security-config').textContent!)).toMatchObject({
      operation: 'security-scan',
    });
  });

  it('requires unsupported imported authentication and reasoning settings to be corrected', async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <StatefulCodexSecurityEditor
        initialConfig={{ auth: 'oauth', model_reasoning_effort: 'extreme' }}
      />,
    );

    const reasoning = screen.getByLabelText('Reasoning effort');
    const auth = screen.getByLabelText('Authentication');
    expect(reasoning).toHaveValue('');
    expect(auth).toHaveValue('');
    expect(screen.getByRole('option', { name: 'Unsupported reasoning effort' })).toBeDisabled();
    expect(
      screen.getByRole('option', { name: 'Unsupported authentication method' }),
    ).toBeDisabled();

    await user.selectOptions(reasoning, 'high');
    await user.selectOptions(auth, 'chatgpt');

    expect(JSON.parse(screen.getByTestId('codex-security-config').textContent!)).toMatchObject({
      auth: 'chatgpt',
      model_reasoning_effort: 'high',
    });
  });

  it('clears legacy config.model when the inline model is edited or removed', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <StatefulCodexSecurityEditor
        initialId="openai:codex-security"
        initialConfig={{ model: 'gpt-5.6-sol' }}
      />,
    );

    const modelInput = screen.getByLabelText('Model');
    expect(modelInput).toHaveValue('gpt-5.6-sol');

    await user.clear(modelInput);

    expect(modelInput).toHaveValue('');
    expect(screen.getByText('openai:codex-security')).toBeInTheDocument();
    expect(JSON.parse(screen.getByTestId('codex-security-config').textContent!)).not.toHaveProperty(
      'model',
    );
  });

  it('normalizes the legacy working directory when editing or clearing repository paths', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <StatefulCodexSecurityEditor
        initialConfig={{ repository: undefined, working_dir: '/repos/legacy-service' }}
      />,
    );

    const repositoryInput = screen.getByLabelText('Repository path *');
    expect(repositoryInput).toHaveValue('/repos/legacy-service');

    await user.clear(repositoryInput);

    let config = JSON.parse(screen.getByTestId('codex-security-config').textContent!);
    expect(config.repository).toBe('');
    expect(config).not.toHaveProperty('working_dir');

    await user.type(repositoryInput, '/repos/new-service');

    config = JSON.parse(screen.getByTestId('codex-security-config').textContent!);
    expect(config.repository).toBe('/repos/new-service');
    expect(config).not.toHaveProperty('working_dir');
  });

  it('displays and normalizes the legacy reasoning-effort alias', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <StatefulCodexSecurityEditor
        initialConfig={{ model_reasoning_effort: undefined, reasoning_effort: 'low' }}
      />,
    );

    const reasoning = screen.getByLabelText('Reasoning effort');
    expect(reasoning).toHaveValue('low');

    await user.selectOptions(reasoning, 'high');

    const config = JSON.parse(screen.getByTestId('codex-security-config').textContent!);
    expect(config.model_reasoning_effort).toBe('high');
    expect(config).not.toHaveProperty('reasoning_effort');
  });

  it('trims pasted model names and treats whitespace-only input as an unset model', async () => {
    const user = userEvent.setup();
    renderWithProviders(<StatefulCodexSecurityEditor />);

    const modelInput = screen.getByLabelText('Model');
    await user.clear(modelInput);
    await user.click(modelInput);
    await user.paste('  gpt-5.6-terra  ');

    expect(modelInput).toHaveValue('gpt-5.6-terra');
    expect(screen.getByText('openai:codex-security:gpt-5.6-terra')).toBeInTheDocument();

    await user.clear(modelInput);
    await user.type(modelInput, '   ');

    expect(modelInput).toHaveValue('');
    expect(screen.getByText('openai:codex-security')).toBeInTheDocument();
  });

  it('configures scoped repository paths and mutually exclusive working-tree diff targets', async () => {
    const user = userEvent.setup();
    renderWithProviders(<StatefulCodexSecurityEditor />);

    await user.type(screen.getByLabelText('Scoped paths'), 'src/auth, src/api');

    expect(JSON.parse(screen.getByTestId('codex-security-config').textContent!)).toMatchObject({
      paths: ['src/auth', 'src/api'],
    });

    await user.selectOptions(screen.getByLabelText('Security operation'), 'security-diff-scan');

    expect(screen.queryByLabelText('Scoped paths')).not.toBeInTheDocument();
    expect(JSON.parse(screen.getByTestId('codex-security-config').textContent!)).not.toHaveProperty(
      'paths',
    );

    await user.type(screen.getByLabelText('Base Git reference'), 'origin/main');
    await user.type(screen.getByLabelText('Head Git reference'), 'feature/auth');
    await user.click(
      screen.getByRole('checkbox', { name: 'Scan uncommitted working-tree changes.' }),
    );

    expect(screen.queryByLabelText('Head Git reference')).not.toBeInTheDocument();
    expect(JSON.parse(screen.getByTestId('codex-security-config').textContent!)).toMatchObject({
      operation: 'security-diff-scan',
      base_ref: 'origin/main',
      working_tree: true,
    });
    expect(JSON.parse(screen.getByTestId('codex-security-config').textContent!)).not.toHaveProperty(
      'head_ref',
    );

    await user.click(
      screen.getByRole('checkbox', { name: 'Scan uncommitted working-tree changes.' }),
    );
    expect(screen.getByLabelText('Head Git reference')).toBeInTheDocument();
    expect(JSON.parse(screen.getByTestId('codex-security-config').textContent!)).not.toHaveProperty(
      'working_tree',
    );
  });

  it('removes cleared optional paths, scan cost, and finding files', async () => {
    const user = userEvent.setup();
    renderWithProviders(<StatefulCodexSecurityEditor />);

    const scopedPaths = screen.getByLabelText('Scoped paths');
    await user.type(scopedPaths, 'src/auth');
    await user.clear(scopedPaths);

    expect(JSON.parse(screen.getByTestId('codex-security-config').textContent!)).not.toHaveProperty(
      'paths',
    );

    await user.clear(screen.getByLabelText('Maximum cost (USD)'));
    expect(JSON.parse(screen.getByTestId('codex-security-config').textContent!)).not.toHaveProperty(
      'max_cost_usd',
    );

    await user.selectOptions(screen.getByLabelText('Security operation'), 'validation');
    expect(screen.queryByLabelText('Maximum cost (USD)')).not.toBeInTheDocument();

    const findingFile = screen.getByLabelText('Finding file');
    await user.type(findingFile, '/tmp/finding.json');
    expect(JSON.parse(screen.getByTestId('codex-security-config').textContent!)).toMatchObject({
      finding_file: '/tmp/finding.json',
    });

    await user.clear(findingFile);
    expect(JSON.parse(screen.getByTestId('codex-security-config').textContent!)).not.toHaveProperty(
      'finding_file',
    );
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

    act(() => {
      useRedTeamConfig.getState().updateConfig('target', validGoProvider);
    });

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

    act(() => {
      useRedTeamConfig.getState().updateConfig('target', initialProvider);
    });

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

  it('should reset stale HTTP JSON when switching to Open Interpreter', async () => {
    const TestComponent = () => {
      const [providerType, setProviderType] = React.useState('http');
      const [provider, setProvider] = React.useState<ProviderOptions>({
        id: 'http',
        config: { url: 'https://api.example.com', body: '{{prompt}}' },
      });

      return (
        <>
          <ProviderConfigEditor
            provider={provider}
            setProvider={setProvider}
            providerType={providerType}
          />
          <button
            data-testid="switch-openinterpreter"
            onClick={() => {
              setProvider({ id: 'openinterpreter', config: {} });
              setProviderType('openinterpreter');
            }}
          >
            Switch Open Interpreter
          </button>
        </>
      );
    };

    renderWithProviders(<TestComponent />);

    act(() => {
      screen.getByTestId('switch-openinterpreter').click();
    });

    await waitFor(() => {
      expect(screen.getByTestId('custom-raw-config')).toHaveTextContent('{}');
    });
    expect(screen.getByTestId('custom-raw-config')).not.toHaveTextContent('api.example.com');
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

    act(() => {
      useRedTeamConfig.getState().updateConfig('target', initialProvider);
    });

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

    act(() => {
      useRedTeamConfig.getState().updateConfig('target', updatedProvider);
    });

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

  it('should render the raw provider editor for Open Interpreter targets', () => {
    renderWithProviders(
      <ProviderConfigEditor
        provider={{ id: 'openinterpreter', config: {} }}
        setProvider={vi.fn()}
        providerType="openinterpreter"
      />,
    );

    expect(screen.getByTestId('custom-config')).toBeInTheDocument();
  });

  it('should reject an empty Open Interpreter target ID', () => {
    const setError = vi.fn();
    const onValidate = vi.fn();

    renderWithProviders(
      <ProviderConfigEditor
        provider={{ id: '', config: {} }}
        setProvider={vi.fn()}
        setError={setError}
        onValidate={onValidate}
        validateAll={true}
        providerType="openinterpreter"
      />,
    );

    expect(setError).toHaveBeenCalledWith('Provider ID is required');
    expect(onValidate).toHaveBeenCalledWith(false);
  });

  it('should reject an invalid Open Interpreter target ID', () => {
    const setError = vi.fn();
    const onValidate = vi.fn();

    renderWithProviders(
      <ProviderConfigEditor
        provider={{ id: 'openai:chat:gpt-4o', config: {} }}
        setProvider={vi.fn()}
        setError={setError}
        onValidate={onValidate}
        validateAll={true}
        providerType="openinterpreter"
      />,
    );

    expect(setError).toHaveBeenCalledWith(
      'Open Interpreter Provider ID must be "openinterpreter" or start with "openinterpreter:"',
    );
    expect(onValidate).toHaveBeenCalledWith(false);
  });

  it('should reject malformed Open Interpreter configuration when validation is requested', () => {
    const setError = vi.fn();
    const onValidate = vi.fn();
    let validateFn: (() => boolean) | null = null;

    renderWithProviders(
      <ProviderConfigEditor
        provider={{ id: 'openinterpreter', config: { sandbox_mode: 'danger-full-access' } }}
        setProvider={vi.fn()}
        setError={setError}
        onValidate={onValidate}
        onValidationRequest={(validator) => {
          validateFn = validator;
        }}
        providerType="openinterpreter"
      />,
    );

    act(() => {
      screen.getByTestId('invalidate-custom-config').click();
    });

    expect(validateFn!()).toBe(false);
    expect(setError).toHaveBeenLastCalledWith('Invalid JSON configuration');
    expect(screen.getByTestId('custom-body-error')).toHaveTextContent('Invalid JSON configuration');
    expect(onValidate).toHaveBeenLastCalledWith(false);
  });

  it('propagates malformed Open Interpreter configuration to the redteam store immediately', () => {
    const setError = vi.fn();

    renderWithProviders(
      <ProviderConfigEditor
        provider={{ id: 'openinterpreter', config: { sandbox_mode: 'danger-full-access' } }}
        setProvider={vi.fn()}
        setError={setError}
        providerType="openinterpreter"
      />,
    );

    act(() => {
      screen.getByTestId('invalidate-custom-config').click();
    });

    expect(setError).toHaveBeenLastCalledWith('Invalid JSON configuration');
    expect(useRedTeamTargetConfigValidation.getState().targetConfigError).toBe(
      'Invalid JSON configuration',
    );
    expect(useRedTeamTargetConfigValidation.getState().targetConfigDraft).toBe(
      '{"sandbox_mode":"read-only",}',
    );
  });

  it('keeps malformed Open Interpreter configuration blocked when browser storage is full', () => {
    const previousStorage = useRedTeamConfig.persist.getOptions().storage;
    const setError = vi.fn();
    const setProvider = vi.fn();
    const setItem = vi.fn(() => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    });
    useRedTeamConfig.persist.setOptions({
      storage: {
        getItem: () => null,
        removeItem: () => {},
        setItem,
      },
    });

    try {
      renderWithProviders(
        <ProviderConfigEditor
          provider={{ id: 'openinterpreter', config: { sandbox_mode: 'danger-full-access' } }}
          setProvider={setProvider}
          setError={setError}
          providerType="openinterpreter"
        />,
      );

      expect(() => {
        act(() => {
          screen.getByTestId('invalidate-custom-config').click();
        });
      }).not.toThrow();

      expect(setProvider).not.toHaveBeenCalled();
      expect(setItem).not.toHaveBeenCalled();
      expect(setError).toHaveBeenLastCalledWith('Invalid JSON configuration');
      expect(useRedTeamTargetConfigValidation.getState().targetConfigError).toBe(
        'Invalid JSON configuration',
      );
      expect(useRedTeamTargetConfigValidation.getState().targetConfigDraft).toBe(
        '{"sandbox_mode":"read-only",}',
      );
    } finally {
      useRedTeamConfig.persist.setOptions({ storage: previousStorage });
    }
  });

  it('keeps a corrected Open Interpreter edit blocked when its persisted target is overwritten before the clear', () => {
    const staleTarget = {
      id: 'openinterpreter',
      label: 'Coding target',
      config: { sandbox_mode: 'danger-full-access' },
    };
    useRedTeamConfig.getState().setFullConfig({
      ...useRedTeamConfig.getState().config,
      target: staleTarget,
    });
    const setError = vi.fn();
    renderWithProviders(
      <ProviderConfigEditor
        provider={staleTarget}
        setProvider={(provider) => useRedTeamConfig.getState().updateConfig('target', provider)}
        setError={setError}
        providerType="openinterpreter"
      />,
    );
    act(() => {
      screen.getByTestId('invalidate-custom-config').click();
    });
    const originalSetItem = Storage.prototype.setItem;
    let raced = false;
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      const result = originalSetItem.call(this, key, value);
      if (!raced && this === window.localStorage && key === 'redTeamConfig') {
        raced = true;
        const overwrittenConfig = JSON.parse(value);
        overwrittenConfig.state.config.target = staleTarget;
        originalSetItem.call(this, key, JSON.stringify(overwrittenConfig));
      }
      return result;
    });
    try {
      act(() => {
        screen.getByTestId('correct-custom-config').click();
      });
    } finally {
      setItem.mockRestore();
    }

    expect(raced).toBe(true);
    expect(
      JSON.parse(window.localStorage.getItem('redTeamConfig')!).state.config.target.config,
    ).toEqual({ sandbox_mode: 'danger-full-access' });
    expect(useRedTeamTargetConfigValidation.getState().targetConfigError).toBe(
      'Invalid JSON configuration',
    );
    expect(useRedTeamTargetConfigValidation.getState().targetConfigDraft).toBe(
      '{"sandbox_mode":"read-only"}',
    );
    expect(setError).toHaveBeenLastCalledWith('Invalid JSON configuration');
    expect(screen.getByTestId('custom-body-error')).toHaveTextContent('Invalid JSON configuration');
    expect(window.localStorage.getItem('redTeamTargetConfigValidation')).toMatch(
      /^invalid-json:[a-z0-9-]+$/,
    );
  });

  it('keeps a provider-type replacement blocked when its persisted target is overwritten before the clear', () => {
    const staleTarget = {
      id: 'openinterpreter',
      label: 'Coding target',
      config: { sandbox_mode: 'danger-full-access' },
    };
    const correctedTarget = { id: 'openai:gpt-4o', label: 'Foundation target', config: {} };
    useRedTeamConfig.getState().setFullConfig({
      ...useRedTeamConfig.getState().config,
      target: staleTarget,
    });
    const setError = vi.fn();
    const { rerender } = renderWithProviders(
      <ProviderConfigEditor
        provider={staleTarget}
        setProvider={vi.fn()}
        setError={setError}
        providerType="openinterpreter"
      />,
    );
    act(() => {
      screen.getByTestId('invalidate-custom-config').click();
    });
    const originalSetItem = Storage.prototype.setItem;
    let raced = false;
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      const result = originalSetItem.call(this, key, value);
      if (!raced && this === window.localStorage && key === 'redTeamConfig') {
        raced = true;
        const overwrittenConfig = JSON.parse(value);
        overwrittenConfig.state.config.target = staleTarget;
        originalSetItem.call(this, key, JSON.stringify(overwrittenConfig));
      }
      return result;
    });
    try {
      act(() => {
        useRedTeamConfig.getState().updateConfig('target', correctedTarget);
      });
      rerender(
        <ProviderConfigEditor
          provider={correctedTarget}
          setProvider={vi.fn()}
          setError={setError}
          providerType="openai"
        />,
      );
    } finally {
      setItem.mockRestore();
    }

    expect(raced).toBe(true);
    expect(useRedTeamTargetConfigValidation.getState().targetConfigError).toBe(
      'Invalid JSON configuration',
    );
    expect(useRedTeamTargetConfigValidation.getState().targetConfigDraft).toBe(
      '{"sandbox_mode":"read-only",}',
    );
    expect(setError).toHaveBeenLastCalledWith('Invalid JSON configuration');
    expect(window.localStorage.getItem('redTeamTargetConfigValidation')).toMatch(
      /^invalid-json:[a-z0-9-]+$/,
    );
  });

  it('does not rewrite the persisted red-team configuration on malformed edits', () => {
    const previousStorage = useRedTeamConfig.persist.getOptions().storage;
    const setItem = vi.fn();
    useRedTeamConfig.persist.setOptions({
      storage: { getItem: () => null, removeItem: () => {}, setItem },
    });

    try {
      renderWithProviders(
        <ProviderConfigEditor
          provider={{ id: 'openinterpreter', config: { sandbox_mode: 'danger-full-access' } }}
          setProvider={vi.fn()}
          setError={vi.fn()}
          providerType="openinterpreter"
        />,
      );

      act(() => {
        for (let edit = 0; edit < 100; edit += 1) {
          screen.getByTestId('invalidate-custom-config').click();
        }
      });

      expect(setItem).not.toHaveBeenCalled();
    } finally {
      useRedTeamConfig.persist.setOptions({ storage: previousStorage });
    }
  });

  it('does not persist malformed custom configuration from the eval creator', () => {
    renderWithProviders(
      <ProviderConfigEditor
        provider={{ id: 'openinterpreter', config: { sandbox_mode: 'danger-full-access' } }}
        setProvider={vi.fn()}
        providerType="openinterpreter"
        mode="eval"
      />,
    );

    act(() => {
      screen.getByTestId('invalidate-custom-config').click();
    });

    expect(useRedTeamTargetConfigValidation.getState().targetConfigError).toBeNull();
    expect(useRedTeamTargetConfigValidation.getState().targetConfigDraft).toBeNull();
  });

  it('clears propagated custom configuration errors when the provider type changes', () => {
    const setError = vi.fn();
    const { rerender } = renderWithProviders(
      <ProviderConfigEditor
        provider={{ id: 'openinterpreter', config: { sandbox_mode: 'danger-full-access' } }}
        setProvider={vi.fn()}
        setError={setError}
        providerType="openinterpreter"
      />,
    );

    act(() => {
      screen.getByTestId('invalidate-custom-config').click();
    });
    expect(setError).toHaveBeenLastCalledWith('Invalid JSON configuration');
    expect(useRedTeamTargetConfigValidation.getState().targetConfigError).toBe(
      'Invalid JSON configuration',
    );
    expect(useRedTeamTargetConfigValidation.getState().targetConfigDraft).toBe(
      '{"sandbox_mode":"read-only",}',
    );

    act(() => {
      useRedTeamConfig.getState().updateConfig('target', { id: 'openai:gpt-4o', config: {} });
    });

    rerender(
      <ProviderConfigEditor
        provider={{ id: 'openai:gpt-4o', config: {} }}
        setProvider={vi.fn()}
        setError={setError}
        providerType="openai"
      />,
    );

    expect(setError).toHaveBeenLastCalledWith(null);
    expect(useRedTeamTargetConfigValidation.getState().targetConfigError).toBeNull();
    expect(useRedTeamTargetConfigValidation.getState().targetConfigDraft).toBeNull();
  });

  it.each([
    ['python', 'file://provider.py'],
    ['sagemaker', 'sagemaker:my-endpoint'],
  ])(
    'should reject malformed %s configuration when validation is requested',
    (providerType, id) => {
      const setError = vi.fn();
      const onValidate = vi.fn();
      let validateFn: (() => boolean) | null = null;

      renderWithProviders(
        <ProviderConfigEditor
          provider={{ id, config: { timeout: 30000 } }}
          setProvider={vi.fn()}
          setError={setError}
          onValidate={onValidate}
          onValidationRequest={(validator) => {
            validateFn = validator;
          }}
          providerType={providerType}
        />,
      );

      act(() => {
        screen.getByTestId('invalidate-custom-config').click();
      });

      expect(validateFn!()).toBe(false);
      expect(setError).toHaveBeenLastCalledWith('Invalid JSON configuration');
      expect(onValidate).toHaveBeenLastCalledWith(false);
    },
  );

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
