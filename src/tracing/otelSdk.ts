import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

import {
  DiagConsoleLogger,
  DiagLogLevel,
  diag,
  ProxyTracerProvider,
  trace,
} from '@opentelemetry/api';
import { callWithTimeout, getStringFromEnv, W3CTraceContextPropagator } from '@opentelemetry/core';
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

interface OtelSdk {
  provider: TracerProvider;
  routingKey?: string;
  localExporter?: LocalSpanExporter;
  localProcessor?: SpanProcessor;
  owners: number;
  shutdown?: Promise<void>;
}

// Use one budget for the SDK flush and any writes its batch processor already dispatched.
const FLUSH_TIMEOUT_MS = 30_000;

let sdk: OtelSdk | undefined;
const pendingShutdowns = new Set<Promise<void>>();

// The HTTP exporter snapshots these process settings when it is constructed.
function getRoutingKey(config: OtelConfig): string | undefined {
  const settings = [config.serviceName, config.localExport, config.endpoint];
  if (config.endpoint) {
    for (const prefix of ['OTEL_EXPORTER_OTLP_', 'OTEL_EXPORTER_OTLP_TRACES_']) {
      // A certificate or key can rotate at the same path between evaluations.
      if (
        ['CERTIFICATE', 'CLIENT_CERTIFICATE', 'CLIENT_KEY'].some((key) =>
          getStringFromEnv(prefix + key),
        )
      ) {
        return undefined;
      }
      settings.push(getStringFromEnv(prefix + 'HEADERS'));
    }
  }
  return createHash('sha256').update(JSON.stringify(settings)).digest('hex');
}

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
 * - A TracerProvider with promptfoo service info
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

  const routingKey = getRoutingKey(config);
  if (sdk) {
    if (!routingKey || routingKey !== sdk.routingKey) {
      throw new Error(
        'Cannot share the active OpenTelemetry SDK. Run evaluations with different trace export settings or file-based OTLP TLS credentials sequentially or in separate processes.',
      );
    }
    return acquire(sdk);
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
  const localExporter = config.localExport ? new LocalSpanExporter() : undefined;
  const localProcessor = localExporter && batchProcessorFromEnv(localExporter);
  if (localProcessor) {
    spanProcessors.push(localProcessor);
    logger.debug('[OtelSdk] Added local span exporter');
  }

  // Add external OTLP exporter if endpoint configured
  if (config.endpoint) {
    // Local-only tracing does not need the external exporter and its transports.
    const { OTLPTraceExporter } =
      require('@opentelemetry/exporter-trace-otlp-http') as typeof import('@opentelemetry/exporter-trace-otlp-http');
    spanProcessors.push(batchProcessorFromEnv(new OTLPTraceExporter({ url: config.endpoint })));
    logger.debug('[OtelSdk] Added OTLP exporter');
  }

  // Create trace provider with resource and span processors
  const provider = new TracerProvider({ ...traceOptionsFromEnv(), resource, spanProcessors });

  // Register the provider globally
  const registered = registerTracerProvider(provider, new W3CTraceContextPropagator());
  const generation = { provider, routingKey, localExporter, localProcessor, owners: 0 };
  if (!registered) {
    void shutdownGeneration(generation);
    if (config.endpoint && !config.inheritedEndpoint) {
      throw new Error(
        'A host OpenTelemetry provider is already registered. Configure trace export on the host or run this evaluation in a separate process.',
      );
    }
    return;
  }
  sdk = generation;
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
    const flushing = traceId
      ? generation?.localProcessor?.forceFlush()
      : generation?.provider.forceFlush({ timeoutMillis: FLUSH_TIMEOUT_MS });
    const sdkFlush = flushing?.catch((error) => {
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

function ownsGlobalTracerProvider(provider: TracerProvider): boolean {
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
