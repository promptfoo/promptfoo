import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-node';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';

import logger from '../logger';
import { VERSION } from '../version';
import { LocalSpanExporter } from './localSpanExporter';
import type { OtelConfig } from './otelConfig';

// Singleton instances
let provider: NodeTracerProvider | null = null;
let initialized = false;

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

  // Create resource with service info
  const resource = new Resource({
    [ATTR_SERVICE_NAME]: config.serviceName,
    [ATTR_SERVICE_VERSION]: VERSION,
  });

  // Create trace provider
  provider = new NodeTracerProvider({ resource });

  // Add local exporter (writes to TraceStore/SQLite)
  if (config.localExport) {
    const localExporter = new LocalSpanExporter();
    provider.addSpanProcessor(new BatchSpanProcessor(localExporter));
    logger.debug('[OtelSdk] Added local span exporter');
  }

  // Add external OTLP exporter if endpoint configured
  if (config.endpoint) {
    const otlpExporter = new OTLPTraceExporter({
      url: config.endpoint,
    });
    provider.addSpanProcessor(new BatchSpanProcessor(otlpExporter));
    logger.debug(`[OtelSdk] Added OTLP exporter to ${config.endpoint}`);
  }

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
 */
function setupShutdownHandlers(): void {
  const shutdown = async (signal: string) => {
    logger.debug(`[OtelSdk] Received ${signal}, shutting down`);
    await shutdownOtel();
  };

  // Handle common termination signals
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));

  // Handle beforeExit for graceful shutdown
  process.once('beforeExit', async () => {
    await flushOtel();
  });
}
