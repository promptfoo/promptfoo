import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TraceStore } from '../../src/tracing/store';

// Mock the entire database module
vi.mock('../../src/database', () => ({
  getDb: vi.fn(),
}));

// Mock the crypto module
vi.mock('crypto', () => ({
  randomUUID: vi.fn(() => 'test-uuid'),
}));

// Mock logger
vi.mock('../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('TraceStore (Simple)', () => {
  let traceStore: TraceStore;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create a new instance for each test
    traceStore = new TraceStore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should be instantiable', () => {
    expect(traceStore).toBeInstanceOf(TraceStore);
  });

  it('should have all required methods', () => {
    expect(traceStore.createTrace).toBeDefined();
    expect(traceStore.addSpans).toBeDefined();
    expect(traceStore.getTracesByEvaluation).toBeDefined();
    expect(traceStore.getTrace).toBeDefined();
    expect(traceStore.deleteOldTraces).toBeDefined();
  });
});
