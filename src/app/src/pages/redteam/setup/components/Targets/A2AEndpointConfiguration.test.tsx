import React from 'react';

import { TooltipProvider } from '@app/components/ui/tooltip';
import { render as rtlRender, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import A2AEndpointConfiguration from './A2AEndpointConfiguration';

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
      <A2AEndpointConfiguration
        selectedTarget={target}
        updateCustomTarget={updateCustomTarget}
        rawConfigJson={rawConfigJson}
        setRawConfigJson={setRawConfigJsonWithSpy}
        bodyError={null}
      />
    );
  };

  render(<Harness />);

  return { updateSpy, setRawConfigJsonSpy };
};

describe('A2AEndpointConfiguration', () => {
  it('should render friendly A2A connection, auth, and advanced fields', async () => {
    const user = userEvent.setup();
    const { updateSpy } = renderA2AConfiguration({
      id: 'a2a',
      config: {
        url: '',
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
    expect(screen.queryByLabelText(/Request Mode/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Enable polling/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Authentication Type/i)).toBeInTheDocument();
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
          auth: { type: 'bearer', token: '{{A2A_API_KEY}}' },
        },
      },
      '{}',
    );

    const advancedConfig = {
      mode: 'stream',
      tenant: 'acme',
      protocolVersion: '1.0',
      polling: {
        enabled: false,
        intervalMs: 2000,
        timeoutMs: 120000,
      },
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
        auth: { type: 'bearer', token: '{{A2A_API_KEY}}' },
      });
    });
  });
});
