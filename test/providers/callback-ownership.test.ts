import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadApiProvider } from '../../src/providers';

import type { ProviderOptions } from '../../src/types';

afterEach(() => {
  vi.restoreAllMocks();
});

describe.each(['google:live:gemini-3.8-live', 'openai:assistant:asst_test'])(
  '%s callback ownership through the public loader',
  (providerId) => {
    it.each(['toString', 'constructor', '__proto__'])(
      'retains the explicitly configured %s callback',
      async (name) => {
        const callback = vi.fn(() => 'configured result');
        const callbacks = Object.fromEntries([[name, callback]]);
        const provider = await loadApiProvider(providerId, {
          options: { config: { apiKey: 'test-key', functionToolCallbacks: callbacks } },
        });
        const loaded = (provider.config as NonNullable<ProviderOptions['config']>)
          .functionToolCallbacks;

        expect(Object.hasOwn(loaded, name)).toBe(true);
        expect(loaded[name]).toBe(callback);
        expect(callback).not.toHaveBeenCalled();
      },
    );

    it('does not promote inherited callbacks or execute their getters while loading', async () => {
      const inherited = vi.fn(() => 'inherited result');
      const getter = vi.fn(() => inherited);
      const callbacks = Object.create(
        Object.defineProperty({}, 'inherited', { enumerable: true, get: getter }),
      );
      const provider = await loadApiProvider(providerId, {
        options: { config: { apiKey: 'test-key', functionToolCallbacks: callbacks } },
      });
      const loaded = (provider.config as NonNullable<ProviderOptions['config']>)
        .functionToolCallbacks;

      expect(Object.hasOwn(loaded, 'inherited')).toBe(false);
      expect(getter).not.toHaveBeenCalled();
      expect(inherited).not.toHaveBeenCalled();
    });
  },
);
