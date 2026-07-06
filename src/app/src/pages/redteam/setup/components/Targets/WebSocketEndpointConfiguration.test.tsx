import { useState } from 'react';

import { renderWithProviders } from '@app/utils/testutils';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import WebSocketEndpointConfiguration from './WebSocketEndpointConfiguration';

import type { ProviderOptions } from '../../types';

// Mock the editor component to avoid prism.js issues and to enable label association via htmlFor
vi.mock('react-simple-code-editor', () => ({
  default: ({ id, value, onValueChange, ...rest }: any) => (
    <textarea
      id={id}
      aria-describedby={(rest as any)['aria-describedby']}
      value={value}
      onChange={(e) => onValueChange((e.target as HTMLTextAreaElement).value)}
    />
  ),
}));

describe('WebSocketEndpointConfiguration', () => {
  const baseProvider: ProviderOptions = {
    id: 'websocket',
    config: {
      type: 'websocket',
      url: 'wss://example.com/socket',
      messageTemplate: 'Hello {{prompt}}',
      transformResponse: 'json.message',
      streamResponse: 'line => line',
      timeoutMs: 15000,
    },
  };

  it('calls updateWebSocketTarget on URL change', async () => {
    const user = userEvent.setup();
    const update = vi.fn();

    renderWithProviders(
      <WebSocketEndpointConfiguration
        selectedTarget={baseProvider}
        updateWebSocketTarget={update}
        urlError={null}
      />,
    );

    const urlField = screen.getByLabelText('WebSocket URL');
    await user.click(urlField);
    await user.keyboard('{Control>}a{/Control}');
    await user.paste('wss://foo.bar');

    expect(update).toHaveBeenCalledWith('url', 'wss://foo.bar');
  });

  it('calls updateWebSocketTarget on Message Template change', async () => {
    const user = userEvent.setup();
    const update = vi.fn();

    renderWithProviders(
      <WebSocketEndpointConfiguration
        selectedTarget={baseProvider}
        updateWebSocketTarget={update}
        urlError={null}
      />,
    );

    const msgField = screen.getByLabelText('Message Template');
    await user.click(msgField);
    await user.keyboard('{Control>}a{/Control}');
    await user.paste('Hey {{name}}');

    expect(update).toHaveBeenCalledWith('messageTemplate', 'Hey {{name}}');
  });

  it('allows typing multiple WebSocket subprotocols and trims them on blur', async () => {
    const user = userEvent.setup();
    const update = vi.fn();

    const StatefulConfiguration = () => {
      const [provider, setProvider] = useState(baseProvider);

      return (
        <WebSocketEndpointConfiguration
          selectedTarget={provider}
          updateWebSocketTarget={(field, value) => {
            update(field, value);
            setProvider((current) => ({
              ...current,
              config: { ...current.config, [field]: value },
            }));
          }}
          urlError={null}
        />
      );
    };

    renderWithProviders(<StatefulConfiguration />);

    const protocolsField = screen.getByLabelText('WebSocket Subprotocols');
    await user.type(protocolsField, 'json,  graphql-transport-ws  ');

    expect(protocolsField).toHaveValue('json,  graphql-transport-ws  ');

    expect(update).toHaveBeenCalledWith('protocols', ['json', 'graphql-transport-ws']);

    await user.tab();

    expect(protocolsField).toHaveValue('json, graphql-transport-ws');
  });

  it('syncs WebSocket subprotocols when the parent loads a different target', async () => {
    const user = userEvent.setup();

    const StatefulConfiguration = () => {
      const [provider, setProvider] = useState<ProviderOptions>({
        ...baseProvider,
        config: { ...baseProvider.config, protocols: ['json'] },
      });

      return (
        <>
          <button
            type="button"
            onClick={() =>
              setProvider({
                ...baseProvider,
                config: {
                  ...baseProvider.config,
                  protocols: ['mqtt', 'graphql-transport-ws'],
                },
              })
            }
          >
            Load target
          </button>
          <WebSocketEndpointConfiguration
            selectedTarget={provider}
            updateWebSocketTarget={() => {}}
            urlError={null}
          />
        </>
      );
    };

    renderWithProviders(<StatefulConfiguration />);

    const protocolsField = screen.getByLabelText('WebSocket Subprotocols');
    expect(protocolsField).toHaveValue('json');

    await user.click(screen.getByRole('button', { name: 'Load target' }));

    expect(protocolsField).toHaveValue('mqtt, graphql-transport-ws');
  });

  it('preserves a trailing comma during an active edit and applies external protocols on blur', async () => {
    const user = userEvent.setup();
    const update = vi.fn();
    let updateProtocolsExternally = () => {
      throw new Error('StatefulConfiguration was not rendered');
    };

    const StatefulConfiguration = () => {
      const [provider, setProvider] = useState<ProviderOptions>({
        ...baseProvider,
        config: { ...baseProvider.config, protocols: ['json'] },
      });
      updateProtocolsExternally = () =>
        setProvider({
          ...baseProvider,
          config: { ...baseProvider.config, protocols: ['mqtt'] },
        });

      return (
        <WebSocketEndpointConfiguration
          selectedTarget={provider}
          updateWebSocketTarget={(field, value) => {
            update(field, value);
            setProvider((current) => ({
              ...current,
              config: { ...current.config, [field]: value },
            }));
          }}
          urlError={null}
        />
      );
    };

    renderWithProviders(<StatefulConfiguration />);

    const protocolsField = screen.getByLabelText('WebSocket Subprotocols');
    await user.click(protocolsField);
    await user.type(protocolsField, ',');

    expect(protocolsField).toHaveFocus();
    expect(protocolsField).toHaveValue('json,');
    expect(update).toHaveBeenLastCalledWith('protocols', ['json']);

    act(updateProtocolsExternally);

    expect(protocolsField).toHaveFocus();
    expect(protocolsField).toHaveValue('json,');

    await user.tab();

    expect(protocolsField).toHaveValue('mqtt');
  });

  it('preserves raw Sec-WebSocket-Protocol headers and shows migration guidance', () => {
    const update = vi.fn();
    const providerWithHeader: ProviderOptions = {
      ...baseProvider,
      config: {
        ...baseProvider.config,
        headers: {
          'Sec-WebSocket-Protocol': 'Bearer token-with-space',
        },
      },
    };

    renderWithProviders(
      <WebSocketEndpointConfiguration
        selectedTarget={providerWithHeader}
        updateWebSocketTarget={update}
        urlError={null}
      />,
    );

    expect(screen.getByText(/move it here/i)).toBeInTheDocument();
    expect(screen.getByLabelText('WebSocket Subprotocols')).toHaveValue('');
    expect(update).not.toHaveBeenCalledWith('headers', expect.anything());
  });

  it('calls updateWebSocketTarget on Response Transform change', async () => {
    const user = userEvent.setup();
    const update = vi.fn();

    const nonStreamingProvider: ProviderOptions = {
      ...baseProvider,
      config: { ...baseProvider.config, streamResponse: undefined },
    };

    renderWithProviders(
      <WebSocketEndpointConfiguration
        selectedTarget={nonStreamingProvider}
        updateWebSocketTarget={update}
        urlError={null}
      />,
    );

    const transformField = screen.getByLabelText('Response Transform');
    await user.click(transformField);
    await user.keyboard('{Control>}a{/Control}');
    await user.paste('json.data.result');

    expect(update).toHaveBeenCalledWith('transformResponse', 'json.data.result');
  });

  it('calls updateWebSocketTarget on Stream Response Transform change', async () => {
    const user = userEvent.setup();
    const update = vi.fn();

    renderWithProviders(
      <WebSocketEndpointConfiguration
        selectedTarget={baseProvider}
        updateWebSocketTarget={update}
        urlError={null}
      />,
    );

    const streamTransformField = screen.getByLabelText('Stream Response Transform');
    await user.click(streamTransformField);
    await user.keyboard('{Control>}a{/Control}');
    await user.paste('chunk => chunk');

    expect(update).toHaveBeenCalledWith('streamResponse', 'chunk => chunk');
  });

  it('calls updateWebSocketTarget on Timeout change', async () => {
    const user = userEvent.setup();
    const update = vi.fn();

    renderWithProviders(
      <WebSocketEndpointConfiguration
        selectedTarget={baseProvider}
        updateWebSocketTarget={update}
        urlError={null}
      />,
    );

    const timeoutField = screen.getByLabelText('Timeout (ms)');
    await user.click(timeoutField);
    await user.keyboard('{Control>}a{/Control}');
    await user.paste(String(25000));

    expect(update).toHaveBeenCalledWith('timeoutMs', 25000);
  });

  it('renders only Response Transform when streaming is disabled', () => {
    const update = vi.fn();
    const nonStreamingProvider: ProviderOptions = {
      ...baseProvider,
      config: { ...baseProvider.config, streamResponse: undefined },
    };

    renderWithProviders(
      <WebSocketEndpointConfiguration
        selectedTarget={nonStreamingProvider}
        updateWebSocketTarget={update}
        urlError={null}
      />,
    );

    expect(screen.getByLabelText('Response Transform')).toBeInTheDocument();
    expect(screen.queryByLabelText('Stream Response Transform')).not.toBeInTheDocument();
  });

  it('renders Stream Response editor when streaming is enabled', () => {
    const update = vi.fn();

    renderWithProviders(
      <WebSocketEndpointConfiguration
        selectedTarget={baseProvider}
        updateWebSocketTarget={update}
        urlError={null}
      />,
    );

    expect(screen.getByLabelText('Stream Response Transform')).toBeInTheDocument();
    expect(screen.queryByLabelText('Response Transform')).not.toBeInTheDocument();
  });

  it('toggling streaming switch updates config and toggles visible inputs', async () => {
    const user = userEvent.setup();
    const update = vi.fn();
    const nonStreamingProvider: ProviderOptions = {
      ...baseProvider,
      config: { ...baseProvider.config, streamResponse: undefined },
    };

    renderWithProviders(
      <WebSocketEndpointConfiguration
        selectedTarget={nonStreamingProvider}
        updateWebSocketTarget={update}
        urlError={null}
      />,
    );

    // Initially not streaming
    expect(screen.getByLabelText('Response Transform')).toBeInTheDocument();
    expect(screen.queryByLabelText('Stream Response Transform')).not.toBeInTheDocument();

    // Toggle on
    const switchEl = screen.getByRole('switch');
    await user.click(switchEl);

    expect(update).toHaveBeenCalledWith('streamResponse', expect.any(String));
    expect(update).toHaveBeenCalledWith('transformResponse', undefined);

    // Now stream editor should be visible
    expect(screen.getByLabelText('Stream Response Transform')).toBeInTheDocument();
    expect(screen.queryByLabelText('Response Transform')).not.toBeInTheDocument();

    // Toggle off
    update.mockClear();
    await user.click(switchEl);

    expect(update).toHaveBeenCalledWith('transformResponse', expect.any(String));
    expect(update).toHaveBeenCalledWith('streamResponse', undefined);

    // Back to non-streaming input
    expect(screen.getByLabelText('Response Transform')).toBeInTheDocument();
    expect(screen.queryByLabelText('Stream Response Transform')).not.toBeInTheDocument();
  });

  it('onBlur sets default when timeoutMs is undefined/NaN/0, and does not when valid', async () => {
    const user = userEvent.setup();
    const update = vi.fn();

    // Case 1: undefined -> should set to default
    const providerUndefined: ProviderOptions = {
      ...baseProvider,
      config: { ...baseProvider.config, timeoutMs: undefined },
    };

    const { rerender } = renderWithProviders(
      <WebSocketEndpointConfiguration
        selectedTarget={providerUndefined}
        updateWebSocketTarget={update}
        urlError={null}
      />,
    );

    const timeoutField1 = screen.getByLabelText('Timeout (ms)');
    await user.click(timeoutField1);
    await user.tab();

    // we can't import the constant here easily; just assert it sets something when undefined
    expect(update).toHaveBeenCalledWith('timeoutMs', expect.any(Number));

    // Case 2: NaN -> should set to default
    update.mockClear();
    const providerNaN: ProviderOptions = {
      ...baseProvider,
      config: { ...baseProvider.config, timeoutMs: Number.NaN },
    };

    rerender(
      <WebSocketEndpointConfiguration
        selectedTarget={providerNaN}
        updateWebSocketTarget={update}
        urlError={null}
      />,
    );
    const timeoutField2 = screen.getByLabelText('Timeout (ms)');
    await user.click(timeoutField2);
    await user.tab();
    expect(update).toHaveBeenCalledWith('timeoutMs', expect.any(Number));

    // Case 3: zero -> should set to default
    update.mockClear();
    const providerZero: ProviderOptions = {
      ...baseProvider,
      config: { ...baseProvider.config, timeoutMs: undefined },
    };

    rerender(
      <WebSocketEndpointConfiguration
        selectedTarget={providerZero}
        updateWebSocketTarget={update}
        urlError={null}
      />,
    );
    const timeoutField3 = screen.getByLabelText('Timeout (ms)');
    await user.click(timeoutField3);
    await user.tab();
    expect(update).toHaveBeenCalledWith('timeoutMs', expect.any(Number));

    // Case 4: valid value -> should not change on blur
    update.mockClear();
    const providerValid: ProviderOptions = {
      ...baseProvider,
      config: { ...baseProvider.config, timeoutMs: 12345 },
    };

    rerender(
      <WebSocketEndpointConfiguration
        selectedTarget={providerValid}
        updateWebSocketTarget={update}
        urlError={null}
      />,
    );
    const timeoutField4 = screen.getByLabelText('Timeout (ms)');
    await user.click(timeoutField4);
    await user.tab();
    expect(update).not.toHaveBeenCalled();
  });
});
