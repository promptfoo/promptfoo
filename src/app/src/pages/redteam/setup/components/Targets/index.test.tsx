import React from 'react';

import { TooltipProvider } from '@app/components/ui/tooltip';
import { useTelemetry } from '@app/hooks/useTelemetry';
import { callApi } from '@app/utils/api';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_HTTP_TARGET, useRedTeamConfig } from '../../hooks/useRedTeamConfig';
import CustomTargetConfiguration from './CustomTargetConfiguration';
import Targets from './index';

import type { ProviderOptions } from '../../types';

vi.mock('react-simple-code-editor', () => ({
  default: ({ value, onValueChange }: any) => (
    <textarea
      data-testid="code-editor"
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
    />
  ),
}));
vi.mock('../../hooks/useRedTeamConfig');
vi.mock('@app/hooks/useTelemetry');
vi.mock('@app/utils/api');
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
vi.mock('@app/hooks/useToast', () => ({
  useToast: () => ({
    showToast: vi.fn(),
  }),
}));
vi.mock('./ProviderEditor', async () => {
  const React = await import('react');
  const { callApi } = await import('@app/utils/api');

  const makeHttpTarget = (provider: ProviderOptions): ProviderOptions => ({
    id: 'http',
    label: provider.label ?? '',
    config: {
      url: '',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '{{prompt}}' }),
    },
  });

  const makeWebSocketTarget = (provider: ProviderOptions): ProviderOptions => ({
    id: 'websocket',
    label: provider.label ?? '',
    config: {
      url: 'wss://example.com/ws',
    },
  });

  return {
    default: ({
      provider,
      setProvider,
      onTargetTested,
      onSessionTested,
    }: {
      provider: ProviderOptions | undefined;
      setProvider: (provider: ProviderOptions) => void;
      onTargetTested?: (success: boolean) => void;
      onSessionTested?: (success: boolean) => void;
    }) => {
      const [targetMessage, setTargetMessage] = React.useState('');
      const [sessionMessage, setSessionMessage] = React.useState('');

      if (!provider) {
        return null;
      }

      const isHttp = provider.id === 'http';
      const isWebSocket = provider.id === 'websocket';
      const canTestTarget = isHttp
        ? provider.config.request === undefined
          ? Boolean(provider.config.url?.trim())
          : Boolean(provider.config.request?.trim())
        : true;

      const runTargetTest = async () => {
        const response = await callApi('/providers/test', {
          method: 'POST',
          body: JSON.stringify({ providerOptions: provider }),
        });
        const data = await response.json();
        setTargetMessage(data.testResult?.message || '');
        onTargetTested?.(Boolean(data.testResult?.success));
      };

      const runSessionTest = async () => {
        const response = await callApi('/providers/test', {
          method: 'POST',
          body: JSON.stringify({ providerOptions: provider }),
        });
        const data = await response.json();
        setSessionMessage(data.message || '');
        onSessionTested?.(Boolean(data.success));
      };

      return (
        <div>
          <button
            type="button"
            role="button"
            onClick={() => setProvider(makeWebSocketTarget(provider))}
          >
            WebSocket
          </button>
          <button type="button" role="button" onClick={() => setProvider(makeHttpTarget(provider))}>
            HTTP/HTTPS Endpoint
          </button>

          <label htmlFor="provider-name">Provider Name</label>
          <input
            id="provider-name"
            value={provider.label ?? ''}
            onChange={(event) => {
              setProvider({
                ...provider,
                label: event.target.value,
              });
            }}
          />

          {isWebSocket && (
            <>
              <label htmlFor="websocket-url">WebSocket URL</label>
              <input
                id="websocket-url"
                value={provider.config.url ?? ''}
                onChange={(event) => {
                  setProvider({
                    ...provider,
                    config: {
                      ...provider.config,
                      url: event.target.value,
                    },
                  });
                }}
              />
            </>
          )}

          <div>Test Target Configuration</div>
          <button type="button" onClick={runTargetTest} disabled={!canTestTarget}>
            Test Target
          </button>
          {targetMessage && <div>{targetMessage}</div>}

          <div>Test Session Configuration</div>
          <button type="button" onClick={runSessionTest}>
            Test Session
          </button>
          {sessionMessage && <div>{sessionMessage}</div>}
        </div>
      );
    },
  };
});
vi.mock('../PageWrapper', () => ({
  default: ({
    children,
    onNext,
    onBack,
    nextDisabled,
  }: {
    children: React.ReactNode;
    onNext: () => void;
    onBack: () => void;
    nextDisabled: boolean;
  }) => (
    <div>
      {children}
      <button onClick={onBack}>Back</button>
      <button onClick={onNext} disabled={nextDisabled}>
        Next
      </button>
    </div>
  ),
}));

const renderWithProviders = (ui: React.ReactElement) => {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
};

describe('CustomTargetConfiguration - Config Field Handling', () => {
  let mockUpdateCustomTarget: (field: string, value: unknown) => void;
  let mockSetRawConfigJson: (value: string) => void;

  const defaultProps = {
    selectedTarget: {
      id: 'custom',
      config: { temperature: 0.5 },
      label: 'Custom Target',
    },
    rawConfigJson: JSON.stringify({ temperature: 0.5 }, null, 2),
    bodyError: null,
  };

  beforeEach(() => {
    mockUpdateCustomTarget = vi.fn();
    mockSetRawConfigJson = vi.fn();
  });

  it('should call updateCustomTarget with "config" field when JSON is edited', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <CustomTargetConfiguration
        {...defaultProps}
        updateCustomTarget={mockUpdateCustomTarget}
        setRawConfigJson={mockSetRawConfigJson}
      />,
    );

    // The Editor component renders a textarea for input
    // Find the JSON editor container and get the textarea inside it
    const configLabel = screen.getByText('Configuration (JSON)');
    const editorContainer = configLabel.closest('.space-y-2');
    const configTextarea = editorContainer?.querySelector('textarea');
    expect(configTextarea).toBeTruthy();

    const newConfig = { temperature: 0.7, max_tokens: 100 };
    const newConfigJson = JSON.stringify(newConfig, null, 2);

    await user.click(configTextarea!);
    await user.keyboard('{Control>}a{/Control}');
    await user.paste(newConfigJson);

    // Verify that setRawConfigJson is called with the new JSON string
    expect(mockSetRawConfigJson).toHaveBeenCalledWith(newConfigJson);

    // Verify that updateCustomTarget is called with 'config' field and the parsed object
    expect(mockUpdateCustomTarget).toHaveBeenCalledWith('config', newConfig);
  });

  it('should handle invalid JSON without calling updateCustomTarget', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <CustomTargetConfiguration
        {...defaultProps}
        updateCustomTarget={mockUpdateCustomTarget}
        setRawConfigJson={mockSetRawConfigJson}
      />,
    );

    // Find the JSON editor textarea
    const configLabel = screen.getByText('Configuration (JSON)');
    const editorContainer = configLabel.closest('.space-y-2');
    const configTextarea = editorContainer?.querySelector('textarea');
    expect(configTextarea).toBeTruthy();

    const invalidJson = '{ invalid json }';

    await user.click(configTextarea!);
    await user.keyboard('{Control>}a{/Control}');
    await user.paste(invalidJson);

    // Should still call setRawConfigJson to update the display
    expect(mockSetRawConfigJson).toHaveBeenCalledWith(invalidJson);

    // Should NOT call updateCustomTarget since JSON parsing failed
    expect(mockUpdateCustomTarget).not.toHaveBeenCalled();
  });

  it('should show error state when bodyError is provided', () => {
    renderWithProviders(
      <CustomTargetConfiguration
        {...defaultProps}
        updateCustomTarget={mockUpdateCustomTarget}
        setRawConfigJson={mockSetRawConfigJson}
        bodyError="Invalid JSON format"
      />,
    );

    // Error message should be displayed in an Alert
    expect(screen.getByText('Invalid JSON format')).toBeInTheDocument();

    // The editor container should have destructive border styling
    const configLabel = screen.getByText('Configuration (JSON)');
    const editorSection = configLabel.closest('.space-y-2');
    const editorContainer = editorSection?.querySelector('.border-destructive');
    expect(editorContainer).toBeTruthy();
  });

  it('should update target ID when changed', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <CustomTargetConfiguration
        {...defaultProps}
        updateCustomTarget={mockUpdateCustomTarget}
        setRawConfigJson={mockSetRawConfigJson}
      />,
    );

    const targetIdInput = screen.getByRole('textbox', { name: /Target ID/i });
    const newId = 'openai:chat:gpt-4o';

    await user.click(targetIdInput);
    await user.keyboard('{Control>}a{/Control}');
    await user.paste(newId);

    expect(mockUpdateCustomTarget).toHaveBeenCalledWith('id', newId);
  });
});

describe('updateCustomTarget function behavior', () => {
  it('should update the config field correctly', () => {
    // This test documents the expected behavior of the updateCustomTarget function
    // when handling the 'config' field specifically

    const mockSelectedTarget = {
      id: 'custom',
      config: { temperature: 0.5 },
      label: 'Custom Target',
    };

    // Simulate the updateCustomTarget function logic for the 'config' field
    const updateCustomTarget = (field: string, value: any) => {
      const updatedTarget = { ...mockSelectedTarget };

      if (field === 'config') {
        // This is the fix: replace entire config object instead of nesting
        updatedTarget.config = value;
      } else {
        // For other fields, add to config
        (updatedTarget.config as any)[field] = value;
      }

      return updatedTarget;
    };

    // Test the fix: updating config field should replace, not nest
    const newConfig = { temperature: 0.7, max_tokens: 100 };
    const result = updateCustomTarget('config', newConfig);

    expect(result.config).toEqual(newConfig);
    expect(result.config).not.toHaveProperty('config'); // No nesting
  });
});

describe('Targets Component', () => {
  let mockUpdateConfig: (section: string, value: unknown) => void;
  let mockRecordEvent: (eventName: string, properties?: Record<string, unknown>) => void;
  let mockOnNext: () => void;
  let mockOnBack: () => void;
  let mockCallApi: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockUpdateConfig = vi.fn();
    mockRecordEvent = vi.fn();
    mockOnNext = vi.fn();
    mockOnBack = vi.fn();
    mockCallApi = vi.fn();

    (useTelemetry as any).mockReturnValue({
      recordEvent: mockRecordEvent,
    });

    (callApi as any).mockImplementation(mockCallApi);

    // Clear all mocks before each test
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Clean up after each test
    vi.clearAllMocks();
  });

  describe('HTTP Target Configuration', () => {
    it('should enable the Next button only when HTTP target has valid URL and both tests pass', async () => {
      const user = userEvent.setup();
      (useRedTeamConfig as any).mockReturnValue({
        config: {
          target: {
            ...DEFAULT_HTTP_TARGET,
            label: 'My Test API',
            config: {
              url: 'https://my.api.com/chat',
            },
          },
          plugins: [],
          strategies: [],
        },
        updateConfig: mockUpdateConfig,
      });

      // Mock successful test responses
      mockCallApi.mockResolvedValue({
        ok: true,
        json: async () => ({
          testResult: {
            success: true,
            message: 'Test passed!',
          },
          providerResponse: {},
        }),
      });

      renderWithProviders(<Targets onNext={mockOnNext} onBack={mockOnBack} />);

      // Initially Next button should be disabled (tests not completed)
      const nextButton = screen.getAllByRole('button', { name: /Next/i })[0];
      expect(nextButton).toBeDisabled();

      // Test the target configuration
      const testTargetButton = screen.getByRole('button', { name: /Test Target/i });
      await user.click(testTargetButton);

      await waitFor(() => {
        expect(screen.getByText('Test passed!')).toBeInTheDocument();
      });

      // Still disabled - need session test too
      expect(nextButton).toBeDisabled();

      // For sessions test, mock the session test endpoint
      mockCallApi.mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          message: 'Session test passed!',
        }),
      });

      // Test the session configuration
      const testSessionButton = screen.getByRole('button', { name: /Test Session/i });
      await user.click(testSessionButton);

      await waitFor(() => {
        expect(screen.getByText('Session test passed!')).toBeInTheDocument();
      });

      // Now Next button should be enabled
      await waitFor(() => {
        expect(nextButton).not.toBeDisabled();
      });

      await user.click(nextButton);
      expect(mockOnNext).toHaveBeenCalledTimes(1);
    });

    it('should require URL for HTTP target before enabling tests', () => {
      (useRedTeamConfig as any).mockReturnValue({
        config: {
          target: {
            ...DEFAULT_HTTP_TARGET,
            label: 'My Test API',
            config: {
              url: '', // Empty URL
            },
          },
          plugins: [],
          strategies: [],
        },
        updateConfig: mockUpdateConfig,
      });

      renderWithProviders(<Targets onNext={mockOnNext} onBack={mockOnBack} />);

      // Test buttons should be disabled when URL is empty
      const testTargetButton = screen.getByRole('button', { name: /Test Target/i });
      expect(testTargetButton).toBeDisabled();

      const nextButton = screen.getAllByRole('button', { name: /Next/i })[0];
      expect(nextButton).toBeDisabled();
    });

    it('should show appropriate warning messages for HTTP target validation', () => {
      (useRedTeamConfig as any).mockReturnValue({
        config: {
          target: {
            ...DEFAULT_HTTP_TARGET,
            label: 'My Test API',
            config: {
              url: 'https://my.api.com/chat',
            },
          },
          plugins: [],
          strategies: [],
        },
        updateConfig: mockUpdateConfig,
      });

      renderWithProviders(<Targets onNext={mockOnNext} onBack={mockOnBack} />);

      // The next button should be disabled and should show warning message in the UI
      const nextButton = screen.getAllByRole('button', { name: /Next/i })[0];
      expect(nextButton).toBeDisabled();

      // Check for warning message displayed in UI about testing requirements
      expect(screen.getByText(/Test Target Configuration/i)).toBeInTheDocument();
      expect(screen.getByText(/Test Session Configuration/i)).toBeInTheDocument();
    });

    it('should handle HTTP target with raw request mode', async () => {
      const user = userEvent.setup();
      (useRedTeamConfig as any).mockReturnValue({
        config: {
          target: {
            ...DEFAULT_HTTP_TARGET,
            label: 'My Test API',
            config: {
              request: `POST /api/chat HTTP/1.1
Host: api.example.com
Content-Type: application/json

{"message": "{{prompt}}"}`,
            },
          },
          plugins: [],
          strategies: [],
        },
        updateConfig: mockUpdateConfig,
      });

      // Mock successful test responses
      mockCallApi.mockResolvedValue({
        ok: true,
        json: async () => ({
          testResult: {
            success: true,
            message: 'Test passed!',
          },
          providerResponse: {},
        }),
      });

      renderWithProviders(<Targets onNext={mockOnNext} onBack={mockOnBack} />);

      // Test the target configuration
      const testTargetButton = screen.getByRole('button', { name: /Test Target/i });
      expect(testTargetButton).not.toBeDisabled();

      await user.click(testTargetButton);

      await waitFor(() => {
        expect(screen.getByText('Test passed!')).toBeInTheDocument();
      });
    });
  });

  describe('WebSocket Target Configuration', () => {
    it("should allow the user to select the 'websocket' target, enter a valid WebSocket URL, and enable the Next button when all required fields are present", async () => {
      const user = userEvent.setup();
      (useRedTeamConfig as any).mockReturnValue({
        config: {
          target: {
            id: 'http',
            label: '',
            config: {},
          },
          plugins: [],
          strategies: [],
        },
        updateConfig: mockUpdateConfig,
      });

      renderWithProviders(<Targets onNext={mockOnNext} onBack={mockOnBack} />);

      // Provider list is always expanded - select WebSocket
      const websocketProviderCard = screen.getByText('WebSocket').closest('[role="button"]');
      await user.click(websocketProviderCard!);

      const webSocketURLInput = screen.getByLabelText(/WebSocket URL/i);
      await user.click(webSocketURLInput);
      await user.keyboard('{Control>}a{/Control}');
      await user.paste('wss://example.com/ws');

      const targetNameInput = screen.getByLabelText(/Provider Name/i);
      await user.click(targetNameInput);
      await user.keyboard('{Control>}a{/Control}');
      await user.paste('My WebSocket Target');

      const nextButton = screen.getAllByRole('button', { name: /Next/i })[0];
      await waitFor(() => {
        expect(nextButton).not.toBeDisabled();
      });

      await user.click(nextButton);
      expect(mockOnNext).toHaveBeenCalledTimes(1);
    });

    it('should require WebSocket URL before enabling Next button', () => {
      (useRedTeamConfig as any).mockReturnValue({
        config: {
          target: {
            id: 'websocket',
            label: 'WebSocket Provider',
            config: {
              url: '', // Empty URL
            },
          },
          plugins: [],
          strategies: [],
        },
        updateConfig: mockUpdateConfig,
      });

      renderWithProviders(<Targets onNext={mockOnNext} onBack={mockOnBack} />);

      const nextButton = screen.getAllByRole('button', { name: /Next/i })[0];
      expect(nextButton).toBeDisabled();
    });
  });

  describe('Test Result Handling', () => {
    it('should call handleTestTarget and display a success message when the user tests a valid HTTP target configuration', async () => {
      const user = userEvent.setup();
      const validHttpTarget = {
        ...DEFAULT_HTTP_TARGET,
        label: 'My Valid HTTP Target',
        config: {
          ...DEFAULT_HTTP_TARGET.config,
          url: 'https://example.com/api',
        },
      };

      (useRedTeamConfig as any).mockReturnValue({
        config: {
          target: validHttpTarget,
          plugins: [],
          strategies: [],
        },
        updateConfig: mockUpdateConfig,
      });

      // Reset the mock to ensure clean state
      mockCallApi.mockReset();
      mockCallApi.mockResolvedValue({
        ok: true,
        json: async () => ({
          testResult: {
            success: true,
            message: 'Target configuration is valid!',
          },
          providerResponse: {},
        }),
      });

      renderWithProviders(<Targets onNext={mockOnNext} onBack={mockOnBack} />);

      const testTargetButton = screen.getByRole('button', { name: /Test Target/i });
      await user.click(testTargetButton);

      // Wait for the API call to complete
      await waitFor(() => {
        expect(screen.getByText('Target configuration is valid!')).toBeInTheDocument();
      });

      // Check that API was called
      expect(callApi).toHaveBeenCalled();
      expect(callApi).toHaveBeenCalledWith(
        '/providers/test',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ providerOptions: validHttpTarget }),
        }),
      );
    });
  });

  describe('Provider Switching', () => {
    it('should reset error states when switching from an HTTP target with validation errors to another target type', async () => {
      const user = userEvent.setup();
      (useRedTeamConfig as any).mockReturnValue({
        config: {
          target: {
            ...DEFAULT_HTTP_TARGET,
            config: {
              ...DEFAULT_HTTP_TARGET.config,
              url: 'invalid-url',
            },
          },
          plugins: [],
          strategies: [],
        },
        updateConfig: mockUpdateConfig,
      });

      renderWithProviders(<Targets onNext={mockOnNext} onBack={mockOnBack} />);

      // Provider list is always expanded - select WebSocket
      const websocketProviderCard = screen.getByText('WebSocket').closest('[role="button"]');
      await user.click(websocketProviderCard!);

      await waitFor(() => {
        expect(mockUpdateConfig).toHaveBeenCalledWith(
          'target',
          expect.objectContaining({
            id: 'websocket',
            config: expect.objectContaining({
              url: 'wss://example.com/ws', // Default WebSocket config has placeholder URL
            }),
          }),
        );
      });
    });

    it('should enable Next button for WebSocket provider when it has valid URL', async () => {
      const user = userEvent.setup();
      // Start with WebSocket provider that has valid URL
      (useRedTeamConfig as any).mockReturnValue({
        config: {
          target: {
            id: 'websocket',
            label: 'WebSocket Target',
            config: { url: 'wss://api.example.com' },
          },
          plugins: [],
          strategies: [],
        },
        updateConfig: mockUpdateConfig,
      });

      renderWithProviders(<Targets onNext={mockOnNext} onBack={mockOnBack} />);

      // For WebSocket, Next button should be enabled with valid URL
      const nextButton = screen.getAllByRole('button', { name: /Next/i })[0];
      await waitFor(() => {
        expect(nextButton).not.toBeDisabled();
      });

      // Provider list is always expanded - switch to HTTP provider
      const httpProviderCard = screen.getByText('HTTP/HTTPS Endpoint').closest('[role="button"]');
      await user.click(httpProviderCard!);

      // For HTTP, Next button should be disabled until tests pass
      await waitFor(() => {
        const updatedNextButton = screen.getAllByRole('button', { name: /Next/i })[0];
        expect(updatedNextButton).toBeDisabled();
      });
    });
  });

  describe('Navigation', () => {
    it('should preserve configuration when navigating back and forth', async () => {
      const user = userEvent.setup();
      const targetConfig = {
        ...DEFAULT_HTTP_TARGET,
        label: 'My API',
        config: {
          url: 'https://api.example.com',
        },
      };

      (useRedTeamConfig as any).mockReturnValue({
        config: {
          target: targetConfig,
          plugins: [],
          strategies: [],
        },
        updateConfig: mockUpdateConfig,
      });

      renderWithProviders(<Targets onNext={mockOnNext} onBack={mockOnBack} />);

      // Click Back button
      const backButton = screen.getAllByRole('button', { name: /Back/i })[0];
      await user.click(backButton);
      expect(mockOnBack).toHaveBeenCalledTimes(1);

      // Verify that updateConfig was called to preserve the target
      expect(mockUpdateConfig).toHaveBeenCalledWith('target', targetConfig);
    });
  });
});
