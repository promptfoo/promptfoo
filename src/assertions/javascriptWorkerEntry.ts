import { createRequire } from 'node:module';
import path from 'node:path';
import { parentPort, workerData } from 'node:worker_threads';

import cliState from '../cliState';
import { isPackagePath, loadFromPackage } from '../providers/packageParser';
import { parseFileUrl } from '../util/functions/loadFunction';
import { getProcessShim } from '../util/processShim';
import {
  cloneJavascriptWorkerData,
  JavascriptProviderResultSchema,
  MAX_PENDING_PROVIDER_CALLS,
} from './javascriptWorkerProtocol';
import { loadFromJavaScriptFile } from './utils';

import type { ApiProvider, AssertionValueFunctionContext } from '../types/index';
import type { JavascriptWorkerRequest } from './javascriptWorkerProtocol';

if (!parentPort) {
  throw new Error('JavaScript assertion worker requires a parent port');
}
const port = parentPort;
const request = workerData as JavascriptWorkerRequest;
let nextCallId = 0;
const pending = new Map<
  number,
  { resolve: (value: unknown) => void; reject: (error: Error) => void }
>();
port.on('message', (raw: unknown) => {
  const message = JavascriptProviderResultSchema.parse(raw);
  const call = pending.get(message.callId);
  if (!call) {
    return;
  }
  pending.delete(message.callId);
  if (message.ok) {
    call.resolve(message.result);
  } else {
    call.reject(new Error(message.message));
  }
});

const provider = request.context.provider;
const context: AssertionValueFunctionContext = {
  ...request.context,
  provider: provider
    ? ({
        id: () => provider.id,
        label: provider.label,
        config: provider.config,
        callApi: (prompt, callContext, options) => {
          if (pending.size >= MAX_PENDING_PROVIDER_CALLS) {
            return Promise.reject(
              new Error('Worker assertions support at most eight pending provider calls'),
            );
          }
          const args = cloneJavascriptWorkerData([prompt, callContext, options]);
          return new Promise((resolve, reject) => {
            const callId = ++nextCallId;
            pending.set(callId, { resolve: resolve as (value: unknown) => void, reject });
            try {
              port.postMessage({ type: 'callApi', callId, args });
            } catch (error) {
              pending.delete(callId);
              reject(error);
            }
          });
        },
      } satisfies ApiProvider)
    : undefined,
};

async function execute(): Promise<unknown> {
  if (request.value.startsWith('file://')) {
    const { filePath, functionName } = parseFileUrl(request.value);
    return loadFromJavaScriptFile(path.resolve(request.basePath, filePath), functionName, [
      request.output,
      context,
    ]);
  }
  if (isPackagePath(request.value)) {
    const fn = await loadFromPackage(request.value, request.basePath);
    if (typeof fn !== 'function') {
      throw new Error('Package JavaScript assertion must export a function');
    }
    return fn(request.output, context);
  }
  const fn = new Function('output', 'context', 'process', request.functionBody);
  return fn(request.output, context, getProcessShim(createRequire(import.meta.url)));
}

void cliState
  .withBasePath(request.basePath, () =>
    cliState.withEnvFileOverrides(request.envFileOverrides, () =>
      cliState.withEnv(request.env, execute),
    ),
  )
  .then(
    (result) => {
      try {
        port.postMessage({ type: 'result', result: cloneJavascriptWorkerData(result) });
      } catch (error) {
        port.postMessage({
          type: 'error',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
    (error: unknown) =>
      port.postMessage({
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
      }),
  );
