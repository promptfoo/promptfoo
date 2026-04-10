import { callApi } from '@app/utils/api';
import { type MockedFunction, vi } from 'vitest';

type CallApiMock = MockedFunction<typeof callApi>;

type ApiRouteMatcher =
  | string
  | RegExp
  | ((path: string, options: RequestInit | undefined) => boolean);

type MockApiResponseInit = {
  headers?: HeadersInit;
  ok?: boolean;
  status?: number;
  statusText?: string;
  text?: string;
};

type MockApiRoute = MockApiResponseInit & {
  method?: string;
  path: ApiRouteMatcher;
  repeat?: boolean;
  response?: unknown | ((path: string, options: RequestInit | undefined) => unknown);
  rejectWith?: unknown;
};

const defaultUnhandledCallApi = async (path: string, options?: RequestInit): Promise<Response> => {
  throw new Error(`Unhandled ${getRequestMethod(options)} callApi request in test: ${path}`);
};

function getRequestMethod(options: RequestInit | undefined) {
  return (options?.method ?? 'GET').toUpperCase();
}

function assertCallApiMock(): CallApiMock {
  if (!vi.isMockFunction(callApi)) {
    throw new Error(
      'callApi must be mocked with vi.fn() before using apiMocks helpers. Use vi.mock("@app/utils/api", () => ({ callApi: vi.fn() })) in the test file.',
    );
  }

  return vi.mocked(callApi);
}

function ensureDefaultUnhandledCallApi(mockCallApi: CallApiMock) {
  if (!mockCallApi.getMockImplementation()) {
    mockCallApi.mockImplementation(defaultUnhandledCallApi);
  }

  return mockCallApi;
}

function matchesRoute(route: MockApiRoute, path: string, options: RequestInit | undefined) {
  if ((route.method ?? 'GET').toUpperCase() !== getRequestMethod(options)) {
    return false;
  }

  if (typeof route.path === 'string') {
    return route.path === path;
  }

  if (route.path instanceof RegExp) {
    const safeMatcher = new RegExp(route.path.source, route.path.flags.replace(/[gy]/g, ''));
    return safeMatcher.test(path);
  }

  return route.path(path, options);
}

function describeRoute(route: MockApiRoute) {
  const method = route.method?.toUpperCase() ?? 'GET';

  if (typeof route.path === 'string') {
    return `${method} ${route.path}`;
  }

  if (route.path instanceof RegExp) {
    return `${method} ${route.path.toString()}`;
  }

  return `${method} custom matcher`;
}

export function createMockResponse(body: unknown, init: MockApiResponseInit = {}) {
  const status = init.status ?? (init.ok === false ? 500 : 200);
  const ok = init.ok ?? (status >= 200 && status < 300);
  const text =
    init.text ??
    (typeof body === 'string' ? body : body === null ? 'null' : JSON.stringify(body ?? ''));

  return {
    ok,
    status,
    statusText: init.statusText ?? '',
    headers: new Headers(init.headers),
    json: vi.fn(async () => body),
    text: vi.fn(async () => text),
  } as unknown as Response;
}

export function resetCallApiMock() {
  const mockCallApi = assertCallApiMock();
  mockCallApi.mockReset();
  mockCallApi.mockImplementation(defaultUnhandledCallApi);
  return mockCallApi;
}

export function rejectCallApi(error: unknown) {
  const mockCallApi = resetCallApiMock();
  mockCallApi.mockRejectedValue(error);
  return mockCallApi;
}

export function rejectCallApiOnce(error: unknown) {
  const mockCallApi = getCallApiMock();
  mockCallApi.mockRejectedValueOnce(error);
  return mockCallApi;
}

export function mockCallApiResponse(body: unknown, init: MockApiResponseInit = {}) {
  const mockCallApi = resetCallApiMock();
  mockCallApi.mockResolvedValue(createMockResponse(body, init));
  return mockCallApi;
}

export function mockCallApiResponseOnce(body: unknown, init: MockApiResponseInit = {}) {
  const mockCallApi = getCallApiMock();
  mockCallApi.mockResolvedValueOnce(createMockResponse(body, init));
  return mockCallApi;
}

export function mockCallApiRoutes(routes: MockApiRoute[]) {
  const mockCallApi = resetCallApiMock();
  const remainingRoutes = routes.map((route) => ({ ...route }));

  mockCallApi.mockImplementation(async (path: string, options?: RequestInit) => {
    const expectedRoute = remainingRoutes[0];
    const nextRoute =
      expectedRoute?.repeat && remainingRoutes.length > 1 ? remainingRoutes[1] : undefined;
    const routeIndex =
      expectedRoute && matchesRoute(expectedRoute, path, options)
        ? 0
        : nextRoute && matchesRoute(nextRoute, path, options)
          ? 1
          : -1;

    if (routeIndex === -1) {
      if (!expectedRoute) {
        return defaultUnhandledCallApi(path, options);
      }

      throw new Error(
        `Unexpected ${getRequestMethod(options)} callApi request in test: ${path}. Expected next callApi route to match ${describeRoute(expectedRoute)}.`,
      );
    }

    const route = remainingRoutes[routeIndex];
    if (routeIndex > 0) {
      remainingRoutes.splice(0, routeIndex);
    }

    if (!route.repeat) {
      remainingRoutes.shift();
    }

    if ('rejectWith' in route) {
      throw route.rejectWith;
    }

    const body =
      typeof route.response === 'function' ? route.response(path, options) : route.response;
    return createMockResponse(body, route);
  });

  return mockCallApi;
}

export function getCallApiMock(): CallApiMock {
  return ensureDefaultUnhandledCallApi(assertCallApiMock());
}
