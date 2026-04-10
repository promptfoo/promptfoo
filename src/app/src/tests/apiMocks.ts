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

function matchesRoute(route: MockApiRoute, path: string, options: RequestInit | undefined) {
  if (route.method && route.method.toUpperCase() !== getRequestMethod(options)) {
    return false;
  }

  if (typeof route.path === 'string') {
    return route.path === path;
  }

  if (route.path instanceof RegExp) {
    return route.path.test(path);
  }

  return route.path(path, options);
}

export function createMockResponse(body: unknown, init: MockApiResponseInit = {}) {
  const status = init.status ?? (init.ok === false ? 500 : 200);
  const ok = init.ok ?? (status >= 200 && status < 300);
  const text = init.text ?? (typeof body === 'string' ? body : JSON.stringify(body ?? ''));

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
  const mockCallApi = vi.mocked(callApi);
  mockCallApi.mockReset();
  mockCallApi.mockImplementation(defaultUnhandledCallApi);
  return mockCallApi;
}

export function rejectCallApi(error: unknown) {
  const mockCallApi = resetCallApiMock();
  mockCallApi.mockRejectedValue(error);
  return mockCallApi;
}

export function mockCallApiResponse(body: unknown, init: MockApiResponseInit = {}) {
  const mockCallApi = resetCallApiMock();
  mockCallApi.mockResolvedValue(createMockResponse(body, init));
  return mockCallApi;
}

export function mockCallApiRoutes(routes: MockApiRoute[]) {
  const mockCallApi = resetCallApiMock();
  const remainingRoutes = routes.map((route) => ({ ...route }));

  mockCallApi.mockImplementation(async (path: string, options?: RequestInit) => {
    const routeIndex = remainingRoutes.findIndex((route) => matchesRoute(route, path, options));

    if (routeIndex === -1) {
      return defaultUnhandledCallApi(path, options);
    }

    const route = remainingRoutes[routeIndex];
    if (!route.repeat) {
      remainingRoutes.splice(routeIndex, 1);
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
  return vi.mocked(callApi);
}
