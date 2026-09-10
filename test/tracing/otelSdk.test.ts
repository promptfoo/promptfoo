import { trace } from '@opentelemetry/api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { OtelConfig } from '../../src/tracing/otelConfig';

// Create mock functions that will be used across tests
const { mockRegister, mockShutdown, mockForceFlush, mockAddSpanProcessor, mockSetLogger } =
  vi.hoisted(() => ({
    mockRegister: vi.fn(),
    mockShutdown: vi.fn(),
    mockForceFlush: vi.fn(),
    mockAddSpanProcessor: vi.fn(),
    mockSetLogger: vi.fn(),
  }));

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
      register(config: unknown) {
        trace.setGlobalTracerProvider(this as never);
        mockRegister(config);
      }
      getTracer = vi.fn();
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

vi.mock('@opentelemetry/exporter-trace-otlp-http', () => ({
  OTLPTraceExporter: class MockOTLPTraceExporter {
    url: string | undefined;
    constructor(config: { url?: string } = {}) {
      this.url = config.url;
      otlpExporterCalls.push(config);
    }
  },
}));

vi.mock('@opentelemetry/core', () => ({
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

vi.mock('@opentelemetry/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@opentelemetry/api')>()),
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
  },
}));

describe('otelSdk', () => {
  // Module functions - will be re-imported in beforeEach
  let initializeOtel: typeof import('../../src/tracing/otelSdk').initializeOtel;
  let acquireOtel: typeof import('../../src/tracing/otelSdk').acquireOtel;
  let shutdownOtel: typeof import('../../src/tracing/otelSdk').shutdownOtel;
  let flushOtel: typeof import('../../src/tracing/otelSdk').flushOtel;
  let isOtelInitialized: typeof import('../../src/tracing/otelSdk').isOtelInitialized;

  beforeEach(async () => {
    // Clear all mocks and call tracking
    vi.resetAllMocks();
    trace.disable();
    nodeTracerProviderCalls = [];
    otlpExporterCalls = [];
    localExporterCalls = [];
    batchProcessorCalls = [];
    resourceCalls = [];

    // Reset mock implementations
    mockShutdown.mockResolvedValue(undefined);
    mockForceFlush.mockResolvedValue(undefined);

    // Reset modules to clear singleton state
    vi.resetModules();

    // Re-import the module
    const module = await import('../../src/tracing/otelSdk');
    initializeOtel = module.initializeOtel;
    acquireOtel = module.acquireOtel;
    shutdownOtel = module.shutdownOtel;
    flushOtel = module.flushOtel;
    isOtelInitialized = module.isOtelInitialized;
  });

  afterEach(async () => {
    await shutdownOtel();
    trace.disable();
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
    });

    it('should initialize and register provider', () => {
      initializeOtel(defaultConfig);

      expect(isOtelInitialized()).toBe(true);
      expect(nodeTracerProviderCalls.length).toBe(1);
      expect(mockRegister).toHaveBeenCalled();
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
      expect(isOtelInitialized()).toBe(false);
    });
  });

  describe('acquireOtel', () => {
    it('does not initialize or acquire a disabled configuration', async () => {
      const release = await acquireOtel({ ...defaultConfig, enabled: false });
      await release();
      expect(mockRegister).not.toHaveBeenCalled();
      expect(mockShutdown).not.toHaveBeenCalled();
    });

    it('flushes each lease and retains the first configuration until the last release', async () => {
      const releaseFirst = await acquireOtel(defaultConfig);
      const releaseSecond = await acquireOtel({ ...defaultConfig, serviceName: 'second-service' });
      expect(resourceCalls).toEqual([
        { 'service.name': 'test-service', 'service.version': '1.0.0-test' },
      ]);

      await releaseFirst();
      expect(mockForceFlush).toHaveBeenCalledTimes(1);
      expect(mockShutdown).not.toHaveBeenCalled();
      expect(isOtelInitialized()).toBe(true);

      await releaseSecond();
      expect(mockForceFlush).toHaveBeenCalledTimes(2);
      expect(mockShutdown).toHaveBeenCalledTimes(1);
      expect(isOtelInitialized()).toBe(false);
    });

    it('makes concurrent release calls idempotent', async () => {
      const release = await acquireOtel(defaultConfig);
      const first = release();
      expect(release()).toBe(first);
      await first;
      await release();
      expect(mockForceFlush).toHaveBeenCalledTimes(1);
      expect(mockShutdown).toHaveBeenCalledTimes(1);
    });

    it('still shuts down the final lease after a flush failure', async () => {
      const release = await acquireOtel(defaultConfig);
      mockForceFlush.mockRejectedValueOnce(new Error('Flush failed'));
      await expect(release()).resolves.toBeUndefined();
      expect(mockShutdown).toHaveBeenCalledTimes(1);
      expect(isOtelInitialized()).toBe(false);
    });

    it('publishes the release promise before invoking exporter code', async () => {
      const release = await acquireOtel(defaultConfig);
      const releasing = release();
      mockForceFlush.mockImplementationOnce(async () => {
        expect(release()).toBe(releasing);
      });
      await releasing;
      expect(mockForceFlush).toHaveBeenCalledTimes(1);
      expect(mockShutdown).toHaveBeenCalledTimes(1);
    });

    it('preserves ownership of an explicitly initialized SDK', async () => {
      initializeOtel(defaultConfig);
      const release = await acquireOtel(defaultConfig);
      await release();
      expect(mockForceFlush).toHaveBeenCalledOnce();
      expect(mockShutdown).not.toHaveBeenCalled();
      expect(isOtelInitialized()).toBe(true);
    });

    it('lets explicit initialization adopt an active evaluation SDK', async () => {
      const release = await acquireOtel(defaultConfig);
      initializeOtel(defaultConfig);
      await release();
      expect(mockShutdown).not.toHaveBeenCalled();
      expect(isOtelInitialized()).toBe(true);
    });

    it('waits for final shutdown before acquiring the next SDK generation', async () => {
      let finishShutdown!: () => void;
      let startedShutdown!: () => void;
      const shutdownStarted = new Promise<void>((resolve) => {
        startedShutdown = resolve;
      });
      mockShutdown.mockImplementationOnce(() => {
        startedShutdown();
        return new Promise<void>((resolve) => {
          finishShutdown = resolve;
        });
      });
      const releaseFirst = await acquireOtel(defaultConfig);
      const firstRelease = releaseFirst();
      await shutdownStarted;

      let acquiredSecond = false;
      const secondAcquisition = acquireOtel(defaultConfig).then((release) => {
        acquiredSecond = true;
        return release;
      });
      await Promise.resolve();
      expect(acquiredSecond).toBe(false);
      expect(mockRegister).toHaveBeenCalledTimes(1);

      finishShutdown();
      await firstRelease;
      const releaseSecond = await secondAcquisition;
      expect(mockRegister).toHaveBeenCalledTimes(2);
      await releaseFirst();
      expect(isOtelInitialized()).toBe(true);
      await releaseSecond();
    });

    it('does not let an old lease shut down a replacement SDK', async () => {
      const releaseOld = await acquireOtel(defaultConfig);
      await shutdownOtel();
      const releaseNew = await acquireOtel(defaultConfig);
      await releaseOld();
      expect(mockShutdown).toHaveBeenCalledTimes(1);
      expect(isOtelInitialized()).toBe(true);
      await releaseNew();
      expect(mockShutdown).toHaveBeenCalledTimes(2);
    });
  });

  describe('flushOtel', () => {
    it('should not fail when not initialized', async () => {
      await expect(flushOtel()).resolves.toBeUndefined();
    });

    it('should call provider forceFlush when initialized', async () => {
      initializeOtel(defaultConfig);
      await flushOtel();

      expect(mockForceFlush).toHaveBeenCalled();
    });

    it('should handle flush errors gracefully', async () => {
      mockForceFlush.mockRejectedValue(new Error('Flush failed'));

      initializeOtel(defaultConfig);
      await expect(flushOtel()).resolves.toBeUndefined();
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
