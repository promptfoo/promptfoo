import React from 'react';

import { createTheme, ThemeProvider } from '@mui/material/styles';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CommonConfigurationOptions from './CommonConfigurationOptions';
import type { ProviderOptions } from '@promptfoo/types';

vi.mock('./ExtensionEditor', () => ({
  default: () => <div data-testid="mock-extension-editor" />,
}));

const renderWithTheme = (ui: React.ReactElement) => {
  const theme = createTheme();
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);
};

describe('CommonConfigurationOptions', () => {
  it('should call updateCustomTarget with the correct delay value and display it in the input', () => {
    const updateCustomTarget = vi.fn();
    const initialTarget: ProviderOptions = { id: 'test-provider', config: {} };

    const { rerender } = renderWithTheme(
      <CommonConfigurationOptions
        selectedTarget={initialTarget}
        updateCustomTarget={updateCustomTarget}
      />,
    );

    const accordionButton = screen.getByRole('button', { name: /delay/i });
    fireEvent.click(accordionButton);

    const delayInput = screen.getByRole('spinbutton');
    expect(delayInput).toBeInTheDocument();

    fireEvent.change(delayInput, { target: { value: '500' } });

    expect(updateCustomTarget).toHaveBeenCalledTimes(1);
    expect(updateCustomTarget).toHaveBeenCalledWith('delay', 500);

    const updatedTarget: ProviderOptions = { ...initialTarget, delay: 500 };
    rerender(
      <CommonConfigurationOptions
        selectedTarget={updatedTarget}
        updateCustomTarget={updateCustomTarget}
      />,
    );

    expect(screen.getByRole('spinbutton')).toHaveValue(500);
  });

  it('should display the correct helper text for the delay input field', () => {
    const selectedTarget: ProviderOptions = { id: 'test-provider', config: {} };
    const updateCustomTarget = vi.fn();

    renderWithTheme(
      <CommonConfigurationOptions
        selectedTarget={selectedTarget}
        updateCustomTarget={updateCustomTarget}
      />,
    );

    const accordionButton = screen.getByRole('button', { name: /delay/i });
    fireEvent.click(accordionButton);

    const helperText = screen.getByText('Delay in milliseconds (default: 0)');
    expect(helperText).toBeInTheDocument();
  });

  it('should handle undefined/null values from BaseNumberInput onChange', async () => {
    const updateCustomTarget = vi.fn();
    const initialTarget: ProviderOptions = { id: 'test-provider', delay: 100, config: {} };

    renderWithTheme(
      <CommonConfigurationOptions
        selectedTarget={initialTarget}
        updateCustomTarget={updateCustomTarget}
      />,
    );

    const accordionButton = screen.getByRole('button', { name: /delay/i });
    fireEvent.click(accordionButton);

    const delayInput = await screen.findByDisplayValue('100');

    fireEvent.change(delayInput, { target: { value: '' } });

    expect(updateCustomTarget).toHaveBeenCalledWith('delay', undefined);
  });

  it('should call updateCustomTarget with the correct decimal delay value when a decimal is entered', () => {
    const updateCustomTarget = vi.fn();
    const initialTarget: ProviderOptions = { id: 'test-provider', config: {} };

    renderWithTheme(
      <CommonConfigurationOptions
        selectedTarget={initialTarget}
        updateCustomTarget={updateCustomTarget}
      />,
    );

    const accordionButton = screen.getByRole('button', { name: /delay/i });
    fireEvent.click(accordionButton);

    const delayInput = screen.getByRole('spinbutton');
    expect(delayInput).toBeInTheDocument();

    fireEvent.change(delayInput, { target: { value: '250.5' } });

    expect(updateCustomTarget).toHaveBeenCalledTimes(1);
    expect(updateCustomTarget).toHaveBeenCalledWith('delay', 250.5);
  });

  it('should call onValidationChange when ExtensionEditor reports validation errors', () => {
    const onValidationChange = vi.fn();
    const initialTarget: ProviderOptions = { id: 'test-provider', config: {} };

    vi.mock('./ExtensionEditor', () => ({
      default: ({
        onValidationChange: editorOnValidationChange,
      }: {
        onValidationChange?: (hasErrors: boolean) => void;
      }) => {
        React.useEffect(() => {
          editorOnValidationChange?.(true);
        }, [editorOnValidationChange]);

        return <div data-testid="mock-extension-editor" />;
      },
    }));

    renderWithTheme(
      <CommonConfigurationOptions
        selectedTarget={initialTarget}
        updateCustomTarget={vi.fn()}
        onValidationChange={onValidationChange}
      />,
    );

    expect(onValidationChange).toHaveBeenCalledTimes(1);
    expect(onValidationChange).toHaveBeenCalledWith(true);
  });
});
