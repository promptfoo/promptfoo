import { createRequire } from 'node:module';

import { DiagConsoleLogger, DiagLogLevel, diag } from '@opentelemetry/api';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { TracerProvider } from '@opentelemetry/sdk-trace';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import logger from '../logger';
import { VERSION } from '../version';
import { LocalSpanExporter } from './localSpanExporter';
import {
  batchProcessorFromEnv,
  registerTracerProvider,
  traceOptionsFromEnv,
} from './tracerProvider';
import type { SpanProcessor } from '@opentelemetry/sdk-trace';

import type { OtelConfig } from './otelConfig';

const require = createRequire(import.meta.url);

// Singleton instances
let provider: TracerProvider | null = null;
let initialized = false;

// Use a global symbol to track handlers across module resets (important for tests)
const OTEL_HANDLERS_KEY = Symbol.for('promptfoo.otelHandlers');

interface OtelHandlers {
  sigTermHandler: (() => void) | null;
  sigIntHandler: (() => void) | null;
  beforeExitHandler: (() => Promise<void>) | null;
  registered: boolean;
}

// Get or create the global handlers registry
function getHandlers(): OtelHandlers {
  const globalAny = globalThis as Record<symbol, OtelHandlers | undefined>;
  if (!globalAny[OTEL_HANDLERS_KEY]) {
    globalAny[OTEL_HANDLERS_KEY] = {
      sigTermHandler: null,
      sigIntHandler: null,
      beforeExitHandler: null,
      registered: false,
    };
  }
  return globalAny[OTEL_HANDLERS_KEY]!;
}

/**
 * Initialize the OpenTelemetry SDK for tracing LLM provider calls.
 *
 * This sets up:
 * - A TracerProvider with promptfoo service info
 * - LocalSpanExporter for storing spans in TraceStore (SQLite)
 * - Optional OTLPTraceExporter for external backends (Jaeger, Honeycomb, etc.)
 *
 * @param config - OTEL configuration
 */
export function initializeOtel(config: OtelConfig): void {
  if (initialized) {
    logger.debug('[OtelSdk] Already initialized, skipping');
    return;
  }

  if (!config.enabled) {
    logger.debug('[OtelSdk] OTEL tracing is disabled');
    return;
  }

  logger.debug('[OtelSdk] Initializing OpenTelemetry SDK', {
    serviceName: config.serviceName,
    endpoint: config.endpoint,
    localExport: config.localExport,
  });

  // Enable debug logging if requested
  if (config.debug) {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
  }

  // Create resource with service info
  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: config.serviceName,
    [ATTR_SERVICE_VERSION]: VERSION,
  });

  // Collect span processors
  const spanProcessors: SpanProcessor[] = [];

  // Add local exporter (writes to TraceStore/SQLite)
  if (config.localExport) {
    spanProcessors.push(batchProcessorFromEnv(new LocalSpanExporter()));
    logger.debug('[OtelSdk] Added local span exporter');
  }

  // Add external OTLP exporter if endpoint configured
  if (config.endpoint) {
    // Local-only tracing does not need the external exporter and its transports.
    const { OTLPTraceExporter } =
      require('@opentelemetry/exporter-trace-otlp-http') as typeof import('@opentelemetry/exporter-trace-otlp-http');
    spanProcessors.push(batchProcessorFromEnv(new OTLPTraceExporter({ url: config.endpoint })));
    logger.debug(`[OtelSdk] Added OTLP exporter to ${config.endpoint}`);
  }

  // Create trace provider with resource and span processors
  provider = new TracerProvider({ ...traceOptionsFromEnv(), resource, spanProcessors });

  // Register the provider globally
  registerTracerProvider(provider, new W3CTraceContextPropagator());

  initialized = true;
  logger.info('[OtelSdk] OpenTelemetry SDK initialized successfully');

  // Set up graceful shutdown
  /**
   * Set up handlers for graceful shutdown on process signals.
   * Uses once() listeners and tracks registration globally to avoid duplicates
   * across module resets (important for tests).
   */
  const handlers = getHandlers();

  // Skip if handlers are already registered
  if (handlers.registered) {
    return;
  }

  const shutdown = async (signal: string) => {
    logger.debug(`[OtelSdk] Received ${signal}, shutting down`);
    await shutdownOtel();
  };

  // Create handler functions so we can remove them later if needed
  // Note: Signal handlers are synchronous, but we use void to suppress
  // the unhandled promise warning while still allowing async completion.
  // The shutdown will complete before process exit because we're not
  // calling process.exit() - we let Node.js exit naturally after async work.
  // SIGTERM only flushes. The CLI shuts tracing down after its own SIGTERM cleanup, and the
  // evaluator does when a run ends, so spans that end during that cleanup are still exported.
  handlers.sigTermHandler = () => {
    logger.debug('[OtelSdk] Received SIGTERM, flushing pending spans');
    void flushOtel();
  };
  handlers.sigIntHandler = () => {
    void shutdown('SIGINT');
  };
  handlers.beforeExitHandler = async () => {
    await flushOtel();
  };

  // Handle common termination signals
  process.once('SIGTERM', handlers.sigTermHandler);
  process.once('SIGINT', handlers.sigIntHandler);

  // Handle beforeExit for graceful shutdown
  process.once('beforeExit', handlers.beforeExitHandler);

  handlers.registered = true;
}

/**
 * Shutdown the OpenTelemetry SDK.
 * Flushes any pending spans and releases resources.
 */
export async function shutdownOtel(): Promise<void> {
  if (!initialized || !provider) {
    return;
  }

  logger.debug('[OtelSdk] Shutting down OpenTelemetry SDK');

  try {
    await provider.shutdown();
    logger.info('[OtelSdk] OpenTelemetry SDK shut down successfully');
  } catch (error) {
    logger.error('[OtelSdk] Error shutting down OpenTelemetry SDK', { error });
  } finally {
    provider = null;
    initialized = false;
    /**
     * Clean up shutdown handlers.
     * Called during shutdown to prevent duplicate registrations on reinit.
     */
    const handlers = getHandlers();

    for (const [event, key] of [
      ['SIGTERM', 'sigTermHandler'],
      ['SIGINT', 'sigIntHandler'],
      ['beforeExit', 'beforeExitHandler'],
    ] as const) {
      if (handlers[key]) {
        process.removeListener(event, handlers[key]);
        handlers[key] = null;
      }
    }
    handlers.registered = false;
  }
}

/**
 * Force flush any pending spans.
 * Useful before process exit to ensure all spans are exported.
 */
export async function flushOtel(): Promise<void> {
  if (!initialized || !provider) {
    return;
  }

  logger.debug('[OtelSdk] Flushing pending spans');

  try {
    await provider.forceFlush();
    logger.debug('[OtelSdk] Spans flushed successfully');
  } catch (error) {
    logger.error('[OtelSdk] Error flushing spans', { error });
  }
}

/**
 * Check if OTEL SDK is initialized and enabled.
 */
export function isOtelInitialized(): boolean {
  return initialized;
}
