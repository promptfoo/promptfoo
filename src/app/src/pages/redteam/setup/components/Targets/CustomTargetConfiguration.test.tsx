import React from 'react';

import { TooltipProvider } from '@app/components/ui/tooltip';
import { render as rtlRender, screen, waitFor } from '@testing-library/react';
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

const renderA2AConfiguration = (
  initialTarget: ProviderOptions,
  rawConfig = JSON.stringify({}, null, 2),
) => {
  const updateSpy = vi.fn();
  const setRawConfigJsonSpy = vi.fn();

  const Harness = () => {
    const [target, setTarget] = React.useState(initialTarget);
    const [rawConfigJson, setRawConfigJson] = React.useState(rawConfig);

    const updateCustomTarget = (field: string, value: unknown) => {
      updateSpy(field, value);
      setTarget((currentTarget) => {
        if (field === 'id') {
          return { ...currentTarget, id: value as string };
        }

        if (field === 'config') {
          return { ...currentTarget, config: value as ProviderOptions['config'] };
        }

        return {
          ...currentTarget,
          config: {
            ...(currentTarget.config ?? {}),
            [field]: value,
          },
        };
      });
    };

    const setRawConfigJsonWithSpy = (value: string) => {
      setRawConfigJsonSpy(value);
      setRawConfigJson(value);
    };

    return (
      <CustomTargetConfiguration
        selectedTarget={target}
        updateCustomTarget={updateCustomTarget}
        rawConfigJson={rawConfigJson}
        setRawConfigJson={setRawConfigJsonWithSpy}
        bodyError={null}
        providerType="a2a"
      />
    );
  };

  render(<Harness />);

  return { updateSpy, setRawConfigJsonSpy };
};

describe('CustomTargetConfiguration', () => {
  describe('A2A provider configuration', () => {
    it('should render friendly A2A connection, auth, polling, and advanced fields', async () => {
      const user = userEvent.setup();
      const { updateSpy } = renderA2AConfiguration({
        id: 'a2a',
        config: {
          url: '',
          mode: 'auto',
          polling: {
            enabled: true,
            intervalMs: 1000,
            timeoutMs: 300000,
          },
        },
      });

      const agentCardUrlInput = screen.getByLabelText(/Agent Card URL/i);
      const endpointUrlInput = screen.getByLabelText(/A2A Endpoint URL/i);

      expect(agentCardUrlInput).toBeInTheDocument();
      expect(endpointUrlInput).toBeInTheDocument();
      expect(
        agentCardUrlInput.compareDocumentPosition(endpointUrlInput) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(screen.getByLabelText(/Request Mode/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Authentication Type/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Enable polling/i)).toBeChecked();
      expect(screen.getByText(/Advanced Configuration \(JSON\)/i)).toBeInTheDocument();

      await user.type(endpointUrlInput, 'https://agent.example.com/a2a');
      expect(updateSpy).toHaveBeenCalledWith('url', 'https://agent.example.com/a2a');

      await user.click(screen.getByLabelText(/Authentication Type/i));
      await user.click(screen.getByRole('option', { name: 'Bearer Token' }));
      expect(updateSpy).toHaveBeenCalledWith('auth', { type: 'bearer', token: '' });

      await user.click(screen.getByPlaceholderText('{{A2A_API_KEY}}'));
      await user.paste('{{A2A_API_KEY}}');
      await waitFor(() => {
        expect(updateSpy).toHaveBeenLastCalledWith('auth', {
          type: 'bearer',
          token: '{{A2A_API_KEY}}',
        });
      });
    });

    it('should merge advanced JSON under structured A2A fields', async () => {
      const user = userEvent.setup();
      const { updateSpy } = renderA2AConfiguration(
        {
          id: 'a2a',
          config: {
            url: 'https://agent.example.com/a2a',
            mode: 'auto',
            auth: { type: 'bearer', token: '{{A2A_API_KEY}}' },
            polling: {
              enabled: true,
              intervalMs: 1000,
              timeoutMs: 300000,
            },
          },
        },
        '{}',
      );

      const advancedConfig = {
        headers: {
          'X-Trace-Id': '{{traceId}}',
        },
        transformResponse: 'return result.output;',
      };

      const editor = screen.getByTestId('code-editor');
      await user.clear(editor);
      await user.paste(JSON.stringify(advancedConfig, null, 2));

      await waitFor(() => {
        expect(updateSpy).toHaveBeenLastCalledWith('config', {
          ...advancedConfig,
          url: 'https://agent.example.com/a2a',
          mode: 'auto',
          auth: { type: 'bearer', token: '{{A2A_API_KEY}}' },
          polling: {
            enabled: true,
            intervalMs: 1000,
            timeoutMs: 300000,
          },
        });
      });
    });
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
