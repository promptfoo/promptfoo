import { createRequire } from 'node:module';

import {
  DiagConsoleLogger,
  DiagLogLevel,
  diag,
  ProxyTracerProvider,
  propagation,
  trace,
} from '@opentelemetry/api';
import { callWithTimeout, W3CTraceContextPropagator } from '@opentelemetry/core';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchSpanProcessor, NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import logger from '../logger';
import { VERSION } from '../version';
import { LocalSpanExporter } from './localSpanExporter';
import { trackLocalOtlpExports } from './otlpOwnership';
import type { SpanProcessor } from '@opentelemetry/sdk-trace-node';

import type { OtelConfig } from './otelConfig';

const require = createRequire(import.meta.url);

interface OtelSdk {
  provider: NodeTracerProvider;
  localExporter?: LocalSpanExporter;
  owners: number;
  shutdown?: Promise<void>;
}

// Use one budget for the SDK flush and any writes its batch processor already dispatched.
const FLUSH_TIMEOUT_MS = 30_000;

let sdk: OtelSdk | undefined;
const pendingShutdowns = new Set<Promise<void>>();

// Each evaluator releases the generation it acquired, even if a signal handler
// has since shut it down and another evaluation has registered a replacement.
function acquire(sdk: OtelSdk): () => Promise<void> {
  sdk.owners++;
  let released: Promise<void> | Promise<boolean> | undefined;
  return async () => {
    if (!released) {
      sdk.owners--;
      released =
        sdk.shutdown ?? (sdk.owners === 0 ? shutdownGeneration(sdk) : flushGeneration(sdk));
    }
    await released;
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
    const exporter = trackLocalOtlpExports(new OTLPTraceExporter({ url: config.endpoint }));
    spanProcessors.push(new BatchSpanProcessor(exporter));
    logger.debug(`[OtelSdk] Added OTLP exporter to ${config.endpoint}`);
  }

  // Create trace provider with resource and span processors
  const provider = new NodeTracerProvider({
    resource,
    spanProcessors,
    forceFlushTimeoutMillis: FLUSH_TIMEOUT_MS,
  });

  // Register the provider globally
  provider.register();

  sdk = { provider, localExporter, owners: 0 };
  logger.info('[OtelSdk] OpenTelemetry SDK initialized successfully');

  installSignalHandlers();
  return acquire(sdk);
}

function installSignalHandlers(): void {
  const handlers = getHandlers();
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

function removeSignalHandlers(): void {
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
    .finally(() => {
      pendingShutdowns.delete(drain);
      if (pendingShutdowns.size === 0) {
        // Keep the first signal graceful during the last export. A new SDK
        // also needs fresh once-listeners if a signal started the previous drain.
        removeSignalHandlers();
        if (sdk) {
          installSignalHandlers();
        }
      }
    });
  generation.shutdown = drain;
  pendingShutdowns.add(drain);

  sdk = undefined;
  if (ownsGlobalTracerProvider(provider)) {
    trace.disable();
  }
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
export function flushOtel(): Promise<boolean> {
  return flushGeneration(sdk, pendingShutdowns);
}

async function flushGeneration(
  generation?: OtelSdk,
  drains: Iterable<Promise<void>> = [],
  traceId?: string,
): Promise<boolean> {
  try {
    // The SDK flushes its queued batches. Also join local writes already dispatched
    // in the background. An external exporter failure need not hide local evidence.
    const sdkFlush = generation?.provider.forceFlush().catch((error) => {
      logger.error('[OtelSdk] Error flushing spans', { error });
    });
    const localFlush = () => generation?.localExporter?.forceFlush(traceId);
    // Scoped failures remain observable after the SDK dispatches late batches. A
    // process-wide drain must snapshot outstanding writes while they are in flight.
    const local = traceId && sdkFlush ? sdkFlush.then(localFlush) : localFlush();
    await callWithTimeout(Promise.all([...drains, sdkFlush, local]), FLUSH_TIMEOUT_MS);
    return true;
  } catch (error) {
    logger.error('[OtelSdk] Local trace evidence unavailable after flush', { error });
    return false;
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

/** Follow this row's writes on the SDK that originally recorded its provider call. */
export function trackLocalTrace(traceId: string) {
  const generation = sdk;
  if (!generation?.localExporter || !ownsGlobalTracerProvider(generation.provider)) {
    return undefined;
  }
  const release = generation.localExporter.trackTrace(traceId);
  return {
    flush: async () => (await flushGeneration(generation, [], traceId)) && !generation.shutdown,
    release,
  };
}

/** Whether the running SDK exports provider invocation spans to the local TraceStore. */
export function hasLocalSpanExporter(): boolean {
  return !!sdk?.localExporter && ownsGlobalTracerProvider(sdk.provider);
}
