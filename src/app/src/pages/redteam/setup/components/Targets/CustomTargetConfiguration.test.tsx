import React from 'react';

import { TooltipProvider } from '@app/components/ui/tooltip';
import { render as rtlRender, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CustomTargetConfiguration from './CustomTargetConfiguration';

import type { ProviderOptions } from '../../types';

vi.mock('react-simple-code-editor', () => ({
  default: ({ value, onValueChange }: any) => (
    <textarea
      data-testid="code-editor"
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
    />
  ),
}));

const render = (ui: React.ReactElement) => {
  return rtlRender(<TooltipProvider delayDuration={0}>{ui}</TooltipProvider>);
};

const replaceText = async (
  user: ReturnType<typeof userEvent.setup>,
  element: HTMLElement,
  value: string,
) => {
  await user.click(element);
  await user.keyboard('{Control>}a{/Control}');
  await user.paste(value);
};

afterEach(() => {
  vi.clearAllMocks();
});

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
    render(
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
    render(
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
    render(
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
    render(
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
    render(
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

describe('CustomTargetConfiguration', () => {
  it('shows valid Open Interpreter target and configuration examples', async () => {
    const user = userEvent.setup();

    render(
      <CustomTargetConfiguration
        selectedTarget={{ id: 'openinterpreter', config: {} }}
        updateCustomTarget={vi.fn()}
        rawConfigJson="{}"
        setRawConfigJson={vi.fn()}
        bodyError={null}
        providerType="openinterpreter"
      />,
    );

    expect(screen.getByText('Open Interpreter Target')).toBeInTheDocument();
    expect(screen.getByLabelText(/Target ID/i)).toHaveAttribute('placeholder', 'openinterpreter');
    expect(screen.getByRole('link', { name: 'documentation' })).toHaveAttribute(
      'href',
      'https://www.promptfoo.dev/docs/providers/openinterpreter/',
    );

    await user.click(screen.getByRole('button', { name: /Examples/i }));
    const example = screen.getByText((_, element) => element?.tagName === 'PRE');
    expect(example.textContent).toContain('"sandbox_mode": "read-only"');
    expect(example.textContent).toContain('"turn_timeout_ms": 60000');
    expect(example.textContent).not.toContain('temperature');
    expect(example.textContent).not.toContain('max_tokens');
  });

  it.each([
    ['malformed JSON', '{"sandbox_mode":"read-only",}', 'Invalid JSON configuration'],
    ['non-object JSON', '[]', 'Configuration must be a JSON object'],
  ])('preserves the last valid Open Interpreter config for %s', async (_case, value, error) => {
    const user = userEvent.setup();
    const updateCustomTarget = vi.fn();
    const onConfigErrorChange = vi.fn();

    render(
      <CustomTargetConfiguration
        selectedTarget={{ id: 'openinterpreter', config: { sandbox_mode: 'danger-full-access' } }}
        updateCustomTarget={updateCustomTarget}
        rawConfigJson={'{\n  "sandbox_mode": "danger-full-access"\n}'}
        setRawConfigJson={vi.fn()}
        bodyError={null}
        providerType="openinterpreter"
        onConfigErrorChange={onConfigErrorChange}
      />,
    );

    await replaceText(user, screen.getByTestId('code-editor'), value);

    expect(updateCustomTarget).not.toHaveBeenCalled();
    expect(onConfigErrorChange).toHaveBeenLastCalledWith(error);
  });

  it.each([
    ['malformed JSON', '{"sandbox_mode":"read-only",}', 'Invalid JSON configuration'],
    ['non-object JSON', '[]', 'Configuration must be a JSON object'],
  ])(
    'preserves the last valid Open Interpreter config when formatting %s',
    async (_case, value, error) => {
      const user = userEvent.setup();
      const updateCustomTarget = vi.fn();
      const onConfigErrorChange = vi.fn();

      render(
        <CustomTargetConfiguration
          selectedTarget={{ id: 'openinterpreter', config: { sandbox_mode: 'danger-full-access' } }}
          updateCustomTarget={updateCustomTarget}
          rawConfigJson={value}
          setRawConfigJson={vi.fn()}
          bodyError={null}
          providerType="openinterpreter"
          onConfigErrorChange={onConfigErrorChange}
        />,
      );

      await user.click(screen.getByRole('button', { name: /Format/i }));

      expect(updateCustomTarget).not.toHaveBeenCalled();
      expect(onConfigErrorChange).toHaveBeenLastCalledWith(error);
    },
  );

  it('does not clear a restored validation error for a reordered but unchanged config', async () => {
    const user = userEvent.setup();
    const updateCustomTarget = vi.fn();
    const onConfigErrorChange = vi.fn();
    const config = { sandbox_mode: 'danger-full-access', approval_policy: 'never' };
    const reordered = '{"approval_policy":"never","sandbox_mode":"danger-full-access"}';

    render(
      <CustomTargetConfiguration
        selectedTarget={{ id: 'openinterpreter', config }}
        updateCustomTarget={updateCustomTarget}
        rawConfigJson={reordered}
        setRawConfigJson={vi.fn()}
        bodyError={null}
        providerType="openinterpreter"
        onConfigErrorChange={onConfigErrorChange}
        preserveConfigErrorOnUnchangedConfig
      />,
    );

    await replaceText(user, screen.getByTestId('code-editor'), ` ${reordered}\n`);
    await user.click(screen.getByRole('button', { name: /Format/i }));

    expect(updateCustomTarget).not.toHaveBeenCalled();
    expect(onConfigErrorChange).not.toHaveBeenCalled();
  });

  it('keeps the validation error when a valid correction cannot be persisted', async () => {
    const user = userEvent.setup();
    const updateCustomTarget = vi.fn(() => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    });
    const onConfigErrorChange = vi.fn();

    render(
      <CustomTargetConfiguration
        selectedTarget={{ id: 'openinterpreter', config: { sandbox_mode: 'danger-full-access' } }}
        updateCustomTarget={updateCustomTarget}
        rawConfigJson={'{"sandbox_mode":"read-only",}'}
        setRawConfigJson={vi.fn()}
        bodyError={null}
        providerType="openinterpreter"
        onConfigErrorChange={onConfigErrorChange}
      />,
    );

    await replaceText(user, screen.getByTestId('code-editor'), '{"sandbox_mode":"read-only"}');

    expect(updateCustomTarget).toHaveBeenCalledWith('config', { sandbox_mode: 'read-only' });
    expect(onConfigErrorChange).not.toHaveBeenCalledWith(null);
    expect(onConfigErrorChange).toHaveBeenLastCalledWith('Invalid JSON configuration');
  });

  describe('file:// prefix handling', () => {
    it('should add file:// prefix to Python file paths', async () => {
      const user = userEvent.setup();
      const mockUpdateCustomTarget = vi.fn();
      const mockSetRawConfigJson = vi.fn();
      const selectedTarget: ProviderOptions = {
        id: '',
        config: {},
      };

      render(
        <CustomTargetConfiguration
          selectedTarget={selectedTarget}
          updateCustomTarget={mockUpdateCustomTarget}
          rawConfigJson="{}"
          setRawConfigJson={mockSetRawConfigJson}
          bodyError={null}
        />,
      );

      const input = screen.getByLabelText(/Target ID/i);
      await user.click(input);
      await user.keyboard('{Control>}a{/Control}');
      await user.paste('/path/to/script.py');

      expect(mockUpdateCustomTarget).toHaveBeenCalledWith('id', 'file:///path/to/script.py');
    });

    it('should add file:// prefix to JavaScript file paths', async () => {
      const user = userEvent.setup();
      const mockUpdateCustomTarget = vi.fn();
      const mockSetRawConfigJson = vi.fn();
      const selectedTarget: ProviderOptions = {
        id: '',
        config: {},
      };

      render(
        <CustomTargetConfiguration
          selectedTarget={selectedTarget}
          updateCustomTarget={mockUpdateCustomTarget}
          rawConfigJson="{}"
          setRawConfigJson={mockSetRawConfigJson}
          bodyError={null}
        />,
      );

      const input = screen.getByLabelText(/Target ID/i);
      await user.click(input);
      await user.keyboard('{Control>}a{/Control}');
      await user.paste('/path/to/provider.js');

      expect(mockUpdateCustomTarget).toHaveBeenCalledWith('id', 'file:///path/to/provider.js');
    });

    it('should not add file:// prefix if already present', async () => {
      const user = userEvent.setup();
      const mockUpdateCustomTarget = vi.fn();
      const mockSetRawConfigJson = vi.fn();
      const selectedTarget: ProviderOptions = {
        id: '',
        config: {},
      };

      render(
        <CustomTargetConfiguration
          selectedTarget={selectedTarget}
          updateCustomTarget={mockUpdateCustomTarget}
          rawConfigJson="{}"
          setRawConfigJson={mockSetRawConfigJson}
          bodyError={null}
        />,
      );

      const input = screen.getByLabelText(/Target ID/i);
      await user.click(input);
      await user.keyboard('{Control>}a{/Control}');
      await user.paste('file:///path/to/script.py');

      expect(mockUpdateCustomTarget).toHaveBeenCalledWith('id', 'file:///path/to/script.py');
    });

    it('should not modify non-Python/JavaScript provider IDs', async () => {
      const user = userEvent.setup();
      const mockUpdateCustomTarget = vi.fn();
      const mockSetRawConfigJson = vi.fn();
      const selectedTarget: ProviderOptions = {
        id: '',
        config: {},
      };

      render(
        <CustomTargetConfiguration
          selectedTarget={selectedTarget}
          updateCustomTarget={mockUpdateCustomTarget}
          rawConfigJson="{}"
          setRawConfigJson={mockSetRawConfigJson}
          bodyError={null}
        />,
      );

      const input = screen.getByLabelText(/Target ID/i);
      await user.click(input);
      await user.keyboard('{Control>}a{/Control}');
      await user.paste('openai:gpt-4');

      expect(mockUpdateCustomTarget).toHaveBeenCalledWith('id', 'openai:gpt-4');
    });

    it('should handle relative Python paths', async () => {
      const user = userEvent.setup();
      const mockUpdateCustomTarget = vi.fn();
      const mockSetRawConfigJson = vi.fn();
      const selectedTarget: ProviderOptions = {
        id: '',
        config: {},
      };

      render(
        <CustomTargetConfiguration
          selectedTarget={selectedTarget}
          updateCustomTarget={mockUpdateCustomTarget}
          rawConfigJson="{}"
          setRawConfigJson={mockSetRawConfigJson}
          bodyError={null}
        />,
      );

      const input = screen.getByLabelText(/Target ID/i);
      await user.click(input);
      await user.keyboard('{Control>}a{/Control}');
      await user.paste('./provider.py');

      expect(mockUpdateCustomTarget).toHaveBeenCalledWith('id', 'file://./provider.py');
    });

    it('should strip file:// prefix for display', () => {
      const mockUpdateCustomTarget = vi.fn();
      const mockSetRawConfigJson = vi.fn();
      const selectedTarget: ProviderOptions = {
        id: 'file:///path/to/script.py',
        config: {},
      };

      render(
        <CustomTargetConfiguration
          selectedTarget={selectedTarget}
          updateCustomTarget={mockUpdateCustomTarget}
          rawConfigJson="{}"
          setRawConfigJson={mockSetRawConfigJson}
          bodyError={null}
        />,
      );

      const input = screen.getByLabelText(/Target ID/i) as HTMLInputElement;
      expect(input.value).toBe('/path/to/script.py');
    });

    it('should handle HTTP provider IDs without modification', async () => {
      const user = userEvent.setup();
      const mockUpdateCustomTarget = vi.fn();
      const mockSetRawConfigJson = vi.fn();
      const selectedTarget: ProviderOptions = {
        id: '',
        config: {},
      };

      render(
        <CustomTargetConfiguration
          selectedTarget={selectedTarget}
          updateCustomTarget={mockUpdateCustomTarget}
          rawConfigJson="{}"
          setRawConfigJson={mockSetRawConfigJson}
          bodyError={null}
        />,
      );

      const input = screen.getByLabelText(/Target ID/i);
      await user.click(input);
      await user.keyboard('{Control>}a{/Control}');
      await user.paste('http://example.com/api');

      expect(mockUpdateCustomTarget).toHaveBeenCalledWith('id', 'http://example.com/api');
    });

    it('should add file:// prefix to Python paths with custom function names', async () => {
      const user = userEvent.setup();
      const mockUpdateCustomTarget = vi.fn();
      const mockSetRawConfigJson = vi.fn();
      const selectedTarget: ProviderOptions = {
        id: '',
        config: {},
      };

      render(
        <CustomTargetConfiguration
          selectedTarget={selectedTarget}
          updateCustomTarget={mockUpdateCustomTarget}
          rawConfigJson="{}"
          setRawConfigJson={mockSetRawConfigJson}
          bodyError={null}
        />,
      );

      const input = screen.getByLabelText(/Target ID/i);
      await user.click(input);
      await user.keyboard('{Control>}a{/Control}');
      await user.paste('/path/to/script.py:custom_func');

      expect(mockUpdateCustomTarget).toHaveBeenCalledWith(
        'id',
        'file:///path/to/script.py:custom_func',
      );
    });

    it('should add file:// prefix to JavaScript paths with custom function names', async () => {
      const user = userEvent.setup();
      const mockUpdateCustomTarget = vi.fn();
      const mockSetRawConfigJson = vi.fn();
      const selectedTarget: ProviderOptions = {
        id: '',
        config: {},
      };

      render(
        <CustomTargetConfiguration
          selectedTarget={selectedTarget}
          updateCustomTarget={mockUpdateCustomTarget}
          rawConfigJson="{}"
          setRawConfigJson={mockSetRawConfigJson}
          bodyError={null}
        />,
      );

      const input = screen.getByLabelText(/Target ID/i);
      await user.click(input);
      await user.keyboard('{Control>}a{/Control}');
      await user.paste('./provider.js:myFunc');

      expect(mockUpdateCustomTarget).toHaveBeenCalledWith('id', 'file://./provider.js:myFunc');
    });
  });
});
