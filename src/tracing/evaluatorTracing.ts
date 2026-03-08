import { randomBytes } from 'crypto';

import { getEnvBool } from '../envars';
import logger from '../logger';
import telemetry from '../telemetry';

import type { EvaluateOptions, TestCase, TestSuite } from '../types/index';

// Track whether OTLP receiver has been started
let otlpReceiverStarted = false;
let otlpReceiverStartPromise: Promise<void> | null = null;

/**
 * Reset module state (for testing purposes).
 * This should be called between test runs to ensure clean state.
 */
export function resetTracingState(): void {
  otlpReceiverStarted = false;
  otlpReceiverStartPromise = null;
}

/**
 * Generate a 16-byte trace ID
 */
export function generateTraceId(): string {
  return randomBytes(16).toString('hex');
}

/**
 * Generate an 8-byte span ID
 */
export function generateSpanId(): string {
  return randomBytes(8).toString('hex');
}

/**
 * Generate W3C Trace Context format traceparent header
 * Format: version-trace-id-parent-id-trace-flags
 */
export function generateTraceparent(
  traceId: string,
  spanId: string,
  sampled: boolean = true,
): string {
  const version = '00';
  const traceFlags = sampled ? '01' : '00';
  return `${version}-${traceId}-${spanId}-${traceFlags}`;
}

/**
 * Check if the OTLP receiver has been started
 */
export function isOtlpReceiverStarted(): boolean {
  return otlpReceiverStarted;
}

/**
 * Start the OTLP receiver if tracing is enabled and it hasn't been started yet
 */
export async function startOtlpReceiverIfNeeded(testSuite: TestSuite): Promise<void> {
  const tracingHttpConfig = testSuite.tracing?.otlp?.http;

  if (testSuite.tracing?.enabled && tracingHttpConfig?.enabled && otlpReceiverStarted === false) {
    if (otlpReceiverStartPromise !== null) {
      logger.debug('[EvaluatorTracing] OTLP receiver is already starting, awaiting startup');
      await otlpReceiverStartPromise;
      return;
    }

    telemetry.record('feature_used', {
      feature: 'tracing',
    });
    otlpReceiverStartPromise = (async () => {
      try {
        logger.debug('[EvaluatorTracing] Tracing configuration detected, starting OTLP receiver');
        const { startOTLPReceiver } = await import('./otlpReceiver');
        const port = tracingHttpConfig.port || 4318;
        const host = tracingHttpConfig.host || '127.0.0.1';
        logger.debug(`[EvaluatorTracing] Starting OTLP receiver on ${host}:${port}`);
        await startOTLPReceiver(port, host);
        otlpReceiverStarted = true;
        logger.info(
          `[EvaluatorTracing] OTLP receiver successfully started on port ${port} for tracing`,
        );
      } catch (error) {
        logger.error(`[EvaluatorTracing] Failed to start OTLP receiver: ${error}`);
      } finally {
        otlpReceiverStartPromise = null;
      }
    })();
    await otlpReceiverStartPromise;
  }
}

/**
 * Stop the OTLP receiver if it was started
 */
export async function stopOtlpReceiverIfNeeded(): Promise<void> {
  if (otlpReceiverStartPromise !== null) {
    await otlpReceiverStartPromise;
  }

  if (otlpReceiverStarted === true) {
    try {
      logger.debug('[EvaluatorTracing] Stopping OTLP receiver');
      const { stopOTLPReceiver } = await import('./otlpReceiver');
      await stopOTLPReceiver();
      otlpReceiverStarted = false;
      otlpReceiverStartPromise = null;
      logger.info('[EvaluatorTracing] OTLP receiver stopped successfully');
    } catch (error) {
      logger.error(`[EvaluatorTracing] Failed to stop OTLP receiver: ${error}`);
    }
  }
}

/**
 * Wait for the OTLP receiver to become idle before shutdown.
 * This lets late-arriving provider exports land without a fixed sleep.
 */
export async function waitForOtlpReceiverIdleIfNeeded(options?: {
  idleMs?: number;
  timeoutMs?: number;
  pollMs?: number;
}): Promise<boolean> {
  if (otlpReceiverStartPromise !== null) {
    await otlpReceiverStartPromise;
  }

  if (otlpReceiverStarted !== true) {
    return true;
  }

  try {
    const { waitForOTLPReceiverIdle } = await import('./otlpReceiver');
    return await waitForOTLPReceiverIdle(options);
  } catch (error) {
    logger.error(`[EvaluatorTracing] Failed while waiting for OTLP receiver idle state: ${error}`);
    return false;
  }
}

/**
 * Check if tracing is enabled for a test case
 *
 * Tracing is enabled if any of the following are true:
 * 1. Test case metadata has `tracingEnabled: true`
 * 2. TestSuite YAML config has `tracing.enabled: true`
 * 3. Environment variable `PROMPTFOO_TRACING_ENABLED` is set to true
 */
export function isTracingEnabled(test: TestCase, testSuite?: TestSuite): boolean {
  const metadataEnabled = test.metadata?.tracingEnabled === true;
  const yamlConfigEnabled = testSuite?.tracing?.enabled === true;
  const envEnabled = getEnvBool('PROMPTFOO_TRACING_ENABLED', false);

  return metadataEnabled || yamlConfigEnabled || envEnabled;
}

/**
 * Generate trace context and create trace record if tracing is enabled
 */
export async function generateTraceContextIfNeeded(
  test: TestCase,
  evaluateOptions: EvaluateOptions | undefined,
  testIdx: number,
  promptIdx: number,
  testSuite?: TestSuite,
): Promise<{
  traceparent?: string;
  evaluationId?: string;
  testCaseId?: string;
} | null> {
  const tracingEnabled = isTracingEnabled(test, testSuite);
  if (!tracingEnabled) {
    return null;
  }

  // Import trace store dynamically to avoid circular dependencies
  const { getTraceStore } = await import('./store');
  const traceStore = getTraceStore();

  // Generate trace context
  const traceId = generateTraceId();
  const spanId = generateSpanId();
  const traceparent = generateTraceparent(traceId, spanId);

  // Get evaluation ID from test metadata (set by Evaluator class)
  const evaluationId = test.metadata?.evaluationId || evaluateOptions?.eventSource;
  if (!evaluationId) {
    logger.warn(
      '[EvaluatorTracing] No evaluation ID found in test metadata or evaluateOptions, trace will not be linked to evaluation',
    );
  }
  const testCaseId = test.metadata?.testCaseId || (test as any).id || `${testIdx}-${promptIdx}`;

  // Store trace association in trace store
  if (evaluationId) {
    try {
      await traceStore.createTrace({
        traceId,
        evaluationId,
        testCaseId: testCaseId || '',
        metadata: {
          testIdx,
          promptIdx,
          vars: test.vars,
        },
      });
    } catch (error) {
      logger.error(`[EvaluatorTracing] Failed to create trace: ${error}`);
    }
  }

  return {
    traceparent,
    evaluationId,
    testCaseId,
  };
}
