import React from 'react';

import { TooltipProvider } from '@app/components/ui/tooltip';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CommonConfigurationOptions from './CommonConfigurationOptions';
import type { Inputs } from '@promptfoo/contracts';
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

const inputEdit = vi.hoisted(() => ({
  value: { testVar: 'test description' } as Inputs | undefined,
}));

vi.mock('./InputsEditor', () => ({
  default: ({
    inputs,
    onChange,
    compact,
  }: {
    inputs?: Inputs;
    onChange: (inputs: Inputs | undefined) => void;
    compact?: boolean;
  }) => {
    return (
      <div
        data-testid="mock-inputs-editor"
        data-inputs={JSON.stringify(inputs || {})}
        data-compact={compact}
        onClick={() => onChange(inputEdit.value)}
      />
    );
  },
}));

const renderWithProviders = (ui: React.ReactElement) => {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
};

describe('CommonConfigurationOptions', () => {
  beforeEach(() => {
    inputEdit.value = { testVar: 'test description' };
  });
  afterEach(() => vi.resetAllMocks());
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
    const user = userEvent.setup();
    const onPromptsChange = vi.fn();
    renderWithProviders(
      <CommonConfigurationOptions {...defaultProps} onPromptsChange={onPromptsChange} />,
    );

    // Expand the Test Generation collapsible
    const testGenTrigger = screen.getByText('Test Generation');
    await user.click(testGenTrigger);

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

  it('should call onExtensionsChange when ExtensionEditor updates extensions', async () => {
    const user = userEvent.setup();
    const onExtensionsChange = vi.fn();

    renderWithProviders(
      <CommonConfigurationOptions {...defaultProps} onExtensionsChange={onExtensionsChange} />,
    );

    const editor = screen.getByTestId('mock-extension-editor');
    await user.click(editor);

    expect(onExtensionsChange).toHaveBeenCalledWith(['file://new-extension.js:hook']);
  });

  it('should call updateCustomTarget when InputsEditor updates inputs', async () => {
    const user = userEvent.setup();
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
    await user.click(testGenTrigger);

    const inputsEditor = screen.getByTestId('mock-inputs-editor');
    await user.click(inputsEditor);

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

  it('should call updateCustomTarget when delay is changed', async () => {
    const user = userEvent.setup();
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
    await user.click(delayInput);
    await user.keyboard('{Control>}a{/Control}');
    await user.paste('200');

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
    it('should generate JSON template with template variables when inputs are provided', async () => {
      const user = userEvent.setup();
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
      await user.click(testGenTrigger);

      // Simulate InputsEditor calling onChange with inputs
      const inputsEditor = screen.getByTestId('mock-inputs-editor');
      await user.click(inputsEditor);

      // Should call updateCustomTarget with inputs
      expect(updateCustomTarget).toHaveBeenCalledWith('inputs', { testVar: 'test description' });

      // Should call onPromptsChange with JSON template
      expect(onPromptsChange).toHaveBeenCalledWith(['{"testVar":"{{testVar}}"}']);
    });

    it.each([
      [
        { user_id: 'desc1', session_token: 'desc2', role: 'desc3' },
        '{"user_id":"{{user_id}}","session_token":"{{session_token}}","role":"{{role}}"}',
      ],
      [{ message: 'The main message' }, '{"message":"{{message}}"}'],
      [{}, '{{prompt}}'],
      [undefined, '{{prompt}}'],
      [
        { 'user-id': 'desc', session_token: 'desc2' },
        '{"user-id":"{{user-id}}","session_token":"{{session_token}}"}',
      ],
    ] as const)('updates target inputs and prompt for %j', async (inputs, prompt) => {
      const user = userEvent.setup();
      inputEdit.value = inputs;
      const updateCustomTarget = vi.fn();
      const onPromptsChange = vi.fn();
      renderWithProviders(
        <CommonConfigurationOptions
          {...defaultProps}
          updateCustomTarget={updateCustomTarget}
          onPromptsChange={onPromptsChange}
        />,
      );
      await user.click(screen.getByText('Test Generation'));
      await user.click(screen.getByTestId('mock-inputs-editor'));
      expect(updateCustomTarget).toHaveBeenCalledExactlyOnceWith('inputs', inputs);
      expect(onPromptsChange).toHaveBeenCalledExactlyOnceWith([prompt]);
    });
  });
});
