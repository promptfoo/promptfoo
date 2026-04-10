import { describe, expect, it, vi } from 'vitest';
import { mockBrowserProperty, mockIndexedDB, restoreBrowserMocks } from './browserMocks';

describe('browserMocks', () => {
  it('restores original properties after spies wrap mocked values', () => {
    const target = {
      open: () => 'original',
    };

    mockBrowserProperty(
      target,
      'open',
      vi.fn(() => 'mocked'),
    );
    vi.spyOn(target, 'open').mockImplementation(() => 'spied');

    vi.restoreAllMocks();
    restoreBrowserMocks();

    expect(target.open()).toBe('original');
  });

  it('restores indexedDB mocks through the shared browser mock cleanup', () => {
    const originalIndexedDB = globalThis.indexedDB;
    const indexedDB = { open: vi.fn() } as unknown as IDBFactory;

    mockIndexedDB(indexedDB);
    expect(globalThis.indexedDB).toBe(indexedDB);

    restoreBrowserMocks();
    expect(globalThis.indexedDB).toBe(originalIndexedDB);
  });
});
