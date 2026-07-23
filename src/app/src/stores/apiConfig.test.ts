import { describe, expect, it } from 'vitest';
import { type ApiConfig, mergeApiConfigPersistedState } from './apiConfig';

function createApiConfig(apiBaseUrl: string): ApiConfig {
  return {
    apiBaseUrl,
    setApiBaseUrl: () => undefined,
    fetchingPromise: null,
    setFetchingPromise: () => undefined,
    persistApiBaseUrl: false,
    enablePersistApiBaseUrl: () => undefined,
  };
}

describe('mergeApiConfigPersistedState', () => {
  it('drops the exact legacy local default without re-persisting the dev port', () => {
    const currentState = createApiConfig('http://localhost:18601');
    const merged = mergeApiConfigPersistedState(
      { apiBaseUrl: 'http://localhost:15500' },
      currentState,
    );

    // Falls back to the environment default and does NOT re-persist, so the dev-only port
    // never leaks into a later `promptfoo view` session.
    expect(merged.apiBaseUrl).toBe('http://localhost:18601');
    expect(merged.persistApiBaseUrl).toBe(false);
  });

  it('drops the legacy default with a trailing slash', () => {
    const currentState = createApiConfig('http://localhost:18601');
    const merged = mergeApiConfigPersistedState(
      { apiBaseUrl: 'http://localhost:15500/' },
      currentState,
    );

    expect(merged.apiBaseUrl).toBe('http://localhost:18601');
    expect(merged.persistApiBaseUrl).toBe(false);
  });

  it('preserves explicit loopback aliases on the legacy port as user choices', () => {
    for (const alias of ['http://127.0.0.1:15500', 'http://[::1]:15500']) {
      const merged = mergeApiConfigPersistedState(
        { apiBaseUrl: alias },
        createApiConfig('http://localhost:18601'),
      );

      expect(merged.apiBaseUrl).toBe(alias);
      expect(merged.persistApiBaseUrl).toBe(true);
    }
  });

  it('treats a blank persisted API base URL as unset', () => {
    const currentState = createApiConfig('http://localhost:18601');
    const merged = mergeApiConfigPersistedState({ apiBaseUrl: '' }, currentState);

    // A blank persisted value must not override the environment default or force persistence.
    expect(merged.apiBaseUrl).toBe('http://localhost:18601');
    expect(merged.persistApiBaseUrl).toBe(false);
  });

  it('keeps a custom persisted API base URL', () => {
    const currentState = createApiConfig('http://localhost:18601');
    const merged = mergeApiConfigPersistedState(
      { apiBaseUrl: 'https://api.example.com' },
      currentState,
    );

    expect(merged.apiBaseUrl).toBe('https://api.example.com');
    expect(merged.persistApiBaseUrl).toBe(true);
  });

  it('drops the legacy default to same-origin when there is no environment default', () => {
    const currentState = createApiConfig('');
    const merged = mergeApiConfigPersistedState(
      { apiBaseUrl: 'http://localhost:15500' },
      currentState,
    );

    // Under `promptfoo view` (no dev default), fall back to same-origin rather than a stale
    // localhost:15500 that may not be where the server is actually listening.
    expect(merged.apiBaseUrl).toBe('');
    expect(merged.persistApiBaseUrl).toBe(false);
  });

  it('ignores malformed persisted state', () => {
    const currentState = createApiConfig('http://localhost:18601');
    const merged = mergeApiConfigPersistedState('not-json-state', currentState);

    expect(merged.apiBaseUrl).toBe('http://localhost:18601');
    expect(merged.persistApiBaseUrl).toBe(false);
  });

  it('does not let persisted state overwrite store actions', () => {
    const currentState = createApiConfig('http://localhost:18601');
    const merged = mergeApiConfigPersistedState(
      {
        apiBaseUrl: 'https://api.example.com',
        setApiBaseUrl: 'not-a-function',
      },
      currentState,
    );

    expect(merged.apiBaseUrl).toBe('https://api.example.com');
    expect(merged.setApiBaseUrl).toBe(currentState.setApiBaseUrl);
  });
});
