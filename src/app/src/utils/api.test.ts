import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getApiBaseUrl } from './api';

// Mock the store
vi.mock('@app/stores/apiConfig', () => ({
  default: {
    getState: vi.fn(() => ({ apiBaseUrl: '' })),
  },
}));

import useApiConfig from '@app/stores/apiConfig';

// Helper to create mock state with only apiBaseUrl (other fields unused by getApiBaseUrl)
const mockState = (apiBaseUrl: string) =>
  ({
    apiBaseUrl,
    setApiBaseUrl: vi.fn(),
    fetchingPromise: null,
    setFetchingPromise: vi.fn(),
    persistApiBaseUrl: false,
    enablePersistApiBaseUrl: vi.fn(),
  }) as ReturnType<typeof useApiConfig.getState>;

describe('getApiBaseUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty string when no apiBaseUrl configured', () => {
    vi.mocked(useApiConfig.getState).mockReturnValue(mockState(''));
    // When no apiBaseUrl, returns VITE_PUBLIC_BASENAME (empty string in test build)
    expect(getApiBaseUrl()).toBe('');
  });

  it('returns apiBaseUrl when set', () => {
    vi.mocked(useApiConfig.getState).mockReturnValue(mockState('https://api.example.com'));
    expect(getApiBaseUrl()).toBe('https://api.example.com');
  });

  it('removes trailing slash from apiBaseUrl', () => {
    vi.mocked(useApiConfig.getState).mockReturnValue(mockState('https://api.example.com/'));
    expect(getApiBaseUrl()).toBe('https://api.example.com');
  });

  it('handles apiBaseUrl with path component', () => {
    vi.mocked(useApiConfig.getState).mockReturnValue(mockState('https://example.com/promptfoo'));
    expect(getApiBaseUrl()).toBe('https://example.com/promptfoo');
  });

  it('handles apiBaseUrl with path and trailing slash', () => {
    vi.mocked(useApiConfig.getState).mockReturnValue(mockState('https://example.com/promptfoo/'));
    expect(getApiBaseUrl()).toBe('https://example.com/promptfoo');
  });

  it('handles relative apiBaseUrl', () => {
    vi.mocked(useApiConfig.getState).mockReturnValue(mockState('/custom-api'));
    expect(getApiBaseUrl()).toBe('/custom-api');
  });
});
