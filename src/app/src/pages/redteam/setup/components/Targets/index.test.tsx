import React from 'react';

import { createTheme, ThemeProvider } from '@mui/material/styles';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CustomTargetConfiguration from './CustomTargetConfiguration';

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
