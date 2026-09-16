import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withCacheEnabled } from '../../src/cache';
import { ReplicateImageProvider } from '../../src/providers/replicate';
import { fetchWithRetries } from '../../src/util/fetch/index';

vi.mock('../../src/util/fetch/index', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchWithRetries: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(fetchWithRetries).mockReset();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.resetAllMocks();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe.each(['creation', 'polling'])('Replicate image %s body reads', (phase) => {
  function startBodyRead() {
    const abortController = new AbortController();
    let bodyController: ReadableStreamDefaultController<Uint8Array>;
    let notifyReadStarted: () => void;
    const readStarted = new Promise<void>((resolve) => {
      notifyReadStarted = resolve;
    });
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          bodyController = controller;
          abortController.signal.addEventListener(
            'abort',
            () => {
              controller.error(abortController.signal.reason);
            },
            { once: true },
          );
        },
      }),
      { status: 200, statusText: 'OK' },
    );
    const readText = response.text.bind(response);
    vi.spyOn(response, 'text').mockImplementation(() => {
      const result = readText();
      notifyReadStarted();
      return result;
    });
    if (phase === 'polling') {
      vi.mocked(fetchWithRetries).mockResolvedValueOnce(
        Response.json({
          id: 'fixture-prediction',
          status: 'processing',
        }),
      );
    }
    vi.mocked(fetchWithRetries).mockResolvedValueOnce(response);
    const provider = new ReplicateImageProvider('owner/model', { config: { apiKey: 'fixture' } });
    const result = withCacheEnabled(false, () =>
      provider.callApi('Hello', undefined, {
        abortSignal: abortController.signal,
      }),
    ).catch((error) => error);
    return {
      abortController,
      readStarted,
      result,
      failBody: (error: Error) => bodyController.error(error),
    };
  }

  it.each(['Error', 'TimeoutError'])('normalizes a body-read %s abort', async (name) => {
    const { abortController, readStarted, result } = startBodyRead();
    await readStarted;
    const reason =
      name === 'Error'
        ? new Error('fixture body abort')
        : new DOMException('fixture body timeout', 'TimeoutError');
    abortController.abort(reason);
    expect(await result).toMatchObject({ name: 'AbortError', message: reason.message });
    expect(fetchWithRetries).toHaveBeenCalledTimes(phase === 'creation' ? 1 : 2);
    expect(
      vi
        .mocked(fetchWithRetries)
        .mock.calls.every(([, options]) => options?.signal === abortController.signal),
    ).toBe(true);
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetchWithRetries).toHaveBeenCalledTimes(phase === 'creation' ? 1 : 2);
  });

  it('preserves ordinary body failures and their cause without cancellation', async () => {
    const { abortController, readStarted, result, failBody } = startBodyRead();
    await readStarted;
    const reason = new Error('fixture broken body');
    failBody(reason);
    expect(await result).toMatchObject({
      name: 'Error',
      message: expect.stringContaining('Error reading response body'),
      cause: reason,
    });
    expect(abortController.signal.aborted).toBe(false);
    expect(fetchWithRetries).toHaveBeenCalledTimes(phase === 'creation' ? 1 : 2);
  });
});
