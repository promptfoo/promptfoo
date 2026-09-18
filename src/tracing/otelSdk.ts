import { DiagConsoleLogger, DiagLogLevel, diag, propagation } from '@opentelemetry/api';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchSpanProcessor, NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import logger from '../logger';
import { VERSION } from '../version';
import { LocalSpanExporter } from './localSpanExporter';
import type { SpanProcessor } from '@opentelemetry/sdk-trace-base';

import type { OtelConfig } from './otelConfig';

// Singleton instances
let provider: NodeTracerProvider | null = null;
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
 * - A NodeTracerProvider with promptfoo service info
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

  // Register W3C Trace Context propagator for traceparent header support
  propagation.setGlobalPropagator(new W3CTraceContextPropagator());
  logger.debug('[OtelSdk] Registered W3C Trace Context propagator');

  // Create resource with service info
  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: config.serviceName,
    [ATTR_SERVICE_VERSION]: VERSION,
  });

  // Collect span processors
  const spanProcessors: SpanProcessor[] = [];

  // Add local exporter (writes to TraceStore/SQLite)
  if (config.localExport) {
    const localExporter = new LocalSpanExporter();
    spanProcessors.push(new BatchSpanProcessor(localExporter));
    logger.debug('[OtelSdk] Added local span exporter');
  }

  // Add external OTLP exporter if endpoint configured
  if (config.endpoint) {
    const otlpExporter = new OTLPTraceExporter({
      url: config.endpoint,
    });
    spanProcessors.push(new BatchSpanProcessor(otlpExporter));
    logger.debug(`[OtelSdk] Added OTLP exporter to ${config.endpoint}`);
  }

  // Create trace provider with resource and span processors
  provider = new NodeTracerProvider({ resource, spanProcessors });

  // Register the provider globally
  provider.register();

  initialized = true;
  logger.info('[OtelSdk] OpenTelemetry SDK initialized successfully');

  // Set up graceful shutdown
  setupShutdownHandlers();
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
    cleanupShutdownHandlers();
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

/**
 * Set up handlers for graceful shutdown on process signals.
 * Uses once() listeners and tracks registration globally to avoid duplicates
 * across module resets (important for tests).
 */
function setupShutdownHandlers(): void {
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
  handlers.sigTermHandler = () => {
    void shutdown('SIGTERM');
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
 * Clean up shutdown handlers.
 * Called during shutdown to prevent duplicate registrations on reinit.
 */
function cleanupShutdownHandlers(): void {
  const handlers = getHandlers();

  if (handlers.sigTermHandler) {
    process.removeListener('SIGTERM', handlers.sigTermHandler);
    handlers.sigTermHandler = null;
  }
  if (handlers.sigIntHandler) {
    process.removeListener('SIGINT', handlers.sigIntHandler);
    handlers.sigIntHandler = null;
  }
  if (handlers.beforeExitHandler) {
    process.removeListener('beforeExit', handlers.beforeExitHandler);
    handlers.beforeExitHandler = null;
  }
  handlers.registered = false;
}
