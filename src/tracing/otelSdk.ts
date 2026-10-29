import { createRequire } from 'node:module';

import {
  DiagConsoleLogger,
  DiagLogLevel,
  diag,
  type ProxyTracerProvider,
  propagation,
  trace,
} from '@opentelemetry/api';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchSpanProcessor, NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import logger from '../logger';
import { VERSION } from '../version';
import { LocalSpanExporter } from './localSpanExporter';
import type { SpanProcessor } from '@opentelemetry/sdk-trace-node';

import type { OtelConfig } from './otelConfig';

const require = createRequire(import.meta.url);

// Singleton instances
let provider: NodeTracerProvider | null = null;
let initialized = false;
// Evaluations that initialized tracing and have not shut it down yet. Concurrent traced
// evaluations share one provider, which is shut down when the last of them finishes.
let users = 0;
// Whether promptfoo registered the global tracer provider and propagator, which it then
// unregisters on shutdown. An application that registered its own keeps them.
let registeredTracerProvider = false;
let registeredPropagator = false;

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
  if (!config.enabled) {
    logger.debug('[OtelSdk] OTEL tracing is disabled');
    return;
  }

  if (initialized) {
    users += 1;
    logger.debug(`[OtelSdk] Already initialized, sharing it with ${users} evaluations`);
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
  registeredPropagator = propagation.setGlobalPropagator(new W3CTraceContextPropagator());
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
    spanProcessors.push(new BatchSpanProcessor(new LocalSpanExporter()));
    logger.debug('[OtelSdk] Added local span exporter');
  }

  // Add external OTLP exporter if endpoint configured
  if (config.endpoint) {
    // Local-only tracing does not need the external exporter and its transports.
    const { OTLPTraceExporter } =
      require('@opentelemetry/exporter-trace-otlp-http') as typeof import('@opentelemetry/exporter-trace-otlp-http');
    spanProcessors.push(new BatchSpanProcessor(new OTLPTraceExporter({ url: config.endpoint })));
    logger.debug(`[OtelSdk] Added OTLP exporter to ${config.endpoint}`);
  }

  // Create trace provider with resource and span processors
  provider = new NodeTracerProvider({ resource, spanProcessors });

  // Register the provider globally. Registration fails quietly when the application has already
  // registered a tracer provider, whose delegate then stays in place.
  provider.register();
  registeredTracerProvider =
    (trace.getTracerProvider() as ProxyTracerProvider).getDelegate?.() === provider;

  initialized = true;
  users = 1;
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
    await shutdownOtel({ force: true });
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
 * Shutdown the OpenTelemetry SDK.
 * Flushes any pending spans and releases resources once the last evaluation using it is done,
 * or at once with `force`. Unregisters the global tracer provider and propagator it registered,
 * so the next traced evaluation in this process registers a fresh provider instead of sending
 * its spans to this one after it has shut down.
 */
export async function shutdownOtel({ force = false }: { force?: boolean } = {}): Promise<void> {
  if (!initialized || !provider) {
    return;
  }

  if (!force && users > 1) {
    users -= 1;
    logger.debug(`[OtelSdk] Preserving OpenTelemetry SDK for ${users} active evaluations`);
    return;
  }

  logger.debug('[OtelSdk] Shutting down OpenTelemetry SDK');

  try {
    await provider.shutdown();
    logger.info('[OtelSdk] OpenTelemetry SDK shut down successfully');
  } catch (error) {
    logger.error('[OtelSdk] Error shutting down OpenTelemetry SDK', { error });
  } finally {
    if (registeredTracerProvider) {
      trace.disable();
    }
    if (registeredPropagator) {
      propagation.disable();
    }
    registeredTracerProvider = false;
    registeredPropagator = false;
    provider = null;
    initialized = false;
    users = 0;
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
