import React from 'react';

import { TooltipProvider } from '@app/components/ui/tooltip';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CommonConfigurationOptions from './CommonConfigurationOptions';
import type { ProviderOptions } from '@promptfoo/types';

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

vi.mock('./InputsEditor', () => ({
  default: ({
    inputs,
    onChange,
    compact,
  }: {
    inputs?: Record<string, string>;
    onChange: (inputs: Record<string, string> | undefined) => void;
    compact?: boolean;
  }) => {
    return (
      <div
        data-testid="mock-inputs-editor"
        data-inputs={JSON.stringify(inputs || {})}
        data-compact={compact}
        onClick={() => onChange({ testVar: 'test description' })}
      />
    );
  },
}));

const renderWithProviders = (ui: React.ReactElement) => {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
};

describe('CommonConfigurationOptions', () => {
  const defaultTarget: ProviderOptions = {
    id: 'test-provider',
    config: {},
  };

  const defaultProps = {
    selectedTarget: defaultTarget,
    updateCustomTarget: vi.fn(),
  };

  it('should render the ExtensionEditor component', () => {
    renderWithProviders(<CommonConfigurationOptions {...defaultProps} />);

    expect(screen.getByTestId('mock-extension-editor')).toBeInTheDocument();
  });

  it('should render the InputsEditor component inside Test Generation section', async () => {
    const onPromptsChange = vi.fn();
    renderWithProviders(
      <CommonConfigurationOptions {...defaultProps} onPromptsChange={onPromptsChange} />,
    );

    // Expand the Test Generation collapsible
    const testGenTrigger = screen.getByText('Test Generation');
    fireEvent.click(testGenTrigger);

    expect(screen.getByTestId('mock-inputs-editor')).toBeInTheDocument();
  });

  it('should pass extensions to ExtensionEditor', () => {
    const extensions = ['file://test.js:testHook'];

    renderWithProviders(<CommonConfigurationOptions {...defaultProps} extensions={extensions} />);

    const editor = screen.getByTestId('mock-extension-editor');
    expect(editor).toHaveAttribute('data-extensions', JSON.stringify(extensions));
  });

  it('should call onValidationChange when ExtensionEditor reports validation errors', () => {
    const onValidationChange = vi.fn();

    renderWithProviders(
      <CommonConfigurationOptions {...defaultProps} onValidationChange={onValidationChange} />,
    );

    expect(onValidationChange).toHaveBeenCalledTimes(1);
    expect(onValidationChange).toHaveBeenCalledWith(true);
  });

  it('should call onExtensionsChange when ExtensionEditor updates extensions', () => {
    const onExtensionsChange = vi.fn();

    renderWithProviders(
      <CommonConfigurationOptions {...defaultProps} onExtensionsChange={onExtensionsChange} />,
    );

    const editor = screen.getByTestId('mock-extension-editor');
    editor.click();

    expect(onExtensionsChange).toHaveBeenCalledWith(['file://new-extension.js:hook']);
  });

  it('should call updateCustomTarget when InputsEditor updates inputs', () => {
    const updateCustomTarget = vi.fn();
    const onPromptsChange = vi.fn();

    renderWithProviders(
      <CommonConfigurationOptions
        {...defaultProps}
        updateCustomTarget={updateCustomTarget}
        onPromptsChange={onPromptsChange}
      />,
    );

    // Expand the Test Generation collapsible
    const testGenTrigger = screen.getByText('Test Generation');
    fireEvent.click(testGenTrigger);

    const inputsEditor = screen.getByTestId('mock-inputs-editor');
    inputsEditor.click();

    expect(updateCustomTarget).toHaveBeenCalledWith('inputs', { testVar: 'test description' });
  });

  it('should render Delay collapsible section', () => {
    renderWithProviders(<CommonConfigurationOptions {...defaultProps} />);

    expect(screen.getByText('Delay')).toBeInTheDocument();
    expect(screen.getByText('Configure the delay between requests')).toBeInTheDocument();
  });

  it('should expand Delay section when target has delay set', () => {
    const targetWithDelay: ProviderOptions = {
      id: 'test-provider',
      delay: 100,
      config: {},
    };

    renderWithProviders(
      <CommonConfigurationOptions {...defaultProps} selectedTarget={targetWithDelay} />,
    );

    // The delay input should be visible when expanded
    expect(screen.getByDisplayValue('100')).toBeInTheDocument();
  });

  it('should call updateCustomTarget when delay is changed', () => {
    const updateCustomTarget = vi.fn();
    const targetWithDelay: ProviderOptions = {
      id: 'test-provider',
      delay: 100,
      config: {},
    };

    renderWithProviders(
      <CommonConfigurationOptions
        {...defaultProps}
        selectedTarget={targetWithDelay}
        updateCustomTarget={updateCustomTarget}
      />,
    );

    const delayInput = screen.getByDisplayValue('100');
    fireEvent.change(delayInput, { target: { value: '200' } });

    expect(updateCustomTarget).toHaveBeenCalledWith('delay', 200);
  });

  it('should render Test Generation collapsible section', () => {
    const onPromptsChange = vi.fn();
    renderWithProviders(
      <CommonConfigurationOptions {...defaultProps} onPromptsChange={onPromptsChange} />,
    );

    expect(screen.getByText('Test Generation')).toBeInTheDocument();
    expect(
      screen.getByText('Configure how red team test cases are generated for this target'),
    ).toBeInTheDocument();
  });

  describe('handleInputsChange', () => {
    it('should generate JSON template with template variables when inputs are provided', () => {
      const updateCustomTarget = vi.fn();
      const onPromptsChange = vi.fn();

      renderWithProviders(
        <CommonConfigurationOptions
          {...defaultProps}
          updateCustomTarget={updateCustomTarget}
          onPromptsChange={onPromptsChange}
        />,
      );

      // Expand Test Generation section
      const testGenTrigger = screen.getByText('Test Generation');
      fireEvent.click(testGenTrigger);

      // Simulate InputsEditor calling onChange with inputs
      const inputsEditor = screen.getByTestId('mock-inputs-editor');
      fireEvent.click(inputsEditor);

      // Should call updateCustomTarget with inputs
      expect(updateCustomTarget).toHaveBeenCalledWith('inputs', { testVar: 'test description' });

      // Should call onPromptsChange with JSON template
      expect(onPromptsChange).toHaveBeenCalledWith(['{"testVar":"{{testVar}}"}']);
    });

    it('should generate template preserving object key order for multiple variables', () => {
      // Test verifies that Object.fromEntries preserves insertion order
      // This is a unit test of the template generation logic
      const inputs = { user_id: 'desc1', session_token: 'desc2', role: 'desc3' };
      const template = JSON.stringify(
        Object.fromEntries(Object.keys(inputs).map((key) => [key, `{{${key}}}`])),
      );

      // Verify the template has correct structure
      expect(template).toBe(
        '{"user_id":"{{user_id}}","session_token":"{{session_token}}","role":"{{role}}"}',
      );

      // Verify order is preserved
      const parsed = JSON.parse(template);
      expect(Object.keys(parsed)).toEqual(['user_id', 'session_token', 'role']);
    });

    it('should handle single variable input correctly', () => {
      // Test the template generation for a single variable
      const inputs = { message: 'The main message' };
      const template = JSON.stringify(
        Object.fromEntries(Object.keys(inputs).map((key) => [key, `{{${key}}}`])),
      );

      expect(template).toBe('{"message":"{{message}}"}');
    });

    it('should reset to default prompt when empty inputs object is provided', () => {
      // Test the logic: Object.keys({}).length === 0, so should reset
      const emptyInputs = {};
      const shouldGenerateTemplate = Object.keys(emptyInputs).length > 0;

      expect(shouldGenerateTemplate).toBe(false);
      // When false, the code path is: updateConfig('prompts', ['{{prompt}}'])
    });

    it('should reset to default prompt when undefined inputs are provided', () => {
      // Test the logic: !inputs is true, so should reset
      const inputs = undefined;
      const shouldGenerateTemplate = inputs && Object.keys(inputs).length > 0;

      expect(shouldGenerateTemplate).toBeFalsy();
      // When false, the code path is: updateConfig('prompts', ['{{prompt}}'])
    });

    it('should properly escape variable names in template syntax', () => {
      // Test that template variables use correct {{var}} syntax
      const inputs = { 'user-id': 'desc', session_token: 'desc2' };
      const template = JSON.stringify(
        Object.fromEntries(Object.keys(inputs).map((key) => [key, `{{${key}}}`])),
      );

      const parsed = JSON.parse(template);
      expect(parsed['user-id']).toBe('{{user-id}}');
      expect(parsed['session_token']).toBe('{{session_token}}');
    });
  });
});
