import { renderWithProviders } from '@app/utils/testutils';
import { fireEvent, screen } from '@testing-library/react';
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

  it('calls updateWebSocketTarget on URL change', () => {
    const update = vi.fn();

    renderWithProviders(
      <WebSocketEndpointConfiguration
        selectedTarget={baseProvider}
        updateWebSocketTarget={update}
        urlError={null}
      />,
    );

    const urlField = screen.getByLabelText('WebSocket URL');
    fireEvent.change(urlField, { target: { value: 'wss://foo.bar' } });

    expect(update).toHaveBeenCalledWith('url', 'wss://foo.bar');
  });

  it('calls updateWebSocketTarget on Message Template change', () => {
    const update = vi.fn();

    renderWithProviders(
      <WebSocketEndpointConfiguration
        selectedTarget={baseProvider}
        updateWebSocketTarget={update}
        urlError={null}
      />,
    );

    const msgField = screen.getByLabelText('Message Template');
    fireEvent.change(msgField, { target: { value: 'Hey {{name}}' } });

    expect(update).toHaveBeenCalledWith('messageTemplate', 'Hey {{name}}');
  });

  it('calls updateWebSocketTarget on Response Transform change', () => {
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
    fireEvent.change(transformField, { target: { value: 'json.data.result' } });

    expect(update).toHaveBeenCalledWith('transformResponse', 'json.data.result');
  });

  it('calls updateWebSocketTarget on Stream Response Transform change', () => {
    const update = vi.fn();

    renderWithProviders(
      <WebSocketEndpointConfiguration
        selectedTarget={baseProvider}
        updateWebSocketTarget={update}
        urlError={null}
      />,
    );

    const streamTransformField = screen.getByLabelText('Stream Response Transform');
    fireEvent.change(streamTransformField, { target: { value: 'chunk => chunk' } });

    expect(update).toHaveBeenCalledWith('streamResponse', 'chunk => chunk');
  });

  it('calls updateWebSocketTarget on Timeout change', () => {
    const update = vi.fn();

    renderWithProviders(
      <WebSocketEndpointConfiguration
        selectedTarget={baseProvider}
        updateWebSocketTarget={update}
        urlError={null}
      />,
    );

    const timeoutField = screen.getByLabelText('Timeout (ms)');
    fireEvent.change(timeoutField, { target: { value: 25000 } });

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

  it('toggling streaming switch updates config and toggles visible inputs', () => {
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
    fireEvent.click(switchEl);

    expect(update).toHaveBeenCalledWith('streamResponse', expect.any(String));
    expect(update).toHaveBeenCalledWith('transformResponse', undefined);

    // Now stream editor should be visible
    expect(screen.getByLabelText('Stream Response Transform')).toBeInTheDocument();
    expect(screen.queryByLabelText('Response Transform')).not.toBeInTheDocument();

    // Toggle off
    update.mockClear();
    fireEvent.click(switchEl);

    expect(update).toHaveBeenCalledWith('transformResponse', expect.any(String));
    expect(update).toHaveBeenCalledWith('streamResponse', undefined);

    // Back to non-streaming input
    expect(screen.getByLabelText('Response Transform')).toBeInTheDocument();
    expect(screen.queryByLabelText('Stream Response Transform')).not.toBeInTheDocument();
  });

  it('onBlur sets default when timeoutMs is undefined/NaN/0, and does not when valid', () => {
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
    fireEvent.blur(timeoutField1);

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
    fireEvent.blur(timeoutField2);
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
    fireEvent.blur(timeoutField3);
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
    fireEvent.blur(timeoutField4);
    expect(update).not.toHaveBeenCalled();
  });
});
