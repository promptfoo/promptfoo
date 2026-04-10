import { vi } from 'vitest';

type RestoreBrowserMock = () => void;

const restoreCallbacks: RestoreBrowserMock[] = [];

export function restoreBrowserMocks() {
  while (restoreCallbacks.length > 0) {
    restoreCallbacks.pop()?.();
  }
}

export function mockBrowserProperty<T extends object, V>(
  target: T,
  property: PropertyKey,
  value: V,
) {
  const descriptor = Object.getOwnPropertyDescriptor(target, property);

  Object.defineProperty(target, property, {
    configurable: true,
    writable: true,
    value,
  });

  const restore = () => {
    if (descriptor) {
      Object.defineProperty(target, property, descriptor);
    } else {
      Reflect.deleteProperty(target, property);
    }
  };

  restoreCallbacks.push(restore);

  return value;
}

export function mockClipboard(overrides: Partial<Clipboard> = {}) {
  return mockBrowserProperty(navigator, 'clipboard', {
    writeText: vi.fn().mockResolvedValue(undefined),
    readText: vi.fn().mockResolvedValue(''),
    ...overrides,
  } as Clipboard);
}

export function mockDocumentExecCommand() {
  return mockBrowserProperty(document, 'execCommand', vi.fn());
}

type MatchMediaOptions = {
  matches?: boolean | ((query: string) => boolean);
};

export function mockMatchMedia(options: MatchMediaOptions = {}) {
  const { matches = false } = options;
  const getMatches = typeof matches === 'function' ? matches : () => matches;
  const matchMedia = vi.fn((query: string): MediaQueryList => {
    const listeners = new Set<(event: MediaQueryListEvent) => void>();

    return {
      matches: getMatches(query),
      media: query,
      onchange: null,
      addListener: vi.fn((listener: (event: MediaQueryListEvent) => void) => {
        listeners.add(listener);
      }),
      removeListener: vi.fn((listener: (event: MediaQueryListEvent) => void) => {
        listeners.delete(listener);
      }),
      addEventListener: vi.fn((_event: string, listener: EventListenerOrEventListenerObject) => {
        if (typeof listener === 'function') {
          listeners.add(listener as (event: MediaQueryListEvent) => void);
        }
      }),
      removeEventListener: vi.fn((_event: string, listener: EventListenerOrEventListenerObject) => {
        if (typeof listener === 'function') {
          listeners.delete(listener as (event: MediaQueryListEvent) => void);
        }
      }),
      dispatchEvent: vi.fn((event: Event) => {
        listeners.forEach((listener) => listener(event as MediaQueryListEvent));
        return true;
      }),
    };
  });

  return mockBrowserProperty(window, 'matchMedia', matchMedia);
}

type IntersectionObserverMockOptions = {
  observe?: IntersectionObserver['observe'];
  unobserve?: IntersectionObserver['unobserve'];
  disconnect?: IntersectionObserver['disconnect'];
  onCreate?: (callback: IntersectionObserverCallback) => void;
};

export function mockIntersectionObserver(options: IntersectionObserverMockOptions = {}) {
  const MockIntersectionObserver = vi.fn(function (callback: IntersectionObserverCallback) {
    options.onCreate?.(callback);

    return {
      root: null,
      rootMargin: '',
      scrollMargin: '',
      thresholds: [],
      observe: options.observe ?? vi.fn(),
      unobserve: options.unobserve ?? vi.fn(),
      disconnect: options.disconnect ?? vi.fn(),
      takeRecords: vi.fn(() => []),
    } satisfies IntersectionObserver;
  });

  return mockBrowserProperty(
    window,
    'IntersectionObserver',
    MockIntersectionObserver as unknown as typeof IntersectionObserver,
  );
}

export function mockIndexedDB(indexedDB: IDBFactory) {
  return mockBrowserProperty(globalThis, 'indexedDB', indexedDB);
}

export function mockObjectUrl(url = 'blob:test') {
  const createObjectURL = vi.fn(() => url);
  const revokeObjectURL = vi.fn();

  mockBrowserProperty(URL, 'createObjectURL', createObjectURL as typeof URL.createObjectURL);
  mockBrowserProperty(URL, 'revokeObjectURL', revokeObjectURL as typeof URL.revokeObjectURL);

  return { createObjectURL, revokeObjectURL };
}

export function mockWindowLocation(value: Partial<Location>) {
  return mockBrowserProperty(window, 'location', {
    ...window.location,
    ...value,
  } as Location);
}

export function mockWindowOpen() {
  return mockBrowserProperty(
    window,
    'open',
    vi.fn(() => null),
  );
}
