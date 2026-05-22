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
  it('uses provider terminology and general provider documentation in eval mode', () => {
    render(
      <CustomTargetConfiguration
        selectedTarget={{ id: '', config: {} }}
        updateCustomTarget={vi.fn()}
        rawConfigJson="{}"
        setRawConfigJson={vi.fn()}
        bodyError={null}
        providerType="custom"
        mode="eval"
      />,
    );

    expect(screen.getByText('Custom Provider Configuration')).toBeInTheDocument();
    expect(screen.getByLabelText(/Provider ID/i)).toBeInTheDocument();
    expect(screen.queryByText('Custom Target Configuration')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /provider documentation/i })).toHaveAttribute(
      'href',
      'https://www.promptfoo.dev/docs/providers/',
    );
  });

  it('associates provider ID validation with the required field', () => {
    render(
      <CustomTargetConfiguration
        selectedTarget={{ id: '', config: {} }}
        updateCustomTarget={vi.fn()}
        rawConfigJson="{}"
        setRawConfigJson={vi.fn()}
        bodyError={null}
        providerType="custom"
        mode="eval"
        idError="Provider ID is required"
      />,
    );

    const providerId = screen.getByLabelText(/Provider ID/i);
    expect(providerId).toHaveAttribute('aria-invalid', 'true');
    expect(providerId).toHaveAccessibleDescription(
      /A provider identifies the model, script, or endpoint used in this evaluation.*Provider ID is required/,
    );
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
