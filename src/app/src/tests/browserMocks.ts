import { vi } from 'vitest';

type RestoreBrowserMock = () => void;
const mockWindowLocationUrlKeys = [
  'hash',
  'host',
  'hostname',
  'href',
  'pathname',
  'port',
  'protocol',
  'search',
] as const;
type MockWindowLocationUrlKey = (typeof mockWindowLocationUrlKeys)[number];
type MockWindowLocationValue = string | URL | Partial<Pick<Location, MockWindowLocationUrlKey>>;

const restoreCallbacks: RestoreBrowserMock[] = [];
const mockWindowLocationUrlKeySet = new Set<MockWindowLocationUrlKey>(mockWindowLocationUrlKeys);

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

function createMockWindowLocationUrl(value: MockWindowLocationValue) {
  if (typeof value === 'string' || value instanceof URL) {
    return new URL(value.toString(), window.location.href);
  }

  const unsupportedKeys = Object.keys(value).filter(
    (key) => !mockWindowLocationUrlKeySet.has(key as MockWindowLocationUrlKey),
  );
  if (unsupportedKeys.length > 0) {
    throw new Error(
      `mockWindowLocation only supports URL fields (${mockWindowLocationUrlKeys.join(', ')}); unsupported fields: ${unsupportedKeys.join(', ')}`,
    );
  }

  if (value.href !== undefined) {
    const mixedOverrideKeys = mockWindowLocationUrlKeys.filter(
      (key) => key !== 'href' && value[key] !== undefined,
    );
    if (mixedOverrideKeys.length > 0) {
      throw new Error(
        `mockWindowLocation does not support mixing href with URL field overrides: ${mixedOverrideKeys.join(', ')}`,
      );
    }

    return new URL(value.href, window.location.href);
  }

  const nextUrl = new URL(window.location.href);
  if (value.protocol !== undefined) {
    nextUrl.protocol = value.protocol;
  }
  if (value.host !== undefined) {
    nextUrl.host = value.host;
  }
  if (value.hostname !== undefined) {
    nextUrl.hostname = value.hostname;
  }
  if (value.port !== undefined) {
    nextUrl.port = value.port;
  }
  if (value.pathname !== undefined) {
    nextUrl.pathname = value.pathname;
  }
  if (value.search !== undefined) {
    nextUrl.search = value.search;
  }
  if (value.hash !== undefined) {
    nextUrl.hash = value.hash;
  }

  return nextUrl;
}

export function mockWindowLocation(value: MockWindowLocationValue) {
  const originalUrl = window.location.href;
  const nextUrl = createMockWindowLocationUrl(value);

  if (nextUrl.origin !== window.location.origin) {
    throw new Error(
      `mockWindowLocation only supports same-origin URLs; received ${nextUrl.href} from ${originalUrl}`,
    );
  }

  window.history.replaceState(window.history.state, '', nextUrl);

  restoreCallbacks.push(() => {
    window.history.replaceState(window.history.state, '', originalUrl);
  });

  return window.location;
}

export function mockWindowOpen() {
  return mockBrowserProperty(
    window,
    'open',
    vi.fn(() => null),
  );
}
