import logger from '../logger';
import {
  isOtlpReceiverStarted,
  startOtlpReceiverIfNeeded,
  stopOtlpReceiverIfNeeded,
} from '../tracing/evaluatorTracing';
import { getDefaultOtelConfig } from '../tracing/otelConfig';
import { acquireOtel } from '../tracing/otelSdk';
import { sleep } from '../util/time';

import type { EvaluatorTracingLifecycle } from '../evaluator/runtime';
import type { TestSuite } from '../types/index';

/** Node hosting policy for one evaluation; row-level tracing remains in the engine. */
export function createNodeTracingLifecycle(
  testSuite: TestSuite,
  evaluationId: string,
): EvaluatorTracingLifecycle {
  let receiverAcquired = false;
  let releaseSdk: (() => Promise<void>) | undefined;
  let startPromise: Promise<void> | undefined;
  let closePromise: Promise<void> | undefined;

  return {
    start() {
      startPromise ??= (async () => {
        receiverAcquired = await startOtlpReceiverIfNeeded(testSuite, evaluationId);
        releaseSdk = await acquireOtel(getDefaultOtelConfig());
      })();
      return startPromise;
    },
    close() {
      closePromise ??= (async () => {
        // start() may have acquired the receiver before SDK initialization failed.
        // The engine closes writers before calling us, including on partial start.
        const errors: unknown[] = [];
        try {
          await releaseSdk?.();
          releaseSdk = undefined;
        } catch (error) {
          errors.push(error);
        }
        try {
          if (receiverAcquired && isOtlpReceiverStarted()) {
            logger.debug('[Evaluator] Waiting for span exports to complete...');
            await sleep(3000);
          }
          await stopOtlpReceiverIfNeeded(receiverAcquired, evaluationId);
          receiverAcquired = false;
        } catch (error) {
          errors.push(error);
        }
        if (errors.length > 0) {
          // Failed receiver shutdown keeps its lease valid; permit a caller to retry close.
          closePromise = undefined;
          if (errors.length > 1) {
            logger.error('[Evaluator] Additional tracing cleanup error', { error: errors[1] });
          }
          throw errors[0];
        }
      })();
      return closePromise;
    },
  };
}
