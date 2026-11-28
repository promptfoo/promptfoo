import editor from '@inquirer/editor';
import input from '@inquirer/input';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ManualInputProvider } from '../../src/providers/manualInput';

vi.mock('@inquirer/editor', () => ({ default: vi.fn() }));
vi.mock('@inquirer/input', () => ({ default: vi.fn() }));

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

describe('ManualInputProvider', () => {
  it.each([
    { multiline: false, prompt: input },
    { multiline: true, prompt: editor },
  ])('cancels a pending prompt when multiline is $multiline', async ({ multiline, prompt }) => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const controller = new AbortController();
    const reason = new DOMException('Evaluation cancelled', 'AbortError');
    vi.mocked(prompt).mockImplementation((_config, context) => {
      const signal = context?.signal;
      const answer = signal
        ? new Promise<string>((_resolve, reject) => {
            signal.addEventListener(
              'abort',
              () => reject(new Error('Prompt was aborted', { cause: signal.reason })),
              { once: true },
            );
          })
        : Promise.resolve('prompt was not cancelled');
      return Object.assign(answer, { cancel: vi.fn() });
    });

    const pending = new ManualInputProvider({ config: { multiline } }).callApi(
      'Write a response',
      undefined,
      { abortSignal: controller.signal },
    );
    controller.abort(reason);

    await expect(pending).rejects.toBe(reason);
  });
});
