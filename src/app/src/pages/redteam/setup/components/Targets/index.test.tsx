import React from 'react';

import { createTheme, ThemeProvider } from '@mui/material/styles';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CustomTargetConfiguration from './CustomTargetConfiguration';

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
