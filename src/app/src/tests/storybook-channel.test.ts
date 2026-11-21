import { PostMessageTransport } from 'storybook/internal/channels';
import { describe, expect, it, vi } from 'vitest';
import { mockBrowserProperty, restoreBrowserMocks } from './browserMocks';

describe('Storybook development preview channel', () => {
  it('accepts local messages and rejects messages from an untrusted embedding page', () => {
    mockBrowserProperty(globalThis, 'CONFIG_TYPE', 'DEVELOPMENT');
    mockBrowserProperty(globalThis, 'INSECURE_IFRAME_MESSAGING', false);
    const listeners = vi.spyOn(globalThis, 'addEventListener');
    const handler = vi.fn();

    try {
      const transport = new PostMessageTransport({ page: 'preview' });
      transport.setHandler(handler);
      const send = (origin: string, id: string) => {
        window.dispatchEvent(
          new MessageEvent('message', {
            origin,
            data: {
              key: 'storybook-channel',
              event: { type: 'storybook/highlight/add', args: [{ id, selectors: ['button'] }] },
            },
          }),
        );
      };

      send(window.location.origin, 'trusted');
      expect(handler).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          type: 'storybook/highlight/add',
          args: [{ id: 'trusted', selectors: ['button'] }],
        }),
      );

      // GHSA-f2ph-cmg5-wxc8: an embedding website must not control the local preview.
      send('https://untrusted.invalid', 'untrusted');
      expect(handler).toHaveBeenCalledTimes(1);
    } finally {
      // The exported transport registers a listener but does not expose dispose().
      for (const [type, listener, options] of listeners.mock.calls) {
        globalThis.removeEventListener(type, listener, options);
      }
      listeners.mockRestore();
      restoreBrowserMocks();
    }
  });
});
