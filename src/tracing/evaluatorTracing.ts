import { randomBytes } from 'crypto';

import { getEnvBool } from '../envars';
import logger from '../logger';
import telemetry from '../telemetry';

import type { TestCase, TestSuite } from '../types/index';
import type { InternalEvaluateOptions } from '../types/internal';

// Track whether OTLP receiver has been started
let otlpReceiverStarted = false;
let otlpReceiverStartPromise: Promise<void> | null = null;
let otlpReceiverStopPromise: Promise<void> | null = null;
let otlpReceiverUsers = 0;
const DEFAULT_OTLP_ACCEPT_FORMATS = ['json', 'protobuf'] as const;

function normalizeOtlpAcceptFormats(
  acceptFormats?: string[],
): Array<(typeof DEFAULT_OTLP_ACCEPT_FORMATS)[number]> {
  const normalized = (acceptFormats ?? []).filter(
    (format): format is (typeof DEFAULT_OTLP_ACCEPT_FORMATS)[number] =>
      format === 'json' || format === 'protobuf',
  );

  return normalized.length > 0 ? normalized : [...DEFAULT_OTLP_ACCEPT_FORMATS];
}

/**
 * Reset module state (for testing purposes).
 * This should be called between test runs to ensure clean state.
 */
export function resetTracingState(): void {
  otlpReceiverStarted = false;
  otlpReceiverStartPromise = null;
  otlpReceiverStopPromise = null;
  otlpReceiverUsers = 0;
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

function acquireStartedOtlpReceiver(): boolean {
  if (!otlpReceiverStarted) {
    return false;
  }

  otlpReceiverUsers += 1;
  logger.debug(
    `[EvaluatorTracing] OTLP receiver already started; preserving active receiver defaults for ${otlpReceiverUsers} active evaluations`,
  );
  return true;
}

function isTracingEnabledForSuite(testSuite: TestSuite): boolean {
  return (
    getEnvBool('PROMPTFOO_TRACING_ENABLED', false) ||
    testSuite.tracing?.enabled === true ||
    (typeof testSuite.defaultTest === 'object' &&
      testSuite.defaultTest?.metadata?.tracingEnabled === true) ||
    testSuite.tests?.some((test) => test.metadata?.tracingEnabled === true) === true
  );
}

function getOtlpReceiverTracePolicy(
  testSuite: TestSuite,
  evaluationId?: string,
): {
  evaluationId: string;
  commandToolNames?: string[];
  redactAttributes?: string[];
} | null {
  if (!evaluationId) {
    return null;
  }

  return {
    evaluationId,
    commandToolNames: testSuite.tracing?.commandToolNames,
    redactAttributes: testSuite.tracing?.otlp?.http?.redactAttributes,
  };
}

async function registerOtlpReceiverTracePolicyIfAvailable(
  tracePolicy: ReturnType<typeof getOtlpReceiverTracePolicy>,
): Promise<void> {
  if (!tracePolicy) {
    return;
  }

  const { registerOTLPReceiverTracePolicy } = await import('./otlpReceiver');
  registerOTLPReceiverTracePolicy(tracePolicy);
}

/**
 * Start the OTLP receiver if tracing is enabled and it hasn't been started yet
 */
export async function startOtlpReceiverIfNeeded(
  testSuite: TestSuite,
  evaluationId?: string,
): Promise<boolean> {
  logger.debug('[EvaluatorTracing] Checking tracing configuration', {
    tracing: testSuite.tracing,
    testSuiteKeys: Object.keys(testSuite),
  });

  const httpTracing = testSuite.tracing?.otlp?.http;
  const commandToolNames = testSuite.tracing?.commandToolNames;
  const tracingEnabled = isTracingEnabledForSuite(testSuite);
  if (tracingEnabled) {
    await pruneTraceStoreIfNeeded(testSuite);
  }

  if (tracingEnabled && httpTracing?.enabled) {
    const acceptFormats = normalizeOtlpAcceptFormats(httpTracing.acceptFormats);
    const redactAttributes = httpTracing.redactAttributes;
    const tracePolicy = getOtlpReceiverTracePolicy(testSuite, evaluationId);

    if (otlpReceiverStopPromise !== null) {
      await otlpReceiverStopPromise;
    }

    while (!acquireStartedOtlpReceiver()) {
      const pendingStart = otlpReceiverStartPromise;
      if (pendingStart === null) {
        break;
      }
      try {
        await pendingStart;
      } catch {
        // The initiating evaluation applies its failure policy. A waiter may retry below.
      }
    }
    if (otlpReceiverStarted) {
      await registerOtlpReceiverTracePolicyIfAvailable(tracePolicy);
      return true;
    }

    telemetry.record('feature_used', {
      feature: 'tracing',
    });
    const startPromise = (async () => {
      logger.debug('[EvaluatorTracing] Tracing configuration detected, starting OTLP receiver');
      const { startOTLPReceiver } = await import('./otlpReceiver');
      const port = httpTracing.port || 4318;
      const host = httpTracing.host || '127.0.0.1';
      logger.debug(
        `[EvaluatorTracing] Starting OTLP receiver on ${host}:${port}` +
          (redactAttributes && redactAttributes.length > 0
            ? ` (redact: ${redactAttributes.join(',')})`
            : ''),
      );
      await startOTLPReceiver(port, host, acceptFormats, {
        commandToolNames,
        redactAttributes,
        ...(tracePolicy ? { tracePolicy } : {}),
      });
      otlpReceiverStarted = true;
      otlpReceiverUsers += 1;
      logger.info(
        `[EvaluatorTracing] OTLP receiver successfully started on port ${port} for tracing`,
      );
    })();
    otlpReceiverStartPromise = startPromise;

    try {
      await startPromise;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failOnStartFailure = testSuite.tracing?.failOnReceiverStartFailure === true;
      if (failOnStartFailure) {
        logger.error(
          `[EvaluatorTracing] Failed to start OTLP receiver and tracing.failOnReceiverStartFailure is true: ${message}`,
        );
        throw new Error(
          `Failed to start OTLP tracing receiver: ${message}. Set tracing.failOnReceiverStartFailure: false to swallow this error and continue without traces.`,
        );
      }
      logger.error(`[EvaluatorTracing] Failed to start OTLP receiver: ${message}`);
      return false;
    } finally {
      otlpReceiverStartPromise = null;
    }
    return true;
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
  return false;
}

async function pruneTraceStoreIfNeeded(testSuite: TestSuite): Promise<void> {
  // Default retention is only materialized on parsed configs. Keep ad-hoc suites
  // opt-in so tests and programmatic callers do not prune unexpectedly.
  const retentionDays = testSuite.tracing?.storage?.retentionDays;
  if (typeof retentionDays !== 'number' || retentionDays <= 0) {
    return;
  }

  try {
    const { getTraceStore } = await import('./store');
    await getTraceStore().deleteOldTraces(retentionDays);
    logger.debug(`[EvaluatorTracing] Pruned trace store entries older than ${retentionDays} days`);
  } catch (pruneError) {
    logger.warn(
      `[EvaluatorTracing] Failed to prune old traces: ${
        pruneError instanceof Error ? pruneError.message : pruneError
      }`,
    );
  }
}

/**
 * Stop the OTLP receiver if it was started
 */
export async function stopOtlpReceiverIfNeeded(receiverAcquired: boolean = true): Promise<void> {
  if (!receiverAcquired) {
    return;
  }

  if (otlpReceiverUsers > 0) {
    otlpReceiverUsers -= 1;
  }
  if (otlpReceiverUsers > 0) {
    logger.debug(
      `[EvaluatorTracing] Preserving OTLP receiver for ${otlpReceiverUsers} active evaluations`,
    );
    return;
  }

  if (otlpReceiverStarted && !otlpReceiverStopPromise) {
    otlpReceiverStarted = false;
    const stopPromise = (async () => {
      try {
        logger.debug('[EvaluatorTracing] Stopping OTLP receiver');
        const { stopOTLPReceiver } = await import('./otlpReceiver');
        await stopOTLPReceiver();
        logger.info('[EvaluatorTracing] OTLP receiver stopped successfully');
      } catch (error) {
        otlpReceiverStarted = true;
        logger.error(`[EvaluatorTracing] Failed to stop OTLP receiver: ${error}`);
      }
    })();
    otlpReceiverStopPromise = stopPromise;

    try {
      await stopPromise;
    } finally {
      otlpReceiverStopPromise = null;
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
  const envEnabled = getEnvBool('PROMPTFOO_TRACING_ENABLED', false);

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
  evaluateOptions: InternalEvaluateOptions | undefined,
  testIdx: number,
  promptIdx: number,
  testSuite?: TestSuite,
): Promise<{
  traceparent?: string;
  evaluationId?: string;
  testCaseId?: string;
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
        commandToolNames: testSuite?.tracing?.commandToolNames,
        otlpHttpRedactAttributes: testSuite?.tracing?.otlp?.http?.redactAttributes,
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
