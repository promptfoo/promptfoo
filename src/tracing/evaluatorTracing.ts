import { randomBytes } from 'crypto';
import logger from '../logger';
import type { TestCase, TestSuite } from '../types';

// Track whether OTLP receiver has been started
let otlpReceiverStarted = false;

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
  logger.debug(`[EvaluatorTracing] Checking tracing config: ${JSON.stringify(testSuite.tracing)}`);
  logger.debug(`[EvaluatorTracing] testSuite keys: ${Object.keys(testSuite)}`);
  logger.debug(
    `[EvaluatorTracing] Full testSuite.tracing: ${JSON.stringify(testSuite.tracing, null, 2)}`,
  );

  if (
    testSuite.tracing?.enabled &&
    testSuite.tracing?.otlp?.http?.enabled &&
    !otlpReceiverStarted
  ) {
    try {
      logger.debug('[EvaluatorTracing] Tracing configuration detected, starting OTLP receiver');
      const { startOTLPReceiver } = await import('./otlpReceiver');
      const port = testSuite.tracing.otlp.http.port || 4318;
      const host = testSuite.tracing.otlp.http.host || '0.0.0.0';
      logger.debug(`[EvaluatorTracing] Starting OTLP receiver on ${host}:${port}`);
      await startOTLPReceiver(port, host);
      otlpReceiverStarted = true;
      logger.info(
        `[EvaluatorTracing] OTLP receiver successfully started on port ${port} for tracing`,
      );
    } catch (error) {
      logger.error(`[EvaluatorTracing] Failed to start OTLP receiver: ${error}`);
    }
  } else {
    if (otlpReceiverStarted) {
      logger.debug('[EvaluatorTracing] OTLP receiver already started, skipping initialization');
    } else {
      logger.debug('[EvaluatorTracing] Tracing not enabled or OTLP HTTP receiver not configured');
      logger.debug(`[EvaluatorTracing] tracing.enabled: ${testSuite.tracing?.enabled}`);
      logger.debug(
        `[EvaluatorTracing] tracing.otlp.http.enabled: ${testSuite.tracing?.otlp?.http?.enabled}`,
      );
    }
  }
}

/**
 * Stop the OTLP receiver if it was started
 */
export async function stopOtlpReceiverIfNeeded(): Promise<void> {
  if (otlpReceiverStarted) {
    try {
      logger.debug('[EvaluatorTracing] Stopping OTLP receiver');
      const { stopOTLPReceiver } = await import('./otlpReceiver');
      await stopOTLPReceiver();
      otlpReceiverStarted = false;
      logger.info('[EvaluatorTracing] OTLP receiver stopped successfully');
    } catch (error) {
      logger.error(`[EvaluatorTracing] Failed to stop OTLP receiver: ${error}`);
    }
  }
}

/**
 * Check if tracing is enabled for a test case
 */
export function isTracingEnabled(test: TestCase, testSuite?: TestSuite): boolean {
  return test.metadata?.tracingEnabled === true || process.env.PROMPTFOO_TRACING_ENABLED === 'true';
}

/**
 * Generate trace context and create trace record if tracing is enabled
 */
export async function generateTraceContextIfNeeded(
  test: TestCase,
  evaluateOptions: any,
  testIdx: number,
  promptIdx: number,
): Promise<{
  traceparent?: string;
  evaluationId?: string;
  testCaseId?: string;
} | null> {
  const tracingEnabled = isTracingEnabled(test);

  if (tracingEnabled) {
    logger.debug('[EvaluatorTracing] Tracing enabled for test case');
    logger.debug(`[EvaluatorTracing] Test metadata: ${JSON.stringify(test.metadata)}`);
  }

  if (!tracingEnabled) {
    return null;
  }

  // Import trace store dynamically to avoid circular dependencies
  logger.debug('[EvaluatorTracing] Importing trace store');
  const { getTraceStore } = await import('./store');
  const traceStore = getTraceStore();

  // Generate trace context
  const traceId = generateTraceId();
  const spanId = generateSpanId();
  const traceparent = generateTraceparent(traceId, spanId);
  logger.debug(`[EvaluatorTracing] Generated trace context: traceId=${traceId}, spanId=${spanId}`);

  // Get evaluation ID from test metadata (set by Evaluator class)
  let evaluationId = test.metadata?.evaluationId || evaluateOptions?.eventSource;
  if (!evaluationId) {
    logger.warn(
      '[EvaluatorTracing] No evaluation ID found in test metadata or evaluateOptions, trace will not be linked to evaluation',
    );
    evaluationId = `eval-${Date.now()}`;
  }
  const testCaseId = test.metadata?.testCaseId || (test as any).id || `${testIdx}-${promptIdx}`;

  // Store trace association in trace store
  try {
    logger.debug(`[EvaluatorTracing] Creating trace record for traceId=${traceId}`);
    await traceStore.createTrace({
      traceId,
      evaluationId: evaluationId || '',
      testCaseId: testCaseId || '',
      metadata: {
        testIdx,
        promptIdx,
        vars: test.vars,
      },
    });
    logger.debug('[EvaluatorTracing] Trace record created successfully');
  } catch (error) {
    logger.error(`[EvaluatorTracing] Failed to create trace: ${error}`);
  }

  logger.debug(
    `[EvaluatorTracing] Trace context ready: ${traceparent} for test case ${testCaseId}`,
  );

  return {
    traceparent,
    evaluationId,
    testCaseId,
  };
}
