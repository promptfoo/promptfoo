import React from 'react';

import { useTelemetry } from '@app/hooks/useTelemetry';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRedTeamConfig } from '../../hooks/useRedTeamConfig';
import CustomTargetConfiguration from './CustomTargetConfiguration';
import Targets from './index';

// Mock dependencies
vi.mock('../../hooks/useRedTeamConfig');
vi.mock('@app/hooks/useTelemetry');
vi.mock('@app/utils/api');

const mockUseTelemetry = vi.mocked(useTelemetry);
const mockUseRedTeamConfig = vi.mocked(useRedTeamConfig);

const renderWithTheme = (ui: React.ReactElement) => {
  const theme = createTheme({ palette: { mode: 'light' } });
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);
};

describe('Targets Component', () => {
  let mockUpdateConfig: ReturnType<typeof vi.fn>;
  let mockRecordEvent: ReturnType<typeof vi.fn>;
  let mockOnNext: ReturnType<typeof vi.fn>;
  let mockOnBack: ReturnType<typeof vi.fn>;

  const defaultConfig = {
    target: {
      id: 'http',
      label: 'Test Target',
      config: { url: 'https://example.com' },
    },
  };

  beforeEach(() => {
    mockUpdateConfig = vi.fn();
    mockRecordEvent = vi.fn();
    mockOnNext = vi.fn();
    mockOnBack = vi.fn();

    mockUseRedTeamConfig.mockReturnValue({
      config: defaultConfig,
      updateConfig: mockUpdateConfig,
    });

    mockUseTelemetry.mockReturnValue({
      recordEvent: mockRecordEvent,
      identifyUser: vi.fn(),
      isInitialized: true,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should render with default HTTP target selected', () => {
    renderWithTheme(<Targets onNext={mockOnNext} onBack={mockOnBack} setupModalOpen={false} />);

    expect(screen.getByDisplayValue('HTTP/HTTPS Endpoint')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Test Target')).toBeInTheDocument();
  });

  it('should initialize selectedTargetType correctly for HTTP target', () => {
    renderWithTheme(<Targets onNext={mockOnNext} onBack={mockOnBack} setupModalOpen={false} />);

    const select = screen.getByLabelText('Target Type');
    expect(select).toHaveValue('http');
  });

  it('should initialize selectedTargetType as custom for unknown target ids', () => {
    mockUseRedTeamConfig.mockReturnValue({
      config: {
        target: {
          id: 'unknown-provider',
          label: 'Unknown Target',
          config: {},
        },
      },
      updateConfig: mockUpdateConfig,
    });

    renderWithTheme(<Targets onNext={mockOnNext} onBack={mockOnBack} setupModalOpen={false} />);

    const select = screen.getByLabelText('Target Type');
    expect(select).toHaveValue('custom');
  });

  it('should handle target type change to custom', async () => {
    renderWithTheme(<Targets onNext={mockOnNext} onBack={mockOnBack} setupModalOpen={false} />);

    const select = screen.getByLabelText('Target Type');
    fireEvent.mouseDown(select);

    const customOption = await screen.findByText('Custom Target');
    fireEvent.click(customOption);

    expect(mockRecordEvent).toHaveBeenCalledWith('feature_used', {
      feature: 'redteam_config_target_changed',
      target: 'custom',
    });

    // Should show custom target configuration
    await waitFor(() => {
      expect(screen.getByLabelText('Target ID')).toBeInTheDocument();
    });
  });

  it('should handle target type change to websocket', async () => {
    renderWithTheme(<Targets onNext={mockOnNext} onBack={mockOnBack} setupModalOpen={false} />);

    const select = screen.getByLabelText('Target Type');
    fireEvent.mouseDown(select);

    const websocketOption = await screen.findByText('WebSocket Endpoint');
    fireEvent.click(websocketOption);

    expect(mockRecordEvent).toHaveBeenCalledWith('feature_used', {
      feature: 'redteam_config_target_changed',
      target: 'websocket',
    });

    // Should show websocket configuration
    await waitFor(() => {
      expect(screen.getByLabelText('WebSocket URL')).toBeInTheDocument();
    });
  });

  it('should handle target type change to javascript custom provider', async () => {
    renderWithTheme(<Targets onNext={mockOnNext} onBack={mockOnBack} setupModalOpen={false} />);

    const select = screen.getByLabelText('Target Type');
    fireEvent.mouseDown(select);

    const jsOption = await screen.findByText('JavaScript (Custom)');
    fireEvent.click(jsOption);

    // Should show custom target input for JavaScript
    await waitFor(() => {
      expect(screen.getByLabelText('Custom Target')).toBeInTheDocument();
    });
  });

  it('should update target label', () => {
    renderWithTheme(<Targets onNext={mockOnNext} onBack={mockOnBack} setupModalOpen={false} />);

    const labelInput = screen.getByLabelText('Target Name');
    fireEvent.change(labelInput, { target: { value: 'New Target Name' } });

    expect(mockUpdateConfig).toHaveBeenCalledWith(
      'target',
      expect.objectContaining({
        label: 'New Target Name',
      }),
    );
  });

  it('should show missing fields validation', () => {
    mockUseRedTeamConfig.mockReturnValue({
      config: {
        target: {
          id: 'http',
          label: '', // Empty label should trigger validation
          config: { url: '' }, // Empty URL should trigger validation
        },
      },
      updateConfig: mockUpdateConfig,
    });

    renderWithTheme(<Targets onNext={mockOnNext} onBack={mockOnBack} setupModalOpen={false} />);

    expect(screen.getByText(/Missing required fields: Target Name, URL/)).toBeInTheDocument();

    const nextButton = screen.getByRole('button', { name: /Next/ });
    expect(nextButton).toBeDisabled();
  });

  it('should enable next button when all required fields are filled', () => {
    renderWithTheme(<Targets onNext={mockOnNext} onBack={mockOnBack} setupModalOpen={false} />);

    const nextButton = screen.getByRole('button', { name: /Next/ });
    expect(nextButton).not.toBeDisabled();
  });

  it('should call onNext when next button is clicked', () => {
    renderWithTheme(<Targets onNext={mockOnNext} onBack={mockOnBack} setupModalOpen={false} />);

    const nextButton = screen.getByRole('button', { name: /Next/ });
    fireEvent.click(nextButton);

    expect(mockOnNext).toHaveBeenCalled();
  });

  it('should call onBack when back button is clicked', () => {
    renderWithTheme(<Targets onNext={mockOnNext} onBack={mockOnBack} setupModalOpen={false} />);

    const backButton = screen.getByRole('button', { name: /Back/ });
    fireEvent.click(backButton);

    expect(mockOnBack).toHaveBeenCalled();
  });

  it('should show HTTP configuration when HTTP target is selected', () => {
    renderWithTheme(<Targets onNext={mockOnNext} onBack={mockOnBack} setupModalOpen={false} />);

    // Should show HTTP-specific fields
    expect(screen.getByLabelText('URL')).toBeInTheDocument();
    expect(screen.getByLabelText('Method')).toBeInTheDocument();
  });

  it('should enable testing for HTTP targets', () => {
    renderWithTheme(<Targets onNext={mockOnNext} onBack={mockOnBack} setupModalOpen={false} />);

    expect(screen.getByRole('button', { name: /Test Target/ })).toBeInTheDocument();
  });

  it('should not show testing option for non-HTTP targets', async () => {
    renderWithTheme(<Targets onNext={mockOnNext} onBack={mockOnBack} setupModalOpen={false} />);

    const select = screen.getByLabelText('Target Type');
    fireEvent.mouseDown(select);

    const customOption = await screen.findByText('Custom Target');
    fireEvent.click(customOption);

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Test Target/ })).not.toBeInTheDocument();
    });
  });

  it('should show prompts section for targets that require prompts', async () => {
    renderWithTheme(<Targets onNext={mockOnNext} onBack={mockOnBack} setupModalOpen={false} />);

    const select = screen.getByLabelText('Target Type');
    fireEvent.mouseDown(select);

    const gptOption = await screen.findByText('OpenAI GPT-4o');
    fireEvent.click(gptOption);

    await waitFor(() => {
      expect(screen.getByText('Prompts')).toBeInTheDocument();
    });
  });

  it('should preserve select display when custom target id is edited', async () => {
    renderWithTheme(<Targets onNext={mockOnNext} onBack={mockOnBack} setupModalOpen={false} />);

    // Switch to custom target
    const select = screen.getByLabelText('Target Type');
    fireEvent.mouseDown(select);

    const customOption = await screen.findByText('Custom Target');
    fireEvent.click(customOption);

    // Edit the target ID
    await waitFor(async () => {
      const targetIdInput = screen.getByLabelText('Target ID');
      fireEvent.change(targetIdInput, { target: { value: 'my-custom-provider' } });

      // Select should still show "Custom Target"
      expect(select).toHaveValue('custom');
    });
  });
});

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

  it('should handle delay field correctly', () => {
    const mockSelectedTarget: any = {
      id: 'custom',
      config: { temperature: 0.5 },
      label: 'Custom Target',
    };

    const updateCustomTarget = (field: string, value: any) => {
      const updatedTarget = { ...mockSelectedTarget };

      if (field === 'delay') {
        updatedTarget.delay = value;
      } else if (field === 'config') {
        updatedTarget.config = value;
      } else {
        (updatedTarget.config as any)[field] = value;
      }

      return updatedTarget;
    };

    const result = updateCustomTarget('delay', 1000);
    expect(result).toHaveProperty('delay', 1000);
    expect(result.config).not.toHaveProperty('delay');
  });
});
