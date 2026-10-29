import { createRequire } from 'node:module';

import {
  DiagConsoleLogger,
  DiagLogLevel,
  diag,
  ProxyTracerProvider,
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

interface OtelSdk {
  provider: NodeTracerProvider;
  localExporter?: LocalSpanExporter;
  owners: number;
  shutdown?: Promise<void>;
}

let sdk: OtelSdk | undefined;
const pendingShutdowns = new Set<Promise<void>>();

// Each evaluator releases the generation it acquired, even if a signal handler
// has since shut it down and another evaluation has registered a replacement.
function acquire(sdk: OtelSdk): () => Promise<void> {
  sdk.owners++;
  let released: Promise<void> | undefined;
  return () => {
    if (!released) {
      sdk.owners--;
      released =
        sdk.shutdown ?? (sdk.owners === 0 ? shutdownGeneration(sdk) : flushGeneration(sdk));
    }
    return released;
  };
}

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
 * Returns a release callback for this evaluation. Process shutdown can still
 * force all active exports to drain via shutdownOtel.
 *
 * @param config - OTEL configuration
 */
export function initializeOtel(config: OtelConfig): (() => Promise<void>) | undefined {
  if (!config.enabled) {
    logger.debug('[OtelSdk] OTEL tracing is disabled');
    return;
  }

  if (sdk) {
    return acquire(sdk);
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
  const localExporter = config.localExport ? new LocalSpanExporter() : undefined;
  if (localExporter) {
    spanProcessors.push(new BatchSpanProcessor(localExporter));
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
  const provider = new NodeTracerProvider({ resource, spanProcessors });

  // Register the provider globally
  provider.register();

  sdk = { provider, localExporter, owners: 0 };
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
    return acquire(sdk);
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
  return acquire(sdk);
}

function shutdownGeneration(generation: OtelSdk): Promise<void> {
  if (generation.shutdown) {
    return generation.shutdown;
  }

  logger.debug('[OtelSdk] Shutting down OpenTelemetry SDK');

  const { provider } = generation;
  const drain: Promise<void> = Promise.resolve()
    .then(() => provider.shutdown())
    .finally(() => generation.localExporter?.forceFlush())
    .then(
      () => logger.info('[OtelSdk] OpenTelemetry SDK shut down successfully'),
      (error) => logger.error('[OtelSdk] Error shutting down OpenTelemetry SDK', { error }),
    )
    .finally(() => pendingShutdowns.delete(drain));
  generation.shutdown = drain;
  pendingShutdowns.add(drain);

  sdk = undefined;
  if (ownsGlobalTracerProvider(provider)) {
    trace.disable();
  }
  // Release this registration before awaiting the exporter flush. A new eval can
  // initialize its own SDK while the previous provider finishes shutting down.
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

  return drain;
}

/** Force shutdown on process exit and wait for any exporters already draining. */
export async function shutdownOtel(): Promise<void> {
  if (sdk) {
    void shutdownGeneration(sdk);
  }
  await Promise.all(pendingShutdowns);
}

/** Flush the active exporter and wait for previously started exports. */
export async function flushOtel(): Promise<void> {
  await Promise.all([...pendingShutdowns, ...(sdk ? [flushGeneration(sdk)] : [])]);
}

async function flushGeneration(generation: OtelSdk): Promise<void> {
  logger.debug('[OtelSdk] Flushing pending spans');

  try {
    // Already dispatched SQLite writes still need to finish if a peer exporter fails.
    await generation.provider.forceFlush().finally(() => generation.localExporter?.forceFlush());
    logger.debug('[OtelSdk] Spans flushed successfully');
  } catch (error) {
    logger.error('[OtelSdk] Error flushing spans', { error });
  }
}

/**
 * Check if OTEL SDK is initialized and enabled.
 */
export function isOtelInitialized(): boolean {
  return sdk !== undefined;
}

function ownsGlobalTracerProvider(provider: NodeTracerProvider): boolean {
  // OTel leaves the first global provider registered if the host app already set one.
  const active = trace.getTracerProvider();
  return (active instanceof ProxyTracerProvider ? active.getDelegate() : active) === provider;
}

/** Whether the running SDK exports provider invocation spans to the local TraceStore. */
export function hasLocalSpanExporter(): boolean {
  return !!sdk?.localExporter && ownsGlobalTracerProvider(sdk.provider);
}
