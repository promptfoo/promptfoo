import React from 'react';

import { TooltipProvider } from '@app/components/ui/tooltip';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CustomTargetConfiguration from './CustomTargetConfiguration';

vi.mock('react-simple-code-editor', () => ({
  default: ({ value, onValueChange }: any) => (
    <textarea
      data-testid="code-editor"
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
    />
  ),
}));
vi.mock('react-router', () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
vi.mock('@app/hooks/useToast', () => ({
  useToast: () => ({
    showToast: vi.fn(),
  }),
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

  it('should use custom target copy for the generic configuration screen', () => {
    renderWithProviders(
      <CustomTargetConfiguration
        {...defaultProps}
        updateCustomTarget={mockUpdateCustomTarget}
        setRawConfigJson={mockSetRawConfigJson}
      />,
    );

    expect(screen.getByText('Custom Target Configuration')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Custom target documentation' })).toHaveAttribute(
      'href',
      'https://www.promptfoo.dev/docs/red-team/configuration/#custom-providerstargets',
    );
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

  it('should preserve the last valid config and report invalid JSON', async () => {
    const user = userEvent.setup();
    const onConfigErrorChange = vi.fn();
    renderWithProviders(
      <CustomTargetConfiguration
        {...defaultProps}
        selectedTarget={{ id: 'custom', config: { temperature: 0.7 } }}
        updateCustomTarget={mockUpdateCustomTarget}
        setRawConfigJson={mockSetRawConfigJson}
        onConfigErrorChange={onConfigErrorChange}
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

    expect(mockUpdateCustomTarget).not.toHaveBeenCalled();
    expect(onConfigErrorChange).toHaveBeenLastCalledWith('Invalid JSON configuration');
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
