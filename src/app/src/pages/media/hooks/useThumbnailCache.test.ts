import { mockBrowserProperty, mockIndexedDB } from '@app/tests/browserMocks';
import { useTestTimers } from '@app/tests/timers';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

type MockIDBRequest<T> = {
  error: DOMException | null;
  onerror: ((event: Event) => void) | null;
  onsuccess: ((event: Event) => void) | null;
  result: T;
};

type MockIDBOpenRequest = MockIDBRequest<typeof mockDB> & {
  onupgradeneeded: ((event: IDBVersionChangeEvent) => void) | null;
};

let mockOpenDBRequest: MockIDBOpenRequest;

function createOpenDBRequest(): MockIDBOpenRequest {
  return {
    result: mockDB,
    error: null,
    onsuccess: null,
    onerror: null,
    onupgradeneeded: null,
  };
}

function createRequest<T>(result: T): MockIDBRequest<T> {
  return {
    result,
    error: null,
    onsuccess: null,
    onerror: null,
  };
}

async function loadThumbnailCache() {
  vi.resetModules();
  return import('./useThumbnailCache');
}

describe('getThumbnail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOpenDBRequest = createOpenDBRequest();
    mockIndexedDB({
      open: vi.fn(() => mockOpenDBRequest as unknown as IDBOpenDBRequest),
    } as unknown as IDBFactory);
  });

  it('should return cached thumbnail if not expired', async () => {
    const { getThumbnail } = await loadThumbnailCache();
    const mockThumbnail = 'data:image/jpeg;base64,xyz';
    const mockEntry = {
      hash: 'test-hash',
      dataUrl: mockThumbnail,
      createdAt: Date.now() - 1000, // 1 second ago (not expired)
    };

    // Setup mock request
    const mockRequest = createRequest(mockEntry);
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
    const { getThumbnail } = await loadThumbnailCache();
    const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
    const mockEntry = {
      hash: 'expired-hash',
      dataUrl: 'data:image/jpeg;base64,xyz',
      createdAt: Date.now() - MAX_AGE_MS - 1000, // Expired by 1 second
    };

    const mockRequest = createRequest(mockEntry);
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
    const { getThumbnail } = await loadThumbnailCache();
    const mockRequest = createRequest(undefined);
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
    const { getThumbnail } = await loadThumbnailCache();
    const mockRequest = createRequest(undefined);
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

describe('thumbnail cache writes', () => {
  const now = new Date('2026-10-10T12:00:00Z').getTime();
  let timers: ReturnType<typeof useTestTimers>;
  let upperBound: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetAllMocks();
    timers = useTestTimers();
    timers.setSystemTime(now);
    mockTransaction.objectStore.mockReturnValue(mockObjectStore);
    mockDB.transaction.mockReturnValue(mockTransaction);
    mockOpenDBRequest = createOpenDBRequest();
    mockIndexedDB({
      open: vi.fn(() => mockOpenDBRequest as unknown as IDBOpenDBRequest),
    } as unknown as IDBFactory);
    upperBound = vi.fn((upper: number) => ({ upper }));
    mockBrowserProperty(globalThis, 'IDBKeyRange', { upperBound });
  });

  async function finishOpeningDatabase() {
    mockOpenDBRequest.onsuccess?.(new Event('success'));
    await timers.advanceByAsync(0);
  }

  it('waits for the put request before resolving and stores the current timestamp', async () => {
    const { setThumbnail } = await loadThumbnailCache();
    const request = createRequest('saved-hash');
    mockObjectStore.put.mockReturnValue(request);
    const settled = vi.fn();

    const operation = setThumbnail('saved-hash', 'data:image/jpeg;base64,saved');
    void operation.then(settled, settled);
    await finishOpeningDatabase();

    expect(mockDB.transaction).toHaveBeenCalledWith('thumbnails', 'readwrite');
    expect(mockObjectStore.put).toHaveBeenCalledWith({
      hash: 'saved-hash',
      dataUrl: 'data:image/jpeg;base64,saved',
      createdAt: now,
    });
    expect(settled).not.toHaveBeenCalled();

    request.onsuccess?.(new Event('success'));
    await expect(operation).resolves.toBeUndefined();
    expect(settled).toHaveBeenCalledOnce();
  });

  it('rejects a failed put request so callers can handle a cache write failure', async () => {
    const { setThumbnail } = await loadThumbnailCache();
    const request = createRequest('failed-hash');
    request.error = new DOMException('Cache is full', 'QuotaExceededError');
    mockObjectStore.put.mockReturnValue(request);
    const operation = setThumbnail('failed-hash', 'data:image/jpeg;base64,failed');
    const outcome = operation.then(
      () => ({ status: 'fulfilled' }),
      (error: unknown) => ({ status: 'rejected', error }),
    );
    await finishOpeningDatabase();

    request.onerror?.(new Event('error'));

    await expect(outcome).resolves.toEqual({ status: 'rejected', error: request.error });
  });

  it('waits for a delete request before resolving', async () => {
    const { deleteThumbnail } = await loadThumbnailCache();
    const request = createRequest(undefined);
    mockObjectStore.delete.mockReturnValue(request);
    const settled = vi.fn();
    const operation = deleteThumbnail('deleted-hash');
    void operation.then(settled, settled);
    await finishOpeningDatabase();

    expect(mockObjectStore.delete).toHaveBeenCalledWith('deleted-hash');
    expect(settled).not.toHaveBeenCalled();

    request.onsuccess?.(new Event('success'));

    await expect(operation).resolves.toBeUndefined();
    expect(settled).toHaveBeenCalledOnce();
  });

  it('treats a delete request error as a best-effort cache failure', async () => {
    const { deleteThumbnail } = await loadThumbnailCache();
    const request = createRequest(undefined);
    request.error = new DOMException('Delete failed', 'UnknownError');
    mockObjectStore.delete.mockReturnValue(request);
    const operation = deleteThumbnail('deleted-hash');
    await finishOpeningDatabase();

    request.onerror?.(new Event('error'));

    await expect(operation).resolves.toBeUndefined();
  });

  it('deletes expired cursor entries and waits until the cursor is exhausted', async () => {
    const { clearExpiredThumbnails } = await loadThumbnailCache();
    const cursor = { delete: vi.fn(), continue: vi.fn() };
    const request = createRequest<typeof cursor | null>(cursor);
    const openCursor = vi.fn(() => request);
    mockObjectStore.index.mockReturnValue({ openCursor });
    const settled = vi.fn();
    const operation = clearExpiredThumbnails();
    void operation.then(settled, settled);
    await finishOpeningDatabase();

    expect(mockObjectStore.index).toHaveBeenCalledWith('createdAt');
    expect(upperBound).toHaveBeenCalledWith(now - 7 * 24 * 60 * 60 * 1000);
    expect(openCursor).toHaveBeenCalledWith(upperBound.mock.results[0].value);
    expect(settled).not.toHaveBeenCalled();

    request.onsuccess?.({ target: request } as unknown as Event);
    await timers.advanceByAsync(0);
    expect(cursor.delete).toHaveBeenCalledOnce();
    expect(cursor.continue).toHaveBeenCalledOnce();
    expect(settled).not.toHaveBeenCalled();

    request.onsuccess?.({ target: request } as unknown as Event);
    expect(cursor.delete).toHaveBeenCalledTimes(2);
    expect(cursor.continue).toHaveBeenCalledTimes(2);
    request.result = null;
    request.onsuccess?.({ target: request } as unknown as Event);

    await expect(operation).resolves.toBeUndefined();
    expect(settled).toHaveBeenCalledOnce();
  });

  it('resolves cleanup when the expiration index is empty', async () => {
    const { clearExpiredThumbnails } = await loadThumbnailCache();
    const request = createRequest(null);
    mockObjectStore.index.mockReturnValue({ openCursor: vi.fn(() => request) });
    const operation = clearExpiredThumbnails();
    await finishOpeningDatabase();

    request.onsuccess?.({ target: request } as unknown as Event);

    await expect(operation).resolves.toBeUndefined();
  });

  it('treats a cursor request error as a best-effort cleanup failure', async () => {
    const { clearExpiredThumbnails } = await loadThumbnailCache();
    const request = createRequest(null);
    request.error = new DOMException('Cursor failed', 'UnknownError');
    mockObjectStore.index.mockReturnValue({ openCursor: vi.fn(() => request) });
    const operation = clearExpiredThumbnails();
    await finishOpeningDatabase();

    request.onerror?.(new Event('error'));

    await expect(operation).resolves.toBeUndefined();
  });

  it.each(['setThumbnail', 'deleteThumbnail', 'clearExpiredThumbnails'] as const)(
    '%s remains optional when the database cannot be opened',
    async (operationName) => {
      const cache = await loadThumbnailCache();
      const operation = cache[operationName]('unavailable-hash', 'data:image/jpeg;base64,unused');
      mockOpenDBRequest.error = new DOMException('Storage unavailable', 'InvalidStateError');

      mockOpenDBRequest.onerror?.(new Event('error'));

      await expect(operation).resolves.toBeUndefined();
      expect(mockDB.transaction).not.toHaveBeenCalled();
    },
  );
});
