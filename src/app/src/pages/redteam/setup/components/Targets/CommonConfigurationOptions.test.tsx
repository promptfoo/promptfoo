import React from 'react';

import { TooltipProvider } from '@app/components/ui/tooltip';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CommonConfigurationOptions from './CommonConfigurationOptions';

vi.mock('./ExtensionEditor', () => ({
  default: ({
    extensions,
    onExtensionsChange,
    onValidationChange,
  }: {
    extensions: string[];
    onExtensionsChange?: (extensions: string[]) => void;
    onValidationChange?: (hasErrors: boolean) => void;
  }) => {
    // Simulate validation error on mount to test passthrough
    React.useEffect(() => {
      onValidationChange?.(true);
    }, [onValidationChange]);

    return (
      <div
        data-testid="mock-extension-editor"
        data-extensions={JSON.stringify(extensions)}
        onClick={() => onExtensionsChange?.(['file://new-extension.js:hook'])}
      />
    );
  },
}));

const renderWithProviders = (ui: React.ReactElement) => {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
};

describe('CommonConfigurationOptions', () => {
  it('should render the ExtensionEditor component', () => {
    renderWithProviders(<CommonConfigurationOptions />);

    expect(screen.getByTestId('mock-extension-editor')).toBeInTheDocument();
  });

  it('should pass extensions to ExtensionEditor', () => {
    const extensions = ['file://test.js:testHook'];

    renderWithProviders(<CommonConfigurationOptions extensions={extensions} />);

    const editor = screen.getByTestId('mock-extension-editor');
    expect(editor).toHaveAttribute('data-extensions', JSON.stringify(extensions));
  });

  it('should call onValidationChange when ExtensionEditor reports validation errors', () => {
    const onValidationChange = vi.fn();

    renderWithProviders(<CommonConfigurationOptions onValidationChange={onValidationChange} />);

    expect(onValidationChange).toHaveBeenCalledTimes(1);
    expect(onValidationChange).toHaveBeenCalledWith(true);
  });

  it('should call onExtensionsChange when ExtensionEditor updates extensions', () => {
    const onExtensionsChange = vi.fn();

    renderWithProviders(<CommonConfigurationOptions onExtensionsChange={onExtensionsChange} />);

    const editor = screen.getByTestId('mock-extension-editor');
    editor.click();

    expect(onExtensionsChange).toHaveBeenCalledWith(['file://new-extension.js:hook']);
  });
});
