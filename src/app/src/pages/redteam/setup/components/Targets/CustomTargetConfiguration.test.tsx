import React from 'react';

import { TooltipProvider } from '@app/components/ui/tooltip';
import { render as rtlRender, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
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

  it('clears stale Open Interpreter config and reports malformed JSON', async () => {
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

    await user.clear(screen.getByTestId('code-editor'));
    await user.paste('{"sandbox_mode":"read-only",}');

    expect(updateCustomTarget).toHaveBeenLastCalledWith('config', {});
    expect(onConfigErrorChange).toHaveBeenLastCalledWith('Invalid JSON configuration');
  });

  it('does not clear the configuration error when formatting a non-object value', async () => {
    const user = userEvent.setup();
    const updateCustomTarget = vi.fn();
    const onConfigErrorChange = vi.fn();

    render(
      <CustomTargetConfiguration
        selectedTarget={{ id: 'openinterpreter', config: { sandbox_mode: 'danger-full-access' } }}
        updateCustomTarget={updateCustomTarget}
        rawConfigJson="[]"
        setRawConfigJson={vi.fn()}
        bodyError={null}
        providerType="openinterpreter"
        onConfigErrorChange={onConfigErrorChange}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Format/i }));

    expect(updateCustomTarget).toHaveBeenLastCalledWith('config', {});
    expect(onConfigErrorChange).toHaveBeenLastCalledWith('Configuration must be a JSON object');
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
