import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { EventEmitter } from 'node:events';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { runJavascriptInWorker } from '../../src/assertions/javascriptWorker';
import * as esm from '../../src/esm';

const transport = vi.hoisted(() => ({
  entry: undefined as URL | undefined,
  worker: undefined as
    | (EventEmitter & {
        terminate: ReturnType<typeof vi.fn>;
        postMessage: ReturnType<typeof vi.fn>;
      })
    | undefined,
}));
vi.mock('node:worker_threads', async () => {
  const { EventEmitter } = await import('node:events');
  return {
    Worker: class extends EventEmitter {
      terminate = vi.fn().mockResolvedValue(0);
      postMessage = vi.fn();
      constructor(entry: URL) {
        super();
        transport.entry = entry;
        transport.worker = this;
      }
    },
  };
});

function execute(provider?: Parameters<typeof runJavascriptInWorker>[0]['context']['provider']) {
  return runJavascriptInWorker({
    value: 'true',
    functionBody: 'return true',
    output: 'fixture',
    context: {
      prompt: 'fixture',
      vars: {},
      test: {},
      logProbs: undefined,
      provider,
      providerResponse: { output: 'fixture' },
    },
  });
}

describe('JavaScript worker transport cleanup', () => {
  afterEach(() => {
    vi.resetAllMocks();
    transport.entry = undefined;
    transport.worker = undefined;
  });

  it('uses the shared built worker when invoked by the server bundle', async () => {
    const root = path.resolve('dist/src');
    vi.stubGlobal('BUILD_FORMAT', 'esm');
    const getDirectory = vi.spyOn(esm, 'getDirectory').mockReturnValue(path.join(root, 'server'));
    try {
      const pending = execute();
      transport.worker!.emit('message', { type: 'result', result: true });
      await pending;
      expect(transport.entry?.href).toBe(
        pathToFileURL(path.join(root, 'assertions/javascriptWorkerEntry.js')).href,
      );
    } finally {
      getDirectory.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it.each(['error', 'messageerror'])('terminates and rejects on %s', async (event) => {
    const pending = execute();
    const rejected = expect(pending).rejects.toThrow('Transport failed');
    const worker = transport.worker!;
    worker.emit(event, new Error('Transport failed'));
    await rejected;
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(worker.eventNames()).toEqual([]);
  });

  it('cancels callbacks and terminates if neither the reply nor its error can be sent', async () => {
    let callbackSignal: AbortSignal | undefined;
    const callApi = vi.fn(async (_prompt, _context, options) => {
      callbackSignal = options.abortSignal;
      return { output: 'reply' };
    });
    const pending = execute({ id: () => 'fixture', callApi });
    const rejected = expect(pending).rejects.toThrow('Port closed');
    const worker = transport.worker!;
    worker.postMessage.mockImplementation(() => {
      throw new Error('Port closed');
    });
    worker.emit('message', { type: 'callApi', callId: 1, args: ['fixture', undefined, undefined] });
    await rejected;
    expect(callApi).toHaveBeenCalledOnce();
    expect(callbackSignal?.aborted).toBe(true);
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(worker.eventNames()).toEqual([]);
  });
});
