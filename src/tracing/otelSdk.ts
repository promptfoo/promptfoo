import { createRequire } from 'node:module';

import {
  DiagConsoleLogger,
  DiagLogLevel,
  diag,
  type ProxyTracerProvider,
  propagation,
  type TextMapPropagator,
  trace,
} from '@opentelemetry/api';
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

// Concurrent traced evaluations can share a provider only for the same export settings.
interface OtelInstance {
  provider: TracerProvider;
  propagator: TextMapPropagator;
  config: OtelConfig;
  users: number;
}
let active: OtelInstance | undefined;

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

function assertCompatibleConfig(current: OtelConfig, next: OtelConfig) {
  if (
    current.endpoint !== next.endpoint ||
    current.localExport !== next.localExport ||
    current.serviceName !== next.serviceName
  ) {
    throw new Error(
      'Concurrent evaluations require matching OpenTelemetry export settings. Run them separately.',
    );
  }
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
  if (!config.enabled) {
    logger.debug('[OtelSdk] OTEL tracing is disabled');
    return;
  }

  if (active) {
    assertCompatibleConfig(active.config, config);
    active.users++;
    return;
  }

  logger.debug('[OtelSdk] Initializing OpenTelemetry SDK', {
    serviceName: config.serviceName,
    externalExport: Boolean(config.endpoint),
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
  }

  // Create trace provider with resource and span processors
  const provider = new TracerProvider({ ...traceOptionsFromEnv(), resource, spanProcessors });
  const propagator = new W3CTraceContextPropagator();
  registerTracerProvider(provider, propagator);
  active = { provider, propagator, users: 1, config: { ...config } };
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
 * Whether `propagator` is still the global one. The API has no public getter for it, so this uses
 * the API's own accessor and answers false when that is unavailable, leaving the global in place.
 */
function isGlobalPropagator(propagator: TextMapPropagator): boolean {
  const api = propagation as unknown as { _getGlobalPropagator?: () => TextMapPropagator };
  return api._getGlobalPropagator?.() === propagator;
}

/** Remove the signal handlers registered by initializeOtel. */
function removeShutdownHandlers(): void {
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

/**
 * Shutdown the OpenTelemetry SDK.
 * Flushes any pending spans and releases resources once the last evaluation using it is done,
 * or at once with `force`. Unregisters the global tracer provider and propagator it registered,
 * so the next traced evaluation in this process registers a fresh provider instead of sending
 * its spans to this one after it has shut down.
 */
export async function shutdownOtel({ force = false }: { force?: boolean } = {}): Promise<void> {
  if (!active) {
    return;
  }

  if (!force && active.users > 1) {
    active.users--;
    return;
  }

  // Detach before awaiting shutdown and leave any application-owned globals in place.
  const { provider, propagator } = active;
  active = undefined;
  if ((trace.getTracerProvider() as ProxyTracerProvider).getDelegate?.() === provider) {
    trace.disable();
  }
  if (isGlobalPropagator(propagator)) {
    propagation.disable();
  }
  removeShutdownHandlers();

  logger.debug('[OtelSdk] Shutting down OpenTelemetry SDK');

  try {
    await provider.shutdown();
    logger.info('[OtelSdk] OpenTelemetry SDK shut down successfully');
  } catch (error) {
    logger.error('[OtelSdk] Error shutting down OpenTelemetry SDK', { error });
  }
}

/**
 * Force flush any pending spans.
 * Useful before process exit to ensure all spans are exported.
 */
export async function flushOtel(): Promise<void> {
  if (!active) {
    return;
  }

  logger.debug('[OtelSdk] Flushing pending spans');

  try {
    await active.provider.forceFlush();
    logger.debug('[OtelSdk] Spans flushed successfully');
  } catch (error) {
    logger.error('[OtelSdk] Error flushing spans', { error });
  }
}

/**
 * Check if OTEL SDK is initialized and enabled.
 */
export function isOtelInitialized(): boolean {
  return active !== undefined;
}
