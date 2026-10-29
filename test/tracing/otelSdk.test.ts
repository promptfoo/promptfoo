import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDeferred } from '../util/utils';

import type { OtelConfig } from '../../src/tracing/otelConfig';

// Create mock functions that will be used across tests
let registeredProvider: object | undefined;
const mockRegister = vi.fn(function (this: object) {
  registeredProvider ??= this;
});
const mockGetTracerProvider = vi.fn(() => registeredProvider);
const mockTraceDisable = vi.fn(() => {
  registeredProvider = undefined;
});
const mockShutdown = vi.fn().mockResolvedValue(undefined);
const mockForceFlush = vi.fn().mockResolvedValue(undefined);
const mockLocalFlush = vi.fn().mockResolvedValue(undefined);
const mockAddSpanProcessor = vi.fn();
const mockSetLogger = vi.fn();

// Track constructor calls
let nodeTracerProviderCalls: unknown[] = [];
let otlpExporterCalls: unknown[] = [];
let localExporterCalls: unknown[] = [];
let batchProcessorCalls: unknown[] = [];
let resourceCalls: unknown[] = [];

vi.mock('@opentelemetry/sdk-trace-node', () => {
  // Use a class-like constructor function
  return {
    NodeTracerProvider: class MockNodeTracerProvider {
      constructor(options: unknown) {
        nodeTracerProviderCalls.push(options);
      }
      register = mockRegister;
      shutdown = mockShutdown;
      forceFlush = mockForceFlush;
      addSpanProcessor = mockAddSpanProcessor;
    },
    BatchSpanProcessor: class MockBatchSpanProcessor {
      exporter: unknown;
      constructor(exporter: unknown) {
        this.exporter = exporter;
        batchProcessorCalls.push(exporter);
      }
    },
  };
});

const { loadOtlpExporter } = vi.hoisted(() => ({ loadOtlpExporter: vi.fn() }));

vi.mock('node:module', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:module')>();
  return {
    ...actual,
    createRequire: (url: string | URL) => {
      const require = actual.createRequire(url);
      return Object.assign(
        (id: string) =>
          id === '@opentelemetry/exporter-trace-otlp-http' ? loadOtlpExporter() : require(id),
        require,
      );
    },
  };
});

vi.mock('@opentelemetry/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@opentelemetry/core')>()),
  W3CTraceContextPropagator: class MockW3CTraceContextPropagator {},
}));

vi.mock('@opentelemetry/resources', () => ({
  resourceFromAttributes: (attrs: Record<string, unknown>) => {
    resourceCalls.push(attrs);
    return { attributes: attrs };
  },
}));

vi.mock('@opentelemetry/semantic-conventions', () => ({
  ATTR_SERVICE_NAME: 'service.name',
  ATTR_SERVICE_VERSION: 'service.version',
}));

vi.mock('@opentelemetry/api', () => ({
  createContextKey: Symbol.for,
  ProxyTracerProvider: class {},
  trace: { getTracerProvider: mockGetTracerProvider, disable: mockTraceDisable },
  diag: {
    setLogger: mockSetLogger,
  },
  DiagConsoleLogger: class MockDiagConsoleLogger {},
  DiagLogLevel: {
    DEBUG: 0,
  },
  propagation: {
    setGlobalPropagator: vi.fn(),
  },
}));

vi.mock('../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('../../src/version', () => ({
  VERSION: '1.0.0-test',
}));

vi.mock('../../src/tracing/localSpanExporter', () => ({
  LocalSpanExporter: class MockLocalSpanExporter {
    constructor() {
      localExporterCalls.push({});
    }
    export = vi.fn();
    shutdown = vi.fn();
    forceFlush = mockLocalFlush;
    trackTrace = vi.fn(() => vi.fn());
  },
}));

describe('otelSdk', () => {
  // Module functions - will be re-imported in beforeEach
  let initializeOtel: typeof import('../../src/tracing/otelSdk').initializeOtel;
  let shutdownOtel: typeof import('../../src/tracing/otelSdk').shutdownOtel;
  let flushOtel: typeof import('../../src/tracing/otelSdk').flushOtel;
  let isOtelInitialized: typeof import('../../src/tracing/otelSdk').isOtelInitialized;

  beforeEach(async () => {
    // Clear all mocks and call tracking
    loadOtlpExporter.mockReset().mockReturnValue({
      OTLPTraceExporter: class MockOTLPTraceExporter {
        url: string | undefined;
        constructor(config: { url?: string } = {}) {
          this.url = config.url;
          otlpExporterCalls.push(config);
        }
      },
    });
    vi.clearAllMocks();
    registeredProvider = undefined;
    nodeTracerProviderCalls = [];
    otlpExporterCalls = [];
    localExporterCalls = [];
    batchProcessorCalls = [];
    resourceCalls = [];

    // Reset mock implementations
    mockShutdown.mockResolvedValue(undefined);
    mockLocalFlush.mockResolvedValue(undefined);
    mockForceFlush.mockResolvedValue(undefined);

    // Reset modules to clear singleton state
    vi.resetModules();

    // Re-import the module
    const module = await import('../../src/tracing/otelSdk');
    initializeOtel = module.initializeOtel;
    shutdownOtel = module.shutdownOtel;
    flushOtel = module.flushOtel;
    isOtelInitialized = module.isOtelInitialized;
  });

  afterEach(async () => {
    await shutdownOtel();
    vi.resetAllMocks();
  });

  const defaultConfig: OtelConfig = {
    enabled: true,
    serviceName: 'test-service',
    endpoint: undefined,
    localExport: true,
    debug: false,
  };

  describe('initializeOtel', () => {
    it('should not initialize when disabled', () => {
      initializeOtel({ ...defaultConfig, enabled: false });

      expect(isOtelInitialized()).toBe(false);
      expect(mockRegister).not.toHaveBeenCalled();
      expect(loadOtlpExporter).not.toHaveBeenCalled();
    });

    it('should initialize and register provider', () => {
      initializeOtel(defaultConfig);

      expect(isOtelInitialized()).toBe(true);
      expect(nodeTracerProviderCalls.length).toBe(1);
      expect(mockRegister).toHaveBeenCalled();
      expect(loadOtlpExporter).not.toHaveBeenCalled();
    });

    it('should add local span processor when localExport is true', () => {
      initializeOtel(defaultConfig);

      expect(localExporterCalls.length).toBe(1);
      // Span processors are now passed via constructor, so we check the constructor args
      expect(nodeTracerProviderCalls.length).toBe(1);
      const constructorArg = nodeTracerProviderCalls[0] as { spanProcessors?: unknown[] };
      expect(constructorArg.spanProcessors).toBeDefined();
      expect(constructorArg.spanProcessors?.length).toBeGreaterThanOrEqual(1);
    });

    it('should add OTLP exporter when endpoint is configured', () => {
      initializeOtel({
        ...defaultConfig,
        endpoint: 'http://localhost:4318/v1/traces',
      });

      expect(otlpExporterCalls.length).toBe(1);
      expect(otlpExporterCalls[0]).toEqual({ url: 'http://localhost:4318/v1/traces' });
      // Both local and OTLP exporters - now passed via constructor
      const constructorArg = nodeTracerProviderCalls[0] as { spanProcessors?: unknown[] };
      expect(constructorArg.spanProcessors?.length).toBe(2);
    });

    it('should skip local export when localExport is false', () => {
      initializeOtel({
        ...defaultConfig,
        localExport: false,
        endpoint: 'http://localhost:4318',
      });

      expect(localExporterCalls.length).toBe(0);
      // Only OTLP exporter - now passed via constructor
      const constructorArg = nodeTracerProviderCalls[0] as { spanProcessors?: unknown[] };
      expect(constructorArg.spanProcessors?.length).toBe(1);
    });

    it('should enable debug logging when debug is true', () => {
      initializeOtel({
        ...defaultConfig,
        debug: true,
      });

      expect(mockSetLogger).toHaveBeenCalled();
    });

    it('should not reinitialize when already initialized', () => {
      initializeOtel(defaultConfig);
      const firstCallCount = mockRegister.mock.calls.length;

      initializeOtel(defaultConfig);

      expect(mockRegister.mock.calls.length).toBe(firstCallCount);
    });

    it.each([true, false])(
      'reports the first active exporter configuration (localExport=%s)',
      async (localExport) => {
        const { hasLocalSpanExporter } = await import('../../src/tracing/otelSdk');
        expect(hasLocalSpanExporter()).toBe(false);
        initializeOtel({ ...defaultConfig, localExport });
        initializeOtel({ ...defaultConfig, localExport: !localExport });
        expect(hasLocalSpanExporter()).toBe(localExport);
        expect(localExporterCalls).toHaveLength(localExport ? 1 : 0);
        await shutdownOtel();
        expect(hasLocalSpanExporter()).toBe(false);
      },
    );

    it('does not claim local export for another global tracer provider', async () => {
      const { hasLocalSpanExporter } = await import('../../src/tracing/otelSdk');
      const host = {};
      registeredProvider = host;
      initializeOtel(defaultConfig);
      expect(hasLocalSpanExporter()).toBe(false);
      await shutdownOtel();
      expect(registeredProvider).toBe(host);
      expect(mockTraceDisable).not.toHaveBeenCalled();
    });

    it('should create resource with service name and version', () => {
      initializeOtel(defaultConfig);

      expect(resourceCalls.length).toBe(1);
      expect(resourceCalls[0]).toEqual({
        'service.name': 'test-service',
        'service.version': '1.0.0-test',
      });
    });
  });

  describe('shutdownOtel', () => {
    it('keeps a shared provider recording until its last evaluator releases it', async () => {
      const releaseA = initializeOtel(defaultConfig)!;
      const releaseB = initializeOtel(defaultConfig)!;
      await releaseA();
      await releaseA();
      expect(mockForceFlush).toHaveBeenCalledOnce();
      expect(mockLocalFlush).toHaveBeenCalledOnce();
      expect(mockShutdown).not.toHaveBeenCalled();
      expect(isOtelInitialized()).toBe(true);
      await releaseB();
      expect(mockShutdown).toHaveBeenCalledOnce();
      expect(isOtelInitialized()).toBe(false);
    });

    it('joins a draining generation without allowing its evaluator to close the next one', async () => {
      const flushing = createDeferred<void>();
      mockShutdown.mockReturnValueOnce(flushing.promise);
      const releaseA = initializeOtel(defaultConfig)!;
      const signalShutdown = shutdownOtel();
      const finished = vi.fn();
      const concurrentShutdown = shutdownOtel().then(() => finished('shutdown'));
      const concurrentFlush = flushOtel().then(() => finished('flush'));
      const releaseB = initializeOtel(defaultConfig)!;
      const lateRelease = releaseA().then(() => finished('release'));
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(finished).not.toHaveBeenCalled();
      expect(mockShutdown).toHaveBeenCalledOnce();
      flushing.resolve();
      await Promise.all([signalShutdown, concurrentShutdown, concurrentFlush, lateRelease]);
      expect(finished).toHaveBeenCalledTimes(3);
      expect(isOtelInitialized()).toBe(true);
      await releaseB();
      expect(mockShutdown).toHaveBeenCalledTimes(2);
    });

    it('lets a new SDK register while the previous exporter finishes shutdown', async () => {
      const { hasLocalSpanExporter } = await import('../../src/tracing/otelSdk');
      const flushing = createDeferred<void>();
      mockShutdown.mockReturnValueOnce(flushing.promise);
      initializeOtel(defaultConfig);
      const first = registeredProvider;
      const pendingShutdown = shutdownOtel();
      initializeOtel(defaultConfig);
      expect(registeredProvider).toBeDefined();
      expect(registeredProvider).not.toBe(first);
      expect(hasLocalSpanExporter()).toBe(true);
      flushing.resolve();
      await pendingShutdown;
      expect(hasLocalSpanExporter()).toBe(true);
      await shutdownOtel();
      expect(registeredProvider).toBeUndefined();
    });

    it('keeps signal listeners through the last export and rearms a replacement SDK', async () => {
      const flushing = createDeferred<void>();
      mockShutdown.mockReturnValueOnce(flushing.promise);
      const previous = process.rawListeners('SIGTERM');
      const releaseA = initializeOtel(defaultConfig)!;
      const drain = releaseA();
      const consumed = process
        .rawListeners('SIGTERM')
        .find((listener) => !previous.includes(listener));
      expect(consumed).toBeDefined();
      consumed!.call(process, 'SIGTERM'); // invoke only Promptfoo's real once-wrapper
      const releaseB = initializeOtel(defaultConfig)!;
      expect(process.rawListeners('SIGTERM')).toEqual(previous);
      flushing.resolve();
      await drain;
      expect(process.rawListeners('SIGTERM')).toHaveLength(previous.length + 1);
      await releaseB();
      expect(process.rawListeners('SIGTERM')).toEqual(previous);
    });

    it('should not fail when not initialized', async () => {
      await expect(shutdownOtel()).resolves.toBeUndefined();
    });

    it('should call provider shutdown when initialized', async () => {
      initializeOtel(defaultConfig);
      await shutdownOtel();

      expect(mockShutdown).toHaveBeenCalled();
      expect(isOtelInitialized()).toBe(false);
    });

    it('should handle shutdown errors gracefully', async () => {
      mockShutdown.mockRejectedValue(new Error('Shutdown failed'));

      initializeOtel(defaultConfig);
      await expect(shutdownOtel()).resolves.toBeUndefined();
      expect(mockLocalFlush).toHaveBeenCalledOnce();
      expect(isOtelInitialized()).toBe(false);
    });
  });

  describe('flushOtel', () => {
    it('should not fail when not initialized', async () => {
      await expect(flushOtel()).resolves.toBe(true);
    });

    it('bounds an in-flight local write by the remaining SDK flush budget', async () => {
      vi.useFakeTimers();
      const external = createDeferred<void>();
      const local = createDeferred<void>();
      mockForceFlush.mockReturnValueOnce(external.promise);
      mockLocalFlush.mockReturnValueOnce(local.promise);
      initializeOtel(defaultConfig);
      try {
        const flushed = vi.fn();
        const flush = flushOtel().then(flushed);
        await vi.advanceTimersByTimeAsync(29_999);
        external.reject(new Error('external exporter timed out'));
        await vi.advanceTimersByTimeAsync(0);
        expect(flushed).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        await flush;
        expect(flushed).toHaveBeenCalledWith(false);
      } finally {
        local.resolve();
        vi.useRealTimers();
      }
    });

    it('checks the row after the SDK has dispatched its last batch', async () => {
      const { trackLocalTrace } = await import('../../src/tracing/otelSdk');
      const flushing = createDeferred<void>();
      initializeOtel(defaultConfig);
      const row = trackLocalTrace('trace-a')!;
      mockForceFlush.mockReturnValueOnce(flushing.promise);
      const result = row.flush();
      expect(mockLocalFlush).not.toHaveBeenCalled();
      mockLocalFlush.mockRejectedValueOnce(new Error('late background batch failed'));
      flushing.resolve();
      await expect(result).resolves.toBe(false);
      expect(mockLocalFlush).toHaveBeenCalledWith('trace-a');
      row.release();
    });

    it('checks background write failures on the SDK that recorded the row', async () => {
      const { trackLocalTrace } = await import('../../src/tracing/otelSdk');
      initializeOtel(defaultConfig);
      const row = trackLocalTrace('trace-a')!;
      await expect(row.flush()).resolves.toBe(true);
      expect(mockLocalFlush).toHaveBeenCalledWith('trace-a');
      await shutdownOtel();
      initializeOtel(defaultConfig);
      await expect(row.flush()).resolves.toBe(false);
      row.release();
    });

    it('should call provider forceFlush when initialized', async () => {
      initializeOtel(defaultConfig);
      await flushOtel();

      expect(mockForceFlush).toHaveBeenCalled();
    });

    it('should handle flush errors gracefully', async () => {
      mockForceFlush.mockRejectedValue(new Error('Flush failed'));

      initializeOtel(defaultConfig);
      await expect(flushOtel()).resolves.toBe(true);
      expect(mockLocalFlush).toHaveBeenCalledOnce();
    });
  });

  describe('isOtelInitialized', () => {
    it('should return false before initialization', () => {
      expect(isOtelInitialized()).toBe(false);
    });

    it('should return true after initialization', () => {
      initializeOtel(defaultConfig);
      expect(isOtelInitialized()).toBe(true);
    });

    it('should return false after shutdown', async () => {
      initializeOtel(defaultConfig);
      await shutdownOtel();
      expect(isOtelInitialized()).toBe(false);
    });
  });
});
