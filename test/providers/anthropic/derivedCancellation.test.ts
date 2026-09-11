import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { disableCache, enableCache } from '../../../src/cache';
import { AnthropicLlmRubricProvider } from '../../../src/providers/anthropic/defaults';
import { MetaMessagesProvider } from '../../../src/providers/meta';

import type { ApiProvider } from '../../../src/types/index';

beforeEach(() => {
  disableCache();
});

afterEach(() => {
  enableCache();
  vi.restoreAllMocks();
});

it.each([
  [
    'rubric',
    () => new AnthropicLlmRubricProvider('claude-sonnet-4-6', { config: { apiKey: 'fixture' } }),
  ],
  [
    'Meta Messages',
    () =>
      new MetaMessagesProvider('muse-spark-1.1', { config: { apiKey: 'fixture', stream: false } }),
  ],
] as const)('%s forwards cancellation to the Anthropic SDK', async (_name, createProvider) => {
  const provider = createProvider();
  const controller = new AbortController();
  let notifyStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    notifyStarted = resolve;
  });
  const create = vi
    .spyOn(provider.anthropic.messages, 'create')
    .mockImplementationOnce((_body, options) => {
      notifyStarted();
      return new Promise((_resolve, reject) => {
        if (!options?.signal) {
          reject(new Error('Missing request cancellation signal'));
          return;
        }
        options.signal.addEventListener('abort', () => reject(options.signal?.reason), {
          once: true,
        });
      }) as ReturnType<typeof provider.anthropic.messages.create>;
    });
  const cancellable: ApiProvider = provider;
  const pending = cancellable.callApi('A cancellation fixture', undefined, {
    abortSignal: controller.signal,
  });
  await started;
  controller.abort(new Error('cancelled derived request'));

  await expect(pending).resolves.toMatchObject({
    error: expect.stringContaining('cancelled derived request'),
  });
  expect(create.mock.calls[0][1]?.signal).toBe(controller.signal);
});
