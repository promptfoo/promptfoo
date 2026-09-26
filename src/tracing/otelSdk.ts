import { AsyncLocalStorage } from 'node:async_hooks';

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
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchSpanProcessor, NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import logger from '../logger';
import { VERSION } from '../version';
import { LocalSpanExporter } from './localSpanExporter';
import type { Tracer } from '@opentelemetry/api';
import type { SpanProcessor } from '@opentelemetry/sdk-trace-base';

import type { OtelConfig } from './otelConfig';

interface OtelScope {
  provider?: NodeTracerProvider;
}

// Custom providers can load the public package alongside the CLI bundle. Share the
// storage object, never a current provider, so both observe the same async scope.
const OTEL_SCOPE_KEY = Symbol.for('promptfoo.otelScope');
const globalScopes = globalThis as { [OTEL_SCOPE_KEY]?: AsyncLocalStorage<OtelScope> };
const otelScope = (globalScopes[OTEL_SCOPE_KEY] ??= new AsyncLocalStorage<OtelScope>());
const ownedProviders = new Set<NodeTracerProvider>();
const contextProbeKey = createContextKey('promptfoo.contextProbe');

/** Isolate provider ownership even for evaluations with tracing disabled. */
export function withOtelContext<T>(fn: () => T): T {
  return otelScope.run({}, fn);
}

function getOtelScope(): OtelScope | undefined {
  return otelScope.getStore();
}

/** Use the evaluation's provider without replacing a host application's global provider. */
export function getOtelTracer(name: string, version?: string): Tracer {
  return getOtelScope()?.provider?.getTracer(name, version) ?? trace.getTracer(name, version);
}

function ensureContextManager(): void {
  // A host may already own the context manager. Probe through the public API instead
  // of replacing it, and keep our fallback alive across sequential evaluations.
  const probe = context.active().setValue(contextProbeKey, true);
  if (!context.with(probe, () => context.active().getValue(contextProbeKey))) {
    const manager = new AsyncLocalStorageContextManager().enable();
    if (!context.setGlobalContextManager(manager)) {
      manager.disable();
    }
  }
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
    endpoint: config.endpoint,
    localExport: config.localExport,
  });

  // Enable debug logging if requested
  if (config.debug) {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
  }

  ensureContextManager();

  // Registered host propagators can use other formats; never replace them.
  if (propagation.fields().length === 0) {
    propagation.setGlobalPropagator(new W3CTraceContextPropagator());
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
  scope.provider = new NodeTracerProvider({ resource, spanProcessors });
  ownedProviders.add(scope.provider);
  logger.info('[OtelSdk] OpenTelemetry SDK initialized successfully');

  // Set up graceful shutdown
  setupShutdownHandlers();
}

/**
 * Shutdown the OpenTelemetry SDK.
 * Flushes any pending spans and releases resources.
 */
export async function shutdownOtel(): Promise<void> {
  const scope = getOtelScope();
  const provider = scope?.provider;
  if (!provider) {
    return;
  }
  scope.provider = undefined;
  await shutdownProvider(provider);
}

async function shutdownProvider(provider: NodeTracerProvider): Promise<void> {
  try {
    await provider.shutdown();
  } catch (error) {
    logger.error('[OtelSdk] Error shutting down OpenTelemetry SDK', { error });
  } finally {
    ownedProviders.delete(provider);
    if (ownedProviders.size === 0) {
      cleanupShutdownHandlers();
    }
  }
}

/**
 * Force flush any pending spans.
 * Useful before process exit to ensure all spans are exported.
 */
export async function flushOtel(): Promise<void> {
  const provider = getOtelScope()?.provider;
  if (!provider) {
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
  return getOtelScope()?.provider !== undefined;
}

// Signal callbacks do not execute within an evaluation's async context. Drain only
// providers owned here, and keep one set of listeners until the last scope closes.
function onShutdown(): void {
  void Promise.all([...ownedProviders].map(shutdownProvider));
}

async function onBeforeExit(): Promise<void> {
  await Promise.allSettled([...ownedProviders].map((provider) => provider.forceFlush()));
}

function setupShutdownHandlers(): void {
  if (ownedProviders.size !== 1) {
    return;
  }
  process.once('SIGTERM', onShutdown);
  process.once('SIGINT', onShutdown);
  process.once('beforeExit', onBeforeExit);
}

function cleanupShutdownHandlers(): void {
  process.removeListener('SIGTERM', onShutdown);
  process.removeListener('SIGINT', onShutdown);
  process.removeListener('beforeExit', onBeforeExit);
}
