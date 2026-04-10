import { callApi } from '@app/utils/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMockResponse,
  getCallApiMock,
  mockCallApiResponse,
  mockCallApiResponseOnce,
  mockCallApiRoutes,
  rejectCallApi,
  rejectCallApiOnce,
  resetCallApiMock,
} from './apiMocks';

vi.mock('@app/utils/api', () => ({
  callApi: vi.fn(),
}));

describe('apiMocks', () => {
  beforeEach(() => {
    resetCallApiMock();
  });

  it('fails fast when a callApi request is not mocked', async () => {
    await expect(callApi('/missing')).rejects.toThrow(
      'Unhandled GET callApi request in test: /missing',
    );
  });

  it('creates response-like objects with json and text helpers', async () => {
    const response = createMockResponse({ success: true });
    const nullResponse = createMockResponse(null);
    const undefinedResponse = createMockResponse(undefined);

    await expect(response.json()).resolves.toEqual({ success: true });
    await expect(response.text()).resolves.toBe('{"success":true}');
    await expect(nullResponse.json()).resolves.toBeNull();
    await expect(nullResponse.text()).resolves.toBe('null');
    await expect(undefinedResponse.text()).resolves.toBe('""');
    expect(response.ok).toBe(true);
    expect(response.status).toBe(200);
  });

  it('mocks a shared response for simple callApi tests', async () => {
    mockCallApiResponse({ ok: true });

    await expect(callApi('/anything').then((response) => response.json())).resolves.toEqual({
      ok: true,
    });
  });

  it('queues one-time responses while preserving the fail-fast default', async () => {
    mockCallApiResponseOnce({ step: 1 });
    mockCallApiResponseOnce({ step: 2 });

    await expect(callApi('/first').then((response) => response.json())).resolves.toEqual({
      step: 1,
    });
    await expect(callApi('/second').then((response) => response.json())).resolves.toEqual({
      step: 2,
    });
    await expect(callApi('/third')).rejects.toThrow(
      'Unhandled GET callApi request in test: /third',
    );
  });

  it('queues one-time responses with a fail-fast default when used before reset', async () => {
    const mockCallApi = vi.mocked(callApi);
    mockCallApi.mockReset();
    void callApi('/before-helper');

    mockCallApiResponseOnce({ step: 1 });

    expect(getCallApiMock()).toHaveBeenCalledTimes(1);
    await expect(callApi('/first').then((response) => response.json())).resolves.toEqual({
      step: 1,
    });
    await expect(callApi('/second')).rejects.toThrow(
      'Unhandled GET callApi request in test: /second',
    );
    expect(mockCallApi).toHaveBeenCalledTimes(3);
  });

  it('queues one-time rejections while preserving the fail-fast default', async () => {
    rejectCallApiOnce(new Error('once'));

    await expect(callApi('/error')).rejects.toThrow('once');
    await expect(callApi('/error-again')).rejects.toThrow(
      'Unhandled GET callApi request in test: /error-again',
    );
  });

  it('matches route paths and methods in order', async () => {
    mockCallApiRoutes([
      { path: '/first', response: { step: 1 } },
      { method: 'POST', path: '/second', response: { step: 2 } },
    ]);

    await expect(callApi('/first').then((response) => response.json())).resolves.toEqual({
      step: 1,
    });
    await expect(
      callApi('/second', { method: 'POST' }).then((response) => response.json()),
    ).resolves.toEqual({ step: 2 });
    await expect(callApi('/second')).rejects.toThrow(
      'Unhandled GET callApi request in test: /second',
    );
  });

  it('rejects calls that do not match the next route method', async () => {
    mockCallApiRoutes([{ method: 'POST', path: '/submit', response: { ok: true } }]);

    await expect(callApi('/submit')).rejects.toThrow(
      'Unexpected GET callApi request in test: /submit. Expected next callApi route to match POST /submit.',
    );
  });

  it('rejects out-of-order route calls without consuming the expected route', async () => {
    mockCallApiRoutes([
      { path: '/first', response: { step: 1 } },
      { path: '/second', response: { step: 2 } },
    ]);

    await expect(callApi('/second')).rejects.toThrow(
      'Unexpected GET callApi request in test: /second. Expected next callApi route to match GET /first.',
    );
    await expect(callApi('/first').then((response) => response.json())).resolves.toEqual({
      step: 1,
    });
  });

  it('matches RegExp routes without leaking matcher state', async () => {
    const pathMatcher = /\/items\/\d+$/g;
    mockCallApiRoutes([{ path: pathMatcher, repeat: true, response: { ok: true } }]);

    await expect(callApi('/items/1').then((response) => response.json())).resolves.toEqual({
      ok: true,
    });
    await expect(callApi('/items/2').then((response) => response.json())).resolves.toEqual({
      ok: true,
    });
    expect(pathMatcher.lastIndex).toBe(0);
  });

  it('supports repeated and rejected routes', async () => {
    mockCallApiRoutes([
      { path: '/poll', repeat: true, response: { running: true } },
      { path: '/error', rejectWith: new Error('boom') },
    ]);

    await expect(callApi('/poll').then((response) => response.json())).resolves.toEqual({
      running: true,
    });
    await expect(callApi('/poll').then((response) => response.json())).resolves.toEqual({
      running: true,
    });
    await expect(callApi('/error')).rejects.toThrow('boom');
  });

  it('resets a rejected mock back to fail-fast mode', async () => {
    rejectCallApi(new Error('network'));
    await expect(callApi('/version')).rejects.toThrow('network');

    resetCallApiMock();
    await expect(callApi('/version')).rejects.toThrow(
      'Unhandled GET callApi request in test: /version',
    );
  });
});
