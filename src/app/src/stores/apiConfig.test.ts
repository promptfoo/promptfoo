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
  it('prefers the configured API base URL over a stale local default', () => {
    const currentState = createApiConfig('http://localhost:18601');
    const merged = mergeApiConfigPersistedState(
      { apiBaseUrl: 'http://localhost:15500' },
      currentState,
    );

    expect(merged.apiBaseUrl).toBe('http://localhost:18601');
  });

  it('keeps a custom persisted API base URL', () => {
    const currentState = createApiConfig('http://localhost:18601');
    const merged = mergeApiConfigPersistedState(
      { apiBaseUrl: 'https://api.example.com' },
      currentState,
    );

    expect(merged.apiBaseUrl).toBe('https://api.example.com');
  });

  it('keeps the local default when there is no configured API base URL', () => {
    const currentState = createApiConfig('');
    const merged = mergeApiConfigPersistedState(
      { apiBaseUrl: 'http://localhost:15500' },
      currentState,
    );

    expect(merged.apiBaseUrl).toBe('http://localhost:15500');
  });
});
