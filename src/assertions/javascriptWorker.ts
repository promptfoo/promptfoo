import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';

import cliState from '../cliState';
import { getDirectory, resolvePackageEntryPoint } from '../esm';
import { getProviderCallExecutionContext } from '../scheduler/providerCallExecutionContext';
import {
  cloneJavascriptWorkerData,
  JavascriptWorkerMessageSchema,
  MAX_PENDING_PROVIDER_CALLS,
} from './javascriptWorkerProtocol';

import type { AssertionValueFunctionContext, CallApiContextParams } from '../types/index';
import type { JavascriptWorkerRequest } from './javascriptWorkerProtocol';

declare const BUILD_FORMAT: 'esm' | 'cjs' | undefined;

export async function runJavascriptInWorker({
  value,
  functionBody,
  output,
  context,
}: {
  value: string;
  functionBody: string;
  output: unknown;
  context: AssertionValueFunctionContext;
}): Promise<unknown> {
  const signal = getProviderCallExecutionContext()?.abortSignal;
  signal?.throwIfAborted();
  const provider = context.provider;
  const request: JavascriptWorkerRequest = cloneJavascriptWorkerData({
    value,
    functionBody,
    output,
    context: {
      ...context,
      provider: provider
        ? { id: provider.id(), label: provider.label, config: provider.config }
        : undefined,
    },
    basePath: cliState.basePath || process.cwd(),
    env: cliState.env,
    envFileOverrides: cliState.envFileOverrides,
  });
  const built = typeof BUILD_FORMAT !== 'undefined';
  const entry = path.join(
    getDirectory(),
    'assertions',
    `javascriptWorkerEntry.${built ? 'js' : 'ts'}`,
  );
  const execArgv: string[] = [];
  if (!built) {
    const loader = resolvePackageEntryPoint('tsx', getDirectory());
    if (!loader) {
      throw new Error('The JavaScript assertion worker requires tsx when running from source');
    }
    execArgv.push('--import', pathToFileURL(loader).href);
  }
  const worker = new Worker(pathToFileURL(entry), {
    workerData: request,
    ...(built ? {} : { execArgv }),
  });

  return new Promise((resolve, reject) => {
    let settled = false;
    const callbackController = new AbortController();
    const callbackSignal = signal
      ? AbortSignal.any([signal, callbackController.signal])
      : callbackController.signal;
    const activeCalls = new Set<number>();
    async function finish(error?: Error, result?: unknown): Promise<void> {
      if (settled) {
        return;
      }
      settled = true;
      callbackController.abort();
      signal?.removeEventListener('abort', onAbort);
      try {
        await worker.terminate();
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      } catch (terminationError) {
        reject(terminationError);
      } finally {
        worker.removeAllListeners();
      }
    }
    function onAbort(): void {
      void finish(new Error('Worker JavaScript assertion aborted'));
    }
    worker.on('error', (error) => void finish(error));
    worker.on('exit', (code) => {
      if (!settled) {
        void finish(new Error(`JavaScript assertion worker exited without a result (${code})`));
      }
    });
    async function callProvider(
      message: Extract<ReturnType<typeof JavascriptWorkerMessageSchema.parse>, { type: 'callApi' }>,
    ): Promise<void> {
      if (
        !provider ||
        activeCalls.has(message.callId) ||
        activeCalls.size >= MAX_PENDING_PROVIDER_CALLS
      ) {
        await finish(
          new Error('Worker provider callback is unavailable or exceeds the pending-call limit'),
        );
        return;
      }
      activeCalls.add(message.callId);
      try {
        const [prompt, callContext, options] = cloneJavascriptWorkerData(message.args);
        const result = await provider.callApi(
          prompt,
          callContext as CallApiContextParams | undefined,
          {
            ...options,
            abortSignal: callbackSignal,
          },
        );
        if (!settled) {
          worker.postMessage({
            callId: message.callId,
            ok: true,
            result: cloneJavascriptWorkerData(result),
          });
        }
      } catch (error) {
        if (!settled) {
          worker.postMessage({
            callId: message.callId,
            ok: false,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      } finally {
        activeCalls.delete(message.callId);
      }
    }
    worker.on('messageerror', (error) => void finish(error));
    worker.on('message', (raw: unknown) => {
      if (settled) {
        return;
      }
      const parsed = JavascriptWorkerMessageSchema.safeParse(raw);
      if (!parsed.success) {
        void finish(new Error('Invalid JavaScript assertion worker message'));
        return;
      }
      const message = parsed.data;
      if (message.type === 'result') {
        void finish(undefined, message.result);
      } else if (message.type === 'error') {
        void finish(new Error(message.message));
      } else {
        void callProvider(message).catch((error) => finish(error));
      }
    });
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) {
      onAbort();
    }
  });
}
