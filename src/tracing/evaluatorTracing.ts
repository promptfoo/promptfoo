import { randomBytes } from 'crypto';

import { SpanKind, trace } from '@opentelemetry/api';
import { getEnvBool } from '../envars';
import logger from '../logger';
import telemetry from '../telemetry';
import { PromptfooAttributes } from './genaiTracer';
import { isOtelInitialized } from './otelSdk';
import type { Span } from '@opentelemetry/api';

import type { EvaluateOptions, TestCase, TestSuite } from '../types/index';

// Track whether OTLP receiver has been started
let otlpReceiverStarted = false;

/**
 * Reset module state (for testing purposes).
 * This should be called between test runs to ensure clean state.
 */
export function resetTracingState(): void {
  otlpReceiverStarted = false;
  logger.debug('[EvaluatorTracing] Tracing state reset');
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
  logger.debug(`[EvaluatorTracing] Checking tracing config: ${JSON.stringify(testSuite.tracing)}`);
  logger.debug(`[EvaluatorTracing] testSuite keys: ${Object.keys(testSuite)}`);
  logger.debug(
    `[EvaluatorTracing] Full testSuite.tracing: ${JSON.stringify(testSuite.tracing, null, 2)}`,
  );

  const envTracingEnabled =
    getEnvBool('PROMPTFOO_OTEL_ENABLED', false) || getEnvBool('PROMPTFOO_TRACING_ENABLED', false);
  const suiteTracingEnabled = testSuite.tracing?.enabled === true;
  const tracingEnabled = suiteTracingEnabled || envTracingEnabled;
  const httpReceiverEnabled = testSuite.tracing?.otlp?.http?.enabled !== false;

  if (tracingEnabled && httpReceiverEnabled && !otlpReceiverStarted) {
    telemetry.record('feature_used', {
      feature: 'tracing',
    });
    try {
      logger.debug('[EvaluatorTracing] Tracing configuration detected, starting OTLP receiver');
      const { startOTLPReceiver } = await import('./otlpReceiver');
      const port = testSuite.tracing?.otlp?.http?.port || 4318;
      const host = testSuite.tracing?.otlp?.http?.host || '127.0.0.1';
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
      logger.debug(
        `[EvaluatorTracing] tracing.enabled: ${testSuite.tracing?.enabled} (env enabled: ${envTracingEnabled})`,
      );
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
 *
 * Tracing is enabled if any of the following are true:
 * 1. Test case metadata has `tracingEnabled: true`
 * 2. TestSuite YAML config has `tracing.enabled: true`
 * 3. Environment variable `PROMPTFOO_TRACING_ENABLED` is set to true
 */
export function isTracingEnabled(test: TestCase, testSuite?: TestSuite): boolean {
  const metadataEnabled = test.metadata?.tracingEnabled === true;
  const yamlConfigEnabled = testSuite?.tracing?.enabled === true;
  // `PROMPTFOO_OTEL_ENABLED` is the preferred flag; keep `PROMPTFOO_TRACING_ENABLED`
  // as a backwards-compatible alias.
  const envEnabled =
    getEnvBool('PROMPTFOO_OTEL_ENABLED', false) || getEnvBool('PROMPTFOO_TRACING_ENABLED', false);

  const result = metadataEnabled || yamlConfigEnabled || envEnabled;

  logger.debug(
    `[EvaluatorTracing] isTracingEnabled check: metadata=${metadataEnabled}, yamlConfig=${yamlConfigEnabled}, env=${envEnabled}, result=${result}`,
  );
  return result;
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
  traceId?: string;
  rootSpan?: Span;
} | null> {
  const tracingEnabled = isTracingEnabled(test, testSuite);

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

  // Get evaluation ID from test metadata (set by Evaluator class)
  let evaluationId = test.metadata?.evaluationId || evaluateOptions?.eventSource;
  if (!evaluationId) {
    logger.warn(
      '[EvaluatorTracing] No evaluation ID found in test metadata or evaluateOptions, trace will not be linked to evaluation',
    );
    evaluationId = `eval-${Date.now()}`;
  }
  const testCaseId = test.metadata?.testCaseId || (test as any).id || `${testIdx}-${promptIdx}`;

  // Create a real root span when the OTEL SDK is initialized.
  // This ensures we have an actual parent span in storage/UI instead of a dangling parentSpanId.
  let traceId: string;
  let traceparent: string;
  let rootSpan: Span | undefined;

  if (isOtelInitialized()) {
    const tracer = trace.getTracer('promptfoo.evaluator');
    rootSpan = tracer.startSpan('promptfoo.testcase', {
      kind: SpanKind.INTERNAL,
      attributes: {
        [PromptfooAttributes.EVAL_ID]: evaluationId,
        // This attribute is used for deterministic correlation (OTLP receiver + UI filtering)
        [PromptfooAttributes.TEST_CASE_ID]: testCaseId,
        [PromptfooAttributes.TEST_INDEX]: testIdx,
        [PromptfooAttributes.PROMPT_INDEX]: promptIdx,
      },
    });

    const ctx = rootSpan.spanContext();
    traceId = ctx.traceId;
    const traceFlags = ctx.traceFlags.toString(16).padStart(2, '0');
    traceparent = `00-${ctx.traceId}-${ctx.spanId}-${traceFlags}`;
    logger.debug(
      `[EvaluatorTracing] Started root span for test case: traceId=${traceId}, spanId=${ctx.spanId}`,
    );
  } else {
    // Fallback for cases where tracing is enabled but the OTEL SDK isn't initialized.
    // This preserves legacy behavior and still enables cross-process correlation.
    traceId = generateTraceId();
    const spanId = generateSpanId();
    traceparent = generateTraceparent(traceId, spanId);
    logger.debug(
      `[EvaluatorTracing] Generated trace context without OTEL SDK: traceId=${traceId}, spanId=${spanId}`,
    );
  }

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
    traceId,
    rootSpan,
  };
}
