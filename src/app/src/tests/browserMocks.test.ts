import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  mockBrowserProperty,
  mockIndexedDB,
  mockIntersectionObserver,
  mockObjectUrl,
  mockWindowLocation,
  restoreBrowserMocks,
} from './browserMocks';

describe('browserMocks', () => {
  afterEach(() => {
    restoreBrowserMocks();
  });

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

  it('mocks IntersectionObserver without nonportable properties', () => {
    const onCreate = vi.fn();
    const callback: IntersectionObserverCallback = vi.fn();

    mockIntersectionObserver({ onCreate });

    const observer = new window.IntersectionObserver(callback);

    expect(onCreate).toHaveBeenCalledWith(callback);
    expect(observer.root).toBeNull();
    expect(observer.rootMargin).toBe('');
    expect(observer.thresholds).toEqual([]);
    expect('scrollMargin' in observer).toBe(false);
  });

  it('allows object URL mocks to be restored individually or together', () => {
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;

    const objectUrl = mockObjectUrl('blob:browser-mock-test');

    expect(URL.createObjectURL(new Blob())).toBe('blob:browser-mock-test');

    objectUrl.restoreCreateObjectURL();
    expect(URL.createObjectURL).toBe(originalCreateObjectURL);
    expect(URL.revokeObjectURL).toBe(objectUrl.revokeObjectURL);

    objectUrl.restore();
    expect(URL.revokeObjectURL).toBe(originalRevokeObjectURL);
  });

  it('updates and restores window.location through history state', () => {
    const originalHref = window.location.href;

    const location = mockWindowLocation({
      pathname: '/reports',
      search: '?evalId=test-eval-id',
      hash: '#overview',
    });

    expect(location).toBe(window.location);
    expect(window.location.href).toBe(
      `${window.location.origin}/reports?evalId=test-eval-id#overview`,
    );
    expect(window.location.pathname).toBe('/reports');
    expect(window.location.search).toBe('?evalId=test-eval-id');
    expect(window.location.hash).toBe('#overview');

    restoreBrowserMocks();
    expect(window.location.href).toBe(originalHref);
  });

  it('supports same-origin href values without redefining window.location', () => {
    const locationDescriptor = Object.getOwnPropertyDescriptor(window, 'location');
    const nextHref = `${window.location.origin}/evals?filter=failed`;

    expect(() => mockWindowLocation({ href: nextHref })).not.toThrow();
    expect(window.location.href).toBe(nextHref);
    expect(Object.getOwnPropertyDescriptor(window, 'location')).toEqual(locationDescriptor);
  });

  it('rejects cross-origin href values', () => {
    expect(() => mockWindowLocation({ href: 'https://example.com/report' })).toThrow(
      /same-origin URLs/,
    );
  });

  it('rejects mixed href and location field overrides', () => {
    expect(() => mockWindowLocation({ href: '/reports', search: '?evalId=test-eval-id' })).toThrow(
      /mixing href with URL field overrides: search/,
    );
  });

  it('rejects unsupported location fields', () => {
    expect(() => mockWindowLocation({ assign: vi.fn() } as Partial<Location>)).toThrow(
      /unsupported fields: assign/,
    );
  });
});
