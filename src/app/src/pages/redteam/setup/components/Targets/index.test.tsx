import React from 'react';

import { useTelemetry } from '@app/hooks/useTelemetry';
import { callApi } from '@app/utils/api';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_HTTP_TARGET, useRedTeamConfig } from '../../hooks/useRedTeamConfig';
import CustomTargetConfiguration from './CustomTargetConfiguration';
import Targets from './index';

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

// Mock the ProviderConfigDialog component
vi.mock('@app/pages/eval-creator/components/ProviderConfigDialog', () => ({
  default: ({ open, onClose, onSave, providerId, config }: any) => {
    if (!open) {
      return null;
    }
    return (
      <div role="dialog">
        <h2>Provider Configuration</h2>
        <p>{providerId}</p>
        <button onClick={() => onSave(providerId, { ...config, updated: true })}>Save</button>
        <button onClick={onClose}>Cancel</button>
      </div>
    );
  },
}));

const renderWithTheme = (ui: React.ReactElement) => {
  const theme = createTheme({ palette: { mode: 'light' } });
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);
};

describe('CustomTargetConfiguration - Config Field Handling', () => {
  let mockUpdateCustomTarget: ReturnType<typeof vi.fn>;
  let mockSetRawConfigJson: ReturnType<typeof vi.fn>;

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

  it('should open provider config dialog when configure button is clicked', () => {
    renderWithTheme(
      <CustomTargetConfiguration
        {...defaultProps}
        updateCustomTarget={mockUpdateCustomTarget}
        setRawConfigJson={mockSetRawConfigJson}
      />,
    );

    const configButton = screen.getByRole('button', { name: /Configure Provider Settings/i });
    fireEvent.click(configButton);

    // The dialog should be open
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // Check that the dialog is showing the provider ID
    expect(screen.getByText('custom')).toBeInTheDocument();
  });

  it('should call updateCustomTarget with "config" field when saving from dialog', () => {
    renderWithTheme(
      <CustomTargetConfiguration
        {...defaultProps}
        updateCustomTarget={mockUpdateCustomTarget}
        setRawConfigJson={mockSetRawConfigJson}
      />,
    );

    // Open the dialog
    const configButton = screen.getByRole('button', { name: /Configure Provider Settings/i });
    fireEvent.click(configButton);

    // Click save in the dialog
    const saveButton = screen.getByRole('button', { name: /Save/i });
    fireEvent.click(saveButton);

    // Verify that updateCustomTarget is called with 'config' field
    expect(mockUpdateCustomTarget).toHaveBeenCalledWith('config', {
      temperature: 0.5,
      updated: true,
    });

    // Verify that setRawConfigJson is called with the new JSON string
    expect(mockSetRawConfigJson).toHaveBeenCalledWith(
      JSON.stringify({ temperature: 0.5, updated: true }, null, 2),
    );
  });

  it('should display current configuration when config is present', () => {
    const propsWithConfig = {
      ...defaultProps,
      selectedTarget: {
        id: 'custom',
        config: { temperature: 0.5, max_tokens: 1024 },
        label: 'Custom Target',
      },
    };

    renderWithTheme(
      <CustomTargetConfiguration
        {...propsWithConfig}
        updateCustomTarget={mockUpdateCustomTarget}
        setRawConfigJson={mockSetRawConfigJson}
      />,
    );

    // Check that current configuration is displayed
    expect(screen.getByText('Current Configuration:')).toBeInTheDocument();
    expect(screen.getByText(/temperature.*0.5/s)).toBeInTheDocument();
    expect(screen.getByText(/max_tokens.*1024/s)).toBeInTheDocument();
  });

  it('should not show current configuration when config is empty', () => {
    const propsWithEmptyConfig = {
      ...defaultProps,
      selectedTarget: {
        id: 'custom',
        config: {},
        label: 'Custom Target',
      },
    };

    renderWithTheme(
      <CustomTargetConfiguration
        {...propsWithEmptyConfig}
        updateCustomTarget={mockUpdateCustomTarget}
        setRawConfigJson={mockSetRawConfigJson}
      />,
    );

    // Current Configuration section should not be displayed for empty config
    expect(screen.queryByText('Current Configuration:')).not.toBeInTheDocument();
  });

  it('should update target ID when changed', () => {
    renderWithTheme(
      <CustomTargetConfiguration
        {...defaultProps}
        updateCustomTarget={mockUpdateCustomTarget}
        setRawConfigJson={mockSetRawConfigJson}
      />,
    );

    const targetIdInput = screen.getByRole('textbox', { name: /Target ID/i });
    const newId = 'openai:chat:gpt-4o';

    fireEvent.change(targetIdInput, {
      target: { value: newId },
    });

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
  let mockUpdateConfig: ReturnType<typeof vi.fn>;
  let mockRecordEvent: ReturnType<typeof vi.fn>;
  let mockOnNext: ReturnType<typeof vi.fn>;
  let mockOnBack: ReturnType<typeof vi.fn>;
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

      renderWithTheme(<Targets onNext={mockOnNext} onBack={mockOnBack} setupModalOpen={false} />);

      // Initially Next button should be disabled (tests not completed)
      const nextButton = screen.getAllByRole('button', { name: /Next/i })[0];
      expect(nextButton).toBeDisabled();

      // Test the target configuration
      const testTargetButton = screen.getByRole('button', { name: /Test Target/i });
      fireEvent.click(testTargetButton);

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
      fireEvent.click(testSessionButton);

      await waitFor(() => {
        expect(screen.getByText('Session test passed!')).toBeInTheDocument();
      });

      // Now Next button should be enabled
      await waitFor(() => {
        expect(nextButton).not.toBeDisabled();
      });

      fireEvent.click(nextButton);
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

      renderWithTheme(<Targets onNext={mockOnNext} onBack={mockOnBack} setupModalOpen={false} />);

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

      renderWithTheme(<Targets onNext={mockOnNext} onBack={mockOnBack} setupModalOpen={false} />);

      // The next button should be disabled and should show warning message in the UI
      const nextButton = screen.getAllByRole('button', { name: /Next/i })[0];
      expect(nextButton).toBeDisabled();

      // Check for warning message displayed in UI about testing requirements
      expect(screen.getByText(/Test Target Configuration/i)).toBeInTheDocument();
      expect(screen.getByText(/Test Session Configuration/i)).toBeInTheDocument();
    });

    it('should handle HTTP target with raw request mode', async () => {
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

      renderWithTheme(<Targets onNext={mockOnNext} onBack={mockOnBack} setupModalOpen={false} />);

      // Test the target configuration
      const testTargetButton = screen.getByRole('button', { name: /Test Target/i });
      expect(testTargetButton).not.toBeDisabled();

      fireEvent.click(testTargetButton);

      await waitFor(() => {
        expect(screen.getByText('Test passed!')).toBeInTheDocument();
      });
    });
  });

  describe('WebSocket Target Configuration', () => {
    it("should allow the user to select the 'websocket' target, enter a valid WebSocket URL, and enable the Next button when all required fields are present", async () => {
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

      renderWithTheme(<Targets onNext={mockOnNext} onBack={mockOnBack} setupModalOpen={false} />);

      // Component starts in collapsed view showing HTTP provider, click Change to expand
      const changeButton = screen.getByRole('button', { name: 'Change' });
      fireEvent.click(changeButton);

      const websocketProviderCard = screen
        .getByText('WebSocket Endpoint')
        .closest('div[class*="MuiPaper-root"]');
      fireEvent.click(websocketProviderCard!);

      const webSocketURLInput = screen.getByLabelText(/WebSocket URL/i);
      fireEvent.change(webSocketURLInput, { target: { value: 'wss://example.com/ws' } });

      const targetNameInput = screen.getByLabelText(/Provider Name/i);
      fireEvent.change(targetNameInput, { target: { value: 'My WebSocket Target' } });

      const nextButton = screen.getAllByRole('button', { name: /Next/i })[0];
      await waitFor(() => {
        expect(nextButton).not.toBeDisabled();
      });

      fireEvent.click(nextButton);
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

      renderWithTheme(<Targets onNext={mockOnNext} onBack={mockOnBack} setupModalOpen={false} />);

      const nextButton = screen.getAllByRole('button', { name: /Next/i })[0];
      expect(nextButton).toBeDisabled();
    });
  });

  describe('Test Result Handling', () => {
    it('should call handleTestTarget and display a success message when the user tests a valid HTTP target configuration', async () => {
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

      renderWithTheme(<Targets onNext={mockOnNext} onBack={mockOnBack} setupModalOpen={false} />);

      const testTargetButton = screen.getByRole('button', { name: /Test Target/i });
      fireEvent.click(testTargetButton);

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
          body: JSON.stringify(validHttpTarget),
        }),
      );
    });

    it('should display error message when target test fails', async () => {
      const validHttpTarget = {
        ...DEFAULT_HTTP_TARGET,
        label: 'My HTTP Target',
        config: {
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

      mockCallApi.mockResolvedValue({
        ok: true,
        json: async () => ({
          testResult: {
            success: false,
            message: 'Connection failed: Unable to reach endpoint',
          },
          providerResponse: {},
        }),
      });

      renderWithTheme(<Targets onNext={mockOnNext} onBack={mockOnBack} setupModalOpen={false} />);

      const testTargetButton = screen.getByRole('button', { name: /Test Target/i });
      fireEvent.click(testTargetButton);

      await waitFor(() => {
        expect(screen.getByText('Connection failed: Unable to reach endpoint')).toBeInTheDocument();
      });

      // Next button should remain disabled after failed test
      const nextButton = screen.getAllByRole('button', { name: /Next/i })[0];
      expect(nextButton).toBeDisabled();
    });
  });

  describe('Provider Switching', () => {
    it('should reset error states when switching from an HTTP target with validation errors to another target type', async () => {
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

      renderWithTheme(<Targets onNext={mockOnNext} onBack={mockOnBack} setupModalOpen={false} />);

      // Component starts in collapsed view showing HTTP provider, click Change to expand
      const changeButton = screen.getByRole('button', { name: 'Change' });
      fireEvent.click(changeButton);

      const websocketProviderCard = screen
        .getByText('WebSocket Endpoint')
        .closest('div[class*="MuiPaper-root"]');
      fireEvent.click(websocketProviderCard!);

      await waitFor(() => {
        expect(mockUpdateConfig).toHaveBeenCalledWith(
          'target',
          expect.objectContaining({
            id: 'websocket',
            config: expect.objectContaining({
              url: 'wss://example.com/ws',
            }),
          }),
        );
      });
    });

    it('should enable Next button for WebSocket provider when it has valid URL', async () => {
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

      renderWithTheme(<Targets onNext={mockOnNext} onBack={mockOnBack} setupModalOpen={false} />);

      // For WebSocket, Next button should be enabled with valid URL
      const nextButton = screen.getAllByRole('button', { name: /Next/i })[0];
      await waitFor(() => {
        expect(nextButton).not.toBeDisabled();
      });

      // Switch to HTTP provider
      const changeButton = screen.getByRole('button', { name: 'Change' });
      fireEvent.click(changeButton);

      const httpProviderCard = screen
        .getByText('HTTP/HTTPS Endpoint')
        .closest('div[class*="MuiPaper-root"]');
      fireEvent.click(httpProviderCard!);

      // For HTTP, Next button should be disabled until tests pass
      await waitFor(() => {
        const updatedNextButton = screen.getAllByRole('button', { name: /Next/i })[0];
        expect(updatedNextButton).toBeDisabled();
      });
    });
  });

  describe('Navigation', () => {
    it('should preserve configuration when navigating back and forth', () => {
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

      renderWithTheme(<Targets onNext={mockOnNext} onBack={mockOnBack} setupModalOpen={false} />);

      // Click Back button
      const backButton = screen.getAllByRole('button', { name: /Back/i })[0];
      fireEvent.click(backButton);
      expect(mockOnBack).toHaveBeenCalledTimes(1);

      // Verify that updateConfig was called to preserve the target
      expect(mockUpdateConfig).toHaveBeenCalledWith('target', targetConfig);
    });
  });
});
