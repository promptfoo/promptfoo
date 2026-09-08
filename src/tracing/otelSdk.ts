import {
  DiagConsoleLogger,
  DiagLogLevel,
  diag,
  ProxyTracerProvider,
  propagation,
  trace,
} from '@opentelemetry/api';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchSpanProcessor, NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import logger from '../logger';
import { VERSION } from '../version';
import { LocalSpanExporter } from './localSpanExporter';
import type { Tracer, TracerProvider } from '@opentelemetry/api';
import type { SpanProcessor } from '@opentelemetry/sdk-trace-base';

import type { OtelConfig } from './otelConfig';

interface OtelInstance {
  provider: NodeTracerProvider;
  leases: number;
  hostOwned: boolean;
}

// Evaluations share one SDK/configuration until its final lease is released.
let instance: OtelInstance | null = null;
let shutdownPromise: Promise<void> | undefined;

const noopTracer = new ProxyTracerProvider().getTracer('promptfoo.inactive');
// Track only the current synchronous forwarding stack. A host may delegate
// back to a provider it saved before replacing the global registration.
let forwardingProviders = new Set<TracerProvider>();

// The API's ProxyTracer caches its first delegate. Keep that delegate independent
// of any SDK generation so instrumentation can safely cache a tracer once.
const lifecycleProvider: TracerProvider = {
  getTracer(name, version, options): Tracer {
    const getOwnedTracer = (): Tracer =>
      instance && !shutdownPromise
        ? instance.provider.getTracer(name, version, options)
        : noopTracer;
    const callTracer = (method: 'startSpan' | 'startActiveSpan', args: unknown[]) => {
      const globalProvider = trace.getTracerProvider();
      if (
        globalProvider === lifecycleProvider ||
        (globalProvider instanceof ProxyTracerProvider &&
          globalProvider.getDelegate() === lifecycleProvider) ||
        forwardingProviders.has(globalProvider)
      ) {
        const tracer = getOwnedTracer();
        return Reflect.apply(tracer[method], tracer, args);
      }
      // Honor an embedding application's replacement provider. With no provider
      // registered, the API returns a no-op without starting another SDK.
      const forwarding = forwardingProviders;
      forwarding.add(globalProvider);
      try {
        const tracer = globalProvider.getTracer(name, version, options);
        const callback = args[args.length - 1];
        if (method === 'startActiveSpan' && typeof callback === 'function') {
          args[args.length - 1] = function (this: unknown, ...callbackArgs: unknown[]) {
            // User callbacks may start nested spans through cached tracers. They
            // execute outside the forwarding stack, including async callbacks.
            const previous = forwardingProviders;
            forwardingProviders = new Set();
            try {
              return Reflect.apply(callback, this, callbackArgs);
            } finally {
              forwardingProviders = previous;
            }
          };
        }
        return Reflect.apply(tracer[method], tracer, args);
      } finally {
        forwarding.delete(globalProvider);
      }
    };

    return {
      startSpan(...args) {
        return callTracer('startSpan', args);
      },
      startActiveSpan(...args: unknown[]) {
        // Forward all three public overloads unchanged, including callback return
        // values and thrown errors, as the API's own ProxyTracer does.
        return callTracer('startActiveSpan', args);
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
  if (instance) {
    // A caller explicitly initializing the SDK owns its eventual shutdown.
    if (!shutdownPromise && config.enabled) {
      instance.hostOwned = true;
    }
    logger.debug('[OtelSdk] Already initialized, skipping');
    return;
  }

  startOtel(config, true);
}

function startOtel(config: OtelConfig, hostOwned: boolean): void {
  if (!config.enabled) {
    logger.debug('[OtelSdk] OTEL tracing is disabled');
    return;
  }

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
  const provider = new NodeTracerProvider({ resource, spanProcessors });

  // Register the provider globally
  provider.register({ propagator: null });
  const registeredProvider = trace.getTracerProvider();
  if (
    registeredProvider instanceof ProxyTracerProvider &&
    registeredProvider.getDelegate() === provider
  ) {
    registeredProvider.setDelegate(lifecycleProvider);
  }

  instance = { provider, leases: 0, hostOwned };
  logger.info('[OtelSdk] OpenTelemetry SDK initialized successfully');

  // Set up graceful shutdown
  setupShutdownHandlers();
}

/**
 * Borrow tracing for one evaluation. The first active configuration wins.
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
 * Shutdown the OpenTelemetry SDK.
 * Flushes any pending spans and releases resources.
 */
export function shutdownOtel(): Promise<void> {
  if (shutdownPromise) {
    return shutdownPromise;
  }
  const closing = instance;
  if (!closing) {
    return Promise.resolve();
  }

  shutdownPromise = Promise.resolve()
    .then(() => shutdownInstance(closing))
    .finally(() => {
      shutdownPromise = undefined;
    });
  return shutdownPromise;
}

async function shutdownInstance(closing: OtelInstance): Promise<void> {
  logger.debug('[OtelSdk] Shutting down OpenTelemetry SDK');

  try {
    await closing.provider.shutdown();
    logger.info('[OtelSdk] OpenTelemetry SDK shut down successfully');
  } catch (error) {
    logger.error('[OtelSdk] Error shutting down OpenTelemetry SDK', { error });
  } finally {
    // Release our API registration so a host SDK can register while idle. Cached
    // tracers retain lifecycleProvider and dispatch to the next active provider.
    const globalProvider = trace.getTracerProvider();
    if (
      globalProvider instanceof ProxyTracerProvider &&
      globalProvider.getDelegate() === lifecycleProvider
    ) {
      trace.disable();
    }
    // Context managers and propagators can be installed independently by hosts.
    // Preserve those process-wide registrations, as the public lifecycle does.
    if (instance === closing) {
      instance = null;
    }
    cleanupShutdownHandlers();
  }
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
