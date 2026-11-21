import { createRequire } from 'node:module';

import {
  DiagConsoleLogger,
  DiagLogLevel,
  diag,
  ProxyTracerProvider,
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
import type { TracerProvider as ApiTracerProvider, Tracer } from '@opentelemetry/api';
import type { SpanProcessor } from '@opentelemetry/sdk-trace';

import type { OtelConfig } from './otelConfig';

const require = createRequire(import.meta.url);

interface OtelInstance {
  provider: TracerProvider;
  propagator: TextMapPropagator;
  config: OtelConfig;
  leases: number;
  hostOwned: boolean;
}

// Evaluations share one SDK/configuration until its final lease is released.
let instance: OtelInstance | null = null;
let shutdownPromise: Promise<void> | undefined;

const noopTracer = new ProxyTracerProvider().getTracer('promptfoo.inactive');

// The API's ProxyTracer caches its first delegate. Keep that delegate independent
// of any SDK generation so instrumentation can safely cache a tracer once.
// Like native SDK tracers, these remain associated with their provider; they do
// not migrate to a host that subsequently replaces the global registration.
const lifecycleProvider: ApiTracerProvider = {
  getTracer(name, version, options): Tracer {
    const getOwnedTracer = (): Tracer =>
      instance?.provider.getTracer(name, version, options) ?? noopTracer;

    return {
      startSpan(...args) {
        return getOwnedTracer().startSpan(...args);
      },
      startActiveSpan(...args: unknown[]) {
        // Forward all three public overloads unchanged, including callback return
        // values and thrown errors, as the API's own ProxyTracer does.
        const tracer = getOwnedTracer();
        return Reflect.apply(tracer.startActiveSpan, tracer, args);
      },
    };
  },
};

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

/** Synchronously create or adopt a host-owned SDK. */
export function initializeOtel(config: OtelConfig): void {
  if (!config.enabled) {
    return;
  }
  if (instance) {
    assertCompatibleConfig(instance.config, config);
    instance.hostOwned = true;
    return;
  }
  startOtel(config, true);
}

function startOtel(config: OtelConfig, hostOwned: boolean): void {
  // An embedding application may already own the global SDK. Do not create
  // exporters or modify its context/propagation configuration in that case.
  const globalProvider = trace.getTracerProvider();
  if (
    !(globalProvider instanceof ProxyTracerProvider) ||
    globalProvider.getDelegateTracer('promptfoo') !== undefined
  ) {
    logger.debug('[OtelSdk] Using an externally registered tracer provider');
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
  registerTracerProvider(lifecycleProvider, propagator);
  instance = { provider, propagator, leases: 0, hostOwned, config: { ...config } };
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
 * Borrow tracing for one evaluation with compatible export settings.
 * Only the final lease can shut down an SDK created by evaluations; explicitly
 * initialized or externally registered SDKs remain owned by their caller.
 */
export async function acquireOtel(config: OtelConfig): Promise<() => Promise<void>> {
  while (shutdownPromise) {
    await shutdownPromise;
  }

  if (!config.enabled) {
    return async () => {};
  }
  if (!instance) {
    startOtel(config, false);
  }
  const acquired = instance;
  if (!acquired) {
    return async () => {};
  }
  assertCompatibleConfig(acquired.config, config);
  acquired.leases++;

  let releasePromise: Promise<void> | undefined;
  return () => {
    if (!releasePromise) {
      releasePromise = Promise.resolve().then(async () => {
        if (acquired === instance) {
          await flushOtel();
        }
        acquired.leases--;
        if (acquired === instance && acquired.leases === 0 && !acquired.hostOwned) {
          await shutdownOtel();
        }
      });
    }
    return releasePromise;
  };
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
 * Detach the closing SDK before flushing it. Explicit initialization can
 * synchronously install a new host SDK while evaluation acquisitions wait.
 */
export function shutdownOtel(): Promise<void> {
  const closing = instance;
  if (!closing) {
    return shutdownPromise ?? Promise.resolve();
  }
  instance = null;
  const globalProvider = trace.getTracerProvider();
  if (
    globalProvider instanceof ProxyTracerProvider &&
    globalProvider.getDelegate() === lifecycleProvider
  ) {
    trace.disable();
  }
  if (isGlobalPropagator(closing.propagator)) {
    propagation.disable();
  }
  removeShutdownHandlers();

  const shutdown = Promise.resolve(shutdownPromise)
    .then(() => closing.provider.shutdown())
    .then(() => {
      logger.info('[OtelSdk] OpenTelemetry SDK shut down successfully');
    })
    .catch((error) => {
      logger.error('[OtelSdk] Error shutting down OpenTelemetry SDK', { error });
    })
    .finally(() => {
      if (shutdownPromise === shutdown) {
        shutdownPromise = undefined;
      }
    });
  shutdownPromise = shutdown;
  return shutdown;
}

/**
 * Force flush any pending spans.
 * Useful before process exit to ensure all spans are exported.
 */
export async function flushOtel(): Promise<void> {
  const current = instance;
  if (!current) {
    return;
  }

  logger.debug('[OtelSdk] Flushing pending spans');

  try {
    await current.provider.forceFlush();
    logger.debug('[OtelSdk] Spans flushed successfully');
  } catch (error) {
    logger.error('[OtelSdk] Error flushing spans', { error });
  }
}

/**
 * Check if OTEL SDK is initialized and enabled.
 */
export function isOtelInitialized(): boolean {
  return instance !== null;
}
