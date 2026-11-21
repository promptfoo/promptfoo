import { createRequire } from 'node:module';

import {
  context,
  createContextKey,
  DiagConsoleLogger,
  DiagLogLevel,
  diag,
  propagation,
  trace,
} from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { TracerProvider as SdkTracerProvider } from '@opentelemetry/sdk-trace';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import logger from '../logger';
import { VERSION } from '../version';
import { LocalSpanExporter } from './localSpanExporter';
import {
  getOtelScope,
  isProxyTracerProvider,
  routingState,
  traceContextPropagator,
} from './otelContext';
import { batchProcessorFromEnv, traceOptionsFromEnv } from './tracerProvider';

export { getOtelTracer, withOtelContext } from './otelContext';

import type { SpanProcessor } from '@opentelemetry/sdk-trace';

import type { OtelConfig } from './otelConfig';

const require = createRequire(import.meta.url);
const handlers = (routingState.handlers ??= [
  ['SIGTERM', () => flushOtel('process')],
  ['SIGINT', () => shutdownOtel('process')],
  ['beforeExit', () => flushOtel('process')],
] as const);
const contextProbeKey = createContextKey('promptfoo.contextProbe');

function ensureGlobalTracerRouting(): void {
  const globalProvider = trace.getTracerProvider();
  // A host delegate owns global instrumentation, including its own delayed proxy.
  if (isProxyTracerProvider(globalProvider) && !globalProvider.getDelegateTracer('promptfoo')) {
    trace.setGlobalTracerProvider(routingState.provider);
  }
}

function releaseGlobalTracingRegistrations(provider: SdkTracerProvider): void {
  routingState.owners.delete(provider);
  if (routingState.owners.size > 0) {
    return;
  }
  for (const [event, handler] of handlers) {
    process.removeListener(event, handler);
  }
  const globalProvider = trace.getTracerProvider();
  if (
    isProxyTracerProvider(globalProvider) &&
    globalProvider.getDelegate() === routingState.provider
  ) {
    // Release only our router so a host can register its tracer provider later.
    // Cached tracers still route through the same shared state on later calls.
    trace.disable();
  }
  const manager = routingState.contextManager;
  if (manager) {
    // Probe our manager directly: a replacement host manager cannot see its store.
    const probe = context.active().setValue(contextProbeKey, manager);
    if (manager.with(probe, () => context.active().getValue(contextProbeKey)) === manager) {
      context.disable();
    } else {
      manager.disable();
    }
    routingState.contextManager = undefined;
  }
}

function ensureContextManager(): void {
  // A host may already own the context manager. Probe through the public API instead
  // of replacing it. Shared ownership keeps the fallback alive for overlapping evaluations.
  const probe = context.active().setValue(contextProbeKey, true);
  if (!context.with(probe, () => context.active().getValue(contextProbeKey))) {
    const manager = new AsyncLocalStorageContextManager().enable();
    if (context.setGlobalContextManager(manager)) {
      routingState.contextManager = manager;
    } else {
      manager.disable();
    }
  }
}

/**
 * Initialize the OpenTelemetry SDK for tracing LLM provider calls.
 *
 * This sets up:
 * - A SdkTracerProvider with promptfoo service info
 * - LocalSpanExporter for storing spans in TraceStore (SQLite)
 * - Optional OTLPTraceExporter for external backends (Jaeger, Honeycomb, etc.)
 *
 * @param config - OTEL configuration
 */
export function initializeOtel(config: OtelConfig): void {
  const scope = getOtelScope();
  if (!scope) {
    throw new Error('OpenTelemetry must be initialized within an evaluation context');
  }
  if (scope.provider) {
    return;
  }

  if (!config.enabled) {
    logger.debug('[OtelSdk] OTEL tracing is disabled');
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
    const localExporter = new LocalSpanExporter();
    spanProcessors.push(batchProcessorFromEnv(localExporter));
    logger.debug('[OtelSdk] Added local span exporter');
  }

  // Add external OTLP exporter if endpoint configured
  if (config.endpoint) {
    // Local-only tracing does not need the external exporter and its transports.
    const { OTLPTraceExporter } =
      require('@opentelemetry/exporter-trace-otlp-http') as typeof import('@opentelemetry/exporter-trace-otlp-http');
    const otlpExporter = new OTLPTraceExporter({
      url: config.endpoint,
    });
    spanProcessors.push(batchProcessorFromEnv(otlpExporter));
    logger.debug('[OtelSdk] Added OTLP exporter');
  }

  // Create trace provider with resource and span processors
  scope.provider = new SdkTracerProvider({ ...traceOptionsFromEnv(), resource, spanProcessors });
  routingState.owners.set(scope.provider, scope);
  ensureContextManager();
  // Propagation is stateless and process-wide. Per-eval cleanup must not unregister
  // it: the public API cannot identify a replacement installed by the host.
  if (propagation.fields().length === 0) {
    propagation.setGlobalPropagator(traceContextPropagator);
  }
  ensureGlobalTracerRouting();
  logger.info('[OtelSdk] OpenTelemetry SDK initialized successfully');

  // SIGTERM flushes first. The CLI closes tracing after draining providers.
  for (const [event, handler] of handlers) {
    if (!process.listeners(event).includes(handler)) {
      process.once(event, handler);
    }
  }
}

function providersFor(mode?: 'process') {
  if (mode === 'process') {
    return [...routingState.owners.keys()];
  }
  const provider = getOtelScope()?.provider;
  return provider ? [provider] : [];
}

/** Only a process-exit handler should close another evaluation's exporter. */
export async function shutdownOtel(mode?: 'process'): Promise<void> {
  await Promise.all(
    providersFor(mode).map(async (provider) => {
      const scope = routingState.owners.get(provider)!;
      scope.provider = undefined;
      releaseGlobalTracingRegistrations(provider);
      try {
        await provider.shutdown();
      } catch (error) {
        logger.error('[OtelSdk] Error shutting down OpenTelemetry SDK', { error });
      }
    }),
  );
}

export async function flushOtel(mode?: 'process'): Promise<void> {
  await Promise.all(
    providersFor(mode).map(async (provider) => {
      try {
        await provider.forceFlush();
      } catch (error) {
        logger.error('[OtelSdk] Error flushing spans', { error });
      }
    }),
  );
}

export function isOtelInitialized(): boolean {
  return getOtelScope()?.provider !== undefined;
}
