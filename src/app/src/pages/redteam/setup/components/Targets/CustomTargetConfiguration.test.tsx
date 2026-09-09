import React from 'react';

import { TooltipProvider } from '@app/components/ui/tooltip';
import { render as rtlRender, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import CustomTargetConfiguration from './CustomTargetConfiguration';
import { getProviderInitialConfig } from './providerInitialConfig';

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

describe('CustomTargetConfiguration', () => {
  it.each([
    'together',
    'huggingface',
    'bedrock-agent',
    'fal',
    'cloudflare-ai',
    'llama.cpp',
    'llamafile',
    'vllm',
    'text-generation-webui',
    'ollama',
    'databricks',
    'deepseek',
    'groq',
    'cerebras',
  ])(
    'shows the generated %s configuration without replacing a user target',
    async (providerType) => {
      const user = userEvent.setup();
      const initialConfig = getProviderInitialConfig(providerType)!;
      const updateCustomTarget = vi.fn();
      render(
        <CustomTargetConfiguration
          selectedTarget={{ id: 'my-existing-target', config: { apiKey: 'my-server-key' } }}
          updateCustomTarget={updateCustomTarget}
          rawConfigJson='{"apiKey":"my-server-key"}'
          setRawConfigJson={vi.fn()}
          bodyError={null}
          providerType={providerType}
        />,
      );
      const target = screen.getByLabelText(/Target ID/i);
      expect(target).toHaveAttribute('placeholder', initialConfig.id);
      expect(target).toHaveValue('my-existing-target');
      await user.click(screen.getByRole('button', { name: /Examples/i }));
      const example = screen.getByText((_, element) => element?.tagName === 'PRE');
      expect(JSON.parse(example.textContent!)).toEqual(initialConfig.config);
      expect(updateCustomTarget).not.toHaveBeenCalled();
      if (providerType === 'llama.cpp') {
        expect(screen.getByText(/Set LLAMA_BASE_URL/)).toBeInTheDocument();
        expect(example.textContent).not.toContain('apiBaseUrl');
      }
    },
  );

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
    it.each([
      ['openai:chat:tenant/model.js', 'openai:chat:tenant/model.js'],
      ['openai:chat:tenant/model.py:Q4_K_M', 'openai:chat:tenant/model.py:Q4_K_M'],
      ['openai:chat:tenant/model.json-v2', 'openai:chat:tenant/model.json-v2'],
      ['https://example.test/provider.js', 'https://example.test/provider.js'],
      ['provider.js:myFunction', 'file://provider.js:myFunction'],
      ['C:\\providers\\script.py:call_api', 'file://C:\\providers\\script.py:call_api'],
    ])('saves %s with its intended provider route', async (value, expectedId) => {
      const user = userEvent.setup();
      const updateCustomTarget = vi.fn();
      render(
        <CustomTargetConfiguration
          selectedTarget={{ id: '', config: {} }}
          updateCustomTarget={updateCustomTarget}
          rawConfigJson="{}"
          setRawConfigJson={vi.fn()}
          bodyError={null}
        />,
      );
      await replaceText(user, screen.getByLabelText(/Target ID/i), value);
      expect(updateCustomTarget).toHaveBeenLastCalledWith('id', expectedId);
    });

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
