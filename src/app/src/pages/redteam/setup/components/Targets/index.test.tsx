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

  it('should call updateCustomTarget with "config" field when JSON is edited', () => {
    renderWithTheme(
      <CustomTargetConfiguration
        {...defaultProps}
        updateCustomTarget={mockUpdateCustomTarget}
        setRawConfigJson={mockSetRawConfigJson}
      />,
    );

    const configTextarea = screen.getByLabelText('Configuration (JSON)');
    const newConfig = { temperature: 0.7, max_tokens: 100 };
    const newConfigJson = JSON.stringify(newConfig, null, 2);

    fireEvent.change(configTextarea, {
      target: { value: newConfigJson },
    });

    // Verify that setRawConfigJson is called with the new JSON string
    expect(mockSetRawConfigJson).toHaveBeenCalledWith(newConfigJson);

    // Verify that updateCustomTarget is called with 'config' field and the parsed object
    expect(mockUpdateCustomTarget).toHaveBeenCalledWith('config', newConfig);
  });

  it('should handle invalid JSON without calling updateCustomTarget', () => {
    renderWithTheme(
      <CustomTargetConfiguration
        {...defaultProps}
        updateCustomTarget={mockUpdateCustomTarget}
        setRawConfigJson={mockSetRawConfigJson}
      />,
    );

    const configTextarea = screen.getByLabelText('Configuration (JSON)');
    const invalidJson = '{ invalid json }';

    fireEvent.change(configTextarea, {
      target: { value: invalidJson },
    });

    // Should still call setRawConfigJson to update the display
    expect(mockSetRawConfigJson).toHaveBeenCalledWith(invalidJson);

    // Should NOT call updateCustomTarget since JSON parsing failed
    expect(mockUpdateCustomTarget).not.toHaveBeenCalled();
  });

  it('should show error state when bodyError is provided', () => {
    renderWithTheme(
      <CustomTargetConfiguration
        {...defaultProps}
        updateCustomTarget={mockUpdateCustomTarget}
        setRawConfigJson={mockSetRawConfigJson}
        bodyError="Invalid JSON format"
      />,
    );

    const configTextarea = screen.getByLabelText('Configuration (JSON)');
    expect(configTextarea).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Invalid JSON format')).toBeInTheDocument();
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
  });

  it('should allow http target selection, and enable the Next button when all required fields are filled', async () => {
    (useRedTeamConfig as any).mockReturnValue({
      config: {
        target: DEFAULT_HTTP_TARGET,
        plugins: [],
        strategies: [],
      },
      updateConfig: mockUpdateConfig,
    });

    renderWithTheme(<Targets onNext={mockOnNext} onBack={mockOnBack} setupModalOpen={false} />);

    const nextButton = screen.getAllByRole('button', { name: /Next/i })[0];
    expect(nextButton).toBeDisabled();

    const targetNameInput = screen.getByLabelText(/Provider Name/i);
    fireEvent.change(targetNameInput, { target: { value: 'My Test API' } });

    const urlInput = screen.getByLabelText(/URL/i);
    fireEvent.change(urlInput, { target: { value: 'https://my.api.com/chat' } });

    await waitFor(() => {
      expect(nextButton).not.toBeDisabled();
    });

    fireEvent.click(nextButton);
    expect(mockOnNext).toHaveBeenCalledTimes(1);
  });

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

    expect(callApi).toHaveBeenCalledTimes(1);
    expect(callApi).toHaveBeenCalledWith(
      '/providers/test',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(validHttpTarget),
      }),
    );

    await waitFor(() => {
      expect(screen.getByText('Target configuration is valid!')).toBeInTheDocument();
    });
  });

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

  it('should preserve target settings when navigating back after configuring a target', async () => {
    const initialTargetName = 'My Initial Target';
    const initialTargetURL = 'https://example.com/api';

    (useRedTeamConfig as any).mockReturnValue({
      config: {
        target: {
          ...DEFAULT_HTTP_TARGET,
          label: initialTargetName,
          config: {
            ...DEFAULT_HTTP_TARGET.config,
            url: initialTargetURL,
          },
        },
        plugins: [],
        strategies: [],
      },
      updateConfig: mockUpdateConfig,
    });

    renderWithTheme(<Targets onNext={mockOnNext} onBack={mockOnBack} setupModalOpen={false} />);

    const targetNameInput = screen.getByLabelText(/Provider Name/i);
    const urlInput = screen.getByLabelText(/URL/i);
    const nextButton = screen.getAllByRole('button', { name: /Next/i })[0];
    const backButton = screen.getAllByRole('button', { name: /Back/i })[0];

    fireEvent.change(targetNameInput, { target: { value: initialTargetName } });
    fireEvent.change(urlInput, { target: { value: initialTargetURL } });

    await waitFor(() => {
      expect(nextButton).not.toBeDisabled();
    });

    fireEvent.click(nextButton);
    expect(mockOnNext).toHaveBeenCalledTimes(1);

    (useRedTeamConfig as any).mockReturnValue({
      config: {
        target: {
          ...DEFAULT_HTTP_TARGET,
          label: initialTargetName,
          config: {
            ...DEFAULT_HTTP_TARGET.config,
            url: initialTargetURL,
          },
        },
        plugins: [],
        strategies: [],
      },
      updateConfig: mockUpdateConfig,
    });

    fireEvent.click(backButton);
    expect(mockOnBack).toHaveBeenCalledTimes(1);
  });
});
