import { useEffect, useRef, useState } from 'react';

import Editor from '@app/components/ui/code-editor';
import { HelperText } from '@app/components/ui/helper-text';
import { Input } from '@app/components/ui/input';
import { Label } from '@app/components/ui/label';
import { NumberInput } from '@app/components/ui/number-input';
import { Switch } from '@app/components/ui/switch';
import { Textarea } from '@app/components/ui/textarea';
import Prism from '@app/lib/prism';
import { cn } from '@app/lib/utils';
import dedent from 'dedent';
import {
  DEFAULT_WEBSOCKET_STREAM_RESPONSE,
  DEFAULT_WEBSOCKET_TIMEOUT_MS,
  DEFAULT_WEBSOCKET_TRANSFORM_RESPONSE,
} from './consts';

import type { ProviderOptions } from '../../types';

interface WebSocketEndpointConfigurationProps {
  selectedTarget: ProviderOptions;
  updateWebSocketTarget: (field: string, value: unknown) => void;
  urlError: string | null;
}

const formatProtocols = (protocols: unknown): string => {
  if (Array.isArray(protocols)) {
    return protocols.join(', ');
  }
  return typeof protocols === 'string' ? protocols : '';
};

const parseProtocols = (value: string): string[] | undefined => {
  const protocols = value
    .split(',')
    .map((protocol) => protocol.trim())
    .filter(Boolean);

  return protocols.length > 0 ? protocols : undefined;
};

const hasRawWebSocketProtocolHeader = (headers: unknown): boolean => {
  return (
    headers != null &&
    typeof headers === 'object' &&
    Object.keys(headers).some((key) => key.toLowerCase() === 'sec-websocket-protocol')
  );
};

const highlightJS = (code: string): string => {
  try {
    const grammar = Prism?.languages?.javascript;
    if (!grammar) {
      return code;
    }
    return Prism.highlight(code, grammar, 'javascript');
  } catch {
    return code;
  }
};

const WebSocketEndpointConfiguration = ({
  selectedTarget,
  updateWebSocketTarget,
  urlError,
}: WebSocketEndpointConfigurationProps) => {
  const targetUrl =
    (typeof selectedTarget.config.url === 'string' && selectedTarget.config.url.trim()) ||
    (/^wss?:\/\//i.test(selectedTarget.id) ? selectedTarget.id : '');
  const formattedProtocols = formatProtocols(selectedTarget.config.protocols);
  const [protocolsInput, setProtocolsInput] = useState(() => formattedProtocols);
  const isProtocolsInputFocused = useRef(false);
  const [streamResponse, setStreamResponse] = useState(
    Boolean(selectedTarget.config.streamResponse),
  );
  useEffect(() => {
    if (!isProtocolsInputFocused.current) {
      setProtocolsInput(formattedProtocols);
    }
  }, [formattedProtocols]);
  return (
    <div className="mt-4">
      <h3 className="mb-4 text-lg font-semibold">Custom WebSocket Endpoint Configuration</h3>
      <div className="rounded-lg border border-border p-4">
        <div className="space-y-2">
          <Label htmlFor="websocket-url">WebSocket URL</Label>
          <Input
            id="websocket-url"
            value={targetUrl}
            onChange={(e) => updateWebSocketTarget('url', e.target.value)}
            className={cn(urlError && 'border-destructive')}
          />
          {urlError && <HelperText error>{urlError}</HelperText>}
        </div>

        <div className="mt-4 space-y-2">
          <Label htmlFor="message-template">Message Template</Label>
          <Textarea
            id="message-template"
            value={selectedTarget.config.messageTemplate ?? ''}
            onChange={(e) => updateWebSocketTarget('messageTemplate', e.target.value)}
            rows={3}
          />
        </div>

        <div className="mt-4 space-y-2">
          <Label htmlFor="websocket-protocols">WebSocket Subprotocols</Label>
          <Input
            id="websocket-protocols"
            value={protocolsInput}
            onChange={(e) => {
              setProtocolsInput(e.target.value);
              updateWebSocketTarget('protocols', parseProtocols(e.target.value));
            }}
            onFocus={() => {
              isProtocolsInputFocused.current = true;
            }}
            onBlur={() => {
              isProtocolsInputFocused.current = false;
              setProtocolsInput(formattedProtocols);
            }}
            placeholder="json, graphql-transport-ws"
          />
          <p className="text-sm text-muted-foreground">
            Optional comma-separated subprotocols to request during the WebSocket handshake.
          </p>
          {hasRawWebSocketProtocolHeader(selectedTarget.config.headers) && (
            <p className="text-sm text-muted-foreground">
              If your <code>Sec-WebSocket-Protocol</code> header is a negotiated subprotocol, move
              it here. Leave it in headers only when your endpoint expects a raw header.
            </p>
          )}
        </div>

        <div className="mt-4">
          <NumberInput
            fullWidth
            label="Timeout (ms)"
            onBlur={() => {
              if (
                selectedTarget.config.timeoutMs === undefined ||
                Number.isNaN(selectedTarget.config.timeoutMs)
              ) {
                updateWebSocketTarget(
                  'timeoutMs',
                  selectedTarget.config.timeoutMs || DEFAULT_WEBSOCKET_TIMEOUT_MS,
                );
              }
            }}
            value={selectedTarget.config.timeoutMs}
            onChange={(val) => updateWebSocketTarget('timeoutMs', val)}
          />
        </div>

        <div className="mt-4 space-y-2">
          <Label htmlFor="stream-response">Stream Response</Label>
          <p className="text-sm text-muted-foreground">
            Configure your WebSocket to stream responses instead of returning a single response per
            prompt.
          </p>
          <Switch
            id="stream-response"
            checked={streamResponse}
            onCheckedChange={(checked) => {
              setStreamResponse(checked);
              if (checked) {
                updateWebSocketTarget('streamResponse', DEFAULT_WEBSOCKET_STREAM_RESPONSE);
                updateWebSocketTarget('transformResponse', undefined);
              } else {
                updateWebSocketTarget('transformResponse', DEFAULT_WEBSOCKET_TRANSFORM_RESPONSE);
                updateWebSocketTarget('streamResponse', undefined);
              }
            }}
          />
        </div>

        {streamResponse ? (
          <div className="mt-4 space-y-2">
            <Label htmlFor="stream-response-transform">Stream Response Transform</Label>
            <p className="text-sm text-muted-foreground">
              Extract specific data from the WebSocket messages. See{' '}
              <a
                href="https://www.promptfoo.dev/docs/providers/websocket/#streaming-responses"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                docs
              </a>{' '}
              for more information.
            </p>
            <div className="relative rounded-md border border-border bg-card">
              <Editor
                id="stream-response-transform"
                aria-describedby="stream-response-helper-text"
                value={selectedTarget.config.streamResponse ?? DEFAULT_WEBSOCKET_STREAM_RESPONSE}
                onValueChange={(code) => updateWebSocketTarget('streamResponse', code)}
                highlight={highlightJS}
                padding={10}
                placeholder={dedent`Optional: Accumulate/Transform streaming WebSocket responses.
            Provide a function that receives (accumulator, event, context) and
            returns [nextAccumulator, isComplete]. Example:

            ${DEFAULT_WEBSOCKET_STREAM_RESPONSE}`}
                style={{
                  fontFamily: '"Fira code", "Fira Mono", monospace',
                  fontSize: 14,
                  minHeight: '150px',
                }}
              />
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            <Label htmlFor="response-transform">Response Transform</Label>
            <Input
              id="response-transform"
              value={selectedTarget.config.transformResponse ?? ''}
              onChange={(e) => updateWebSocketTarget('transformResponse', e.target.value)}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default WebSocketEndpointConfiguration;
