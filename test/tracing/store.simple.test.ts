import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { TraceStore } from '../../src/tracing/store';

// Mock the entire database module
jest.mock('../../src/database', () => ({
  getDb: jest.fn(),
}));

// Mock the crypto module
jest.mock('crypto', () => ({
  randomUUID: jest.fn(() => 'test-uuid'),
}));

// Mock logger
jest.mock('../../src/logger', () => ({
  default: {
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

describe('TraceStore (Simple)', () => {
  let traceStore: TraceStore;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create a new instance for each test
    traceStore = new TraceStore();
  });

  afterEach(() => {
    jest.restoreAllMocks();
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
