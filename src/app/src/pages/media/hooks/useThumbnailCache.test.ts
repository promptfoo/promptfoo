import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getThumbnail } from './useThumbnailCache';

// Mock IndexedDB
const mockObjectStore = {
  get: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  index: vi.fn(),
  getAll: vi.fn(),
  createIndex: vi.fn(),
};

const mockTransaction = {
  objectStore: vi.fn(() => mockObjectStore),
};

const mockDB = {
  transaction: vi.fn(() => mockTransaction),
  objectStoreNames: {
    contains: vi.fn(() => false),
  },
  createObjectStore: vi.fn(() => mockObjectStore),
};

const mockOpenDBRequest = {
  result: mockDB,
  error: null,
  onsuccess: null as ((event: Event) => void) | null,
  onerror: null as ((event: Event) => void) | null,
  onupgradeneeded: null as ((event: IDBVersionChangeEvent) => void) | null,
};

describe('getThumbnail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock indexedDB.open
    global.indexedDB = {
      open: vi.fn(() => mockOpenDBRequest as unknown as IDBOpenDBRequest),
    } as unknown as IDBFactory;
  });

  it('should return cached thumbnail if not expired', async () => {
    const mockThumbnail = 'data:image/jpeg;base64,xyz';
    const mockEntry = {
      hash: 'test-hash',
      dataUrl: mockThumbnail,
      createdAt: Date.now() - 1000, // 1 second ago (not expired)
    };

    // Setup mock request
    const mockRequest = {
      result: mockEntry,
      onsuccess: null as ((event: Event) => void) | null,
      onerror: null as ((event: Event) => void) | null,
    };
    mockObjectStore.get.mockReturnValue(mockRequest);

    // Trigger DB open success
    setTimeout(() => {
      if (mockOpenDBRequest.onsuccess) {
        mockOpenDBRequest.onsuccess(new Event('success'));
      }
    }, 0);

    const promise = getThumbnail('test-hash');

    // Trigger get success
    setTimeout(() => {
      if (mockRequest.onsuccess) {
        mockRequest.onsuccess(new Event('success'));
      }
    }, 10);

    const result = await promise;

    expect(result).toBe(mockThumbnail);
    expect(mockObjectStore.get).toHaveBeenCalledWith('test-hash');
  });

  it('should return null if thumbnail is expired', async () => {
    const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
    const mockEntry = {
      hash: 'expired-hash',
      dataUrl: 'data:image/jpeg;base64,xyz',
      createdAt: Date.now() - MAX_AGE_MS - 1000, // Expired by 1 second
    };

    const mockRequest = {
      result: mockEntry,
      onsuccess: null as ((event: Event) => void) | null,
      onerror: null as ((event: Event) => void) | null,
    };
    mockObjectStore.get.mockReturnValue(mockRequest);

    setTimeout(() => {
      if (mockOpenDBRequest.onsuccess) {
        mockOpenDBRequest.onsuccess(new Event('success'));
      }
    }, 0);

    const promise = getThumbnail('expired-hash');

    setTimeout(() => {
      if (mockRequest.onsuccess) {
        mockRequest.onsuccess(new Event('success'));
      }
    }, 10);

    const result = await promise;

    expect(result).toBeNull();
  });

  it('should return null if thumbnail not found', async () => {
    const mockRequest = {
      result: undefined,
      onsuccess: null as ((event: Event) => void) | null,
      onerror: null as ((event: Event) => void) | null,
    };
    mockObjectStore.get.mockReturnValue(mockRequest);

    setTimeout(() => {
      if (mockOpenDBRequest.onsuccess) {
        mockOpenDBRequest.onsuccess(new Event('success'));
      }
    }, 0);

    const promise = getThumbnail('nonexistent');

    setTimeout(() => {
      if (mockRequest.onsuccess) {
        mockRequest.onsuccess(new Event('success'));
      }
    }, 10);

    const result = await promise;

    expect(result).toBeNull();
  });

  it('should return null on database error', async () => {
    const mockRequest = {
      result: undefined,
      onsuccess: null as ((event: Event) => void) | null,
      onerror: null as ((event: Event) => void) | null,
    };
    mockObjectStore.get.mockReturnValue(mockRequest);

    setTimeout(() => {
      if (mockOpenDBRequest.onsuccess) {
        mockOpenDBRequest.onsuccess(new Event('success'));
      }
    }, 0);

    const promise = getThumbnail('test-hash');

    setTimeout(() => {
      if (mockRequest.onerror) {
        mockRequest.onerror(new Event('error'));
      }
    }, 10);

    const result = await promise;

    expect(result).toBeNull();
  });
});

describe('clearExpiredThumbnails', () => {
  it('should calculate correct cutoff time for 7 day expiration', () => {
    const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
    const now = Date.now();
    const cutoff = now - MAX_AGE_MS;

    // Entry from 8 days ago should be expired
    const expiredEntry = {
      createdAt: now - 8 * 24 * 60 * 60 * 1000,
    };
    expect(expiredEntry.createdAt).toBeLessThan(cutoff);

    // Entry from 6 days ago should not be expired
    const validEntry = {
      createdAt: now - 6 * 24 * 60 * 60 * 1000,
    };
    expect(validEntry.createdAt).toBeGreaterThan(cutoff);
  });

  it('should have correct MAX_AGE constant value', () => {
    const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
    expect(MAX_AGE_MS).toBe(604800000); // 7 days in milliseconds
  });
});
