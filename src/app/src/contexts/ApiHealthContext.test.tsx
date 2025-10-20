import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiHealthProvider, useApiHealth } from './ApiHealthContext';
import type { ReactNode } from 'react';

// Mock dependencies
vi.mock('@app/utils/api', () => ({
  callApi: vi.fn(),
}));

vi.mock('@app/hooks/usePolling', () => ({
  default: vi.fn(),
}));

import { callApi } from '@app/utils/api';
import usePolling from '@app/hooks/usePolling';

describe('ApiHealthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('useApiHealth hook', () => {
    it('should return default context values when used outside of ApiHealthProvider', () => {
      const { result } = renderHook(() => useApiHealth());

      expect(result.current).toMatchObject({
        status: 'unknown',
        message: '',
        isChecking: false,
        checkHealth: expect.any(Function),
      });
    });

    it('should return context values when used within ApiHealthProvider', () => {
      const wrapper = ({ children }: { children: ReactNode }) => (
        <ApiHealthProvider>{children}</ApiHealthProvider>
      );

      const { result } = renderHook(() => useApiHealth(), { wrapper });

      expect(result.current).toMatchObject({
        status: 'unknown',
        message: '',
        isChecking: false,
        checkHealth: expect.any(Function),
      });
    });
  });

  describe('ApiHealthProvider', () => {
    it('should initialize with default state', () => {
      const wrapper = ({ children }: { children: ReactNode }) => (
        <ApiHealthProvider>{children}</ApiHealthProvider>
      );

      const { result } = renderHook(() => useApiHealth(), { wrapper });

      expect(result.current.status).toBe('unknown');
      expect(result.current.message).toBe('');
      expect(result.current.isChecking).toBe(false);
    });

    it('should set up polling on mount', () => {
      const wrapper = ({ children }: { children: ReactNode }) => (
        <ApiHealthProvider>{children}</ApiHealthProvider>
      );

      renderHook(() => useApiHealth(), { wrapper });

      expect(usePolling).toHaveBeenCalledWith(expect.any(Function), 3000, []);
    });

    describe('checkHealth', () => {
      it('should update status to "connected" when API returns OK', async () => {
        const mockResponse = {
          json: vi.fn().mockResolvedValue({
            status: 'OK',
            message: 'API is healthy',
          }),
        };
        vi.mocked(callApi).mockResolvedValue(mockResponse as any);

        const wrapper = ({ children }: { children: ReactNode }) => (
          <ApiHealthProvider>{children}</ApiHealthProvider>
        );

        const { result } = renderHook(() => useApiHealth(), { wrapper });

        await result.current.checkHealth();

        await waitFor(() => {
          expect(result.current.status).toBe('connected');
          expect(result.current.message).toBe('API is healthy');
          expect(result.current.isChecking).toBe(false);
        });
      });

      it('should update status to "disabled" when API returns DISABLED', async () => {
        const mockResponse = {
          json: vi.fn().mockResolvedValue({
            status: 'DISABLED',
            message: 'Remote generation is disabled',
          }),
        };
        vi.mocked(callApi).mockResolvedValue(mockResponse as any);

        const wrapper = ({ children }: { children: ReactNode }) => (
          <ApiHealthProvider>{children}</ApiHealthProvider>
        );

        const { result } = renderHook(() => useApiHealth(), { wrapper });

        await result.current.checkHealth();

        await waitFor(() => {
          expect(result.current.status).toBe('disabled');
          expect(result.current.message).toBe('Remote generation is disabled');
          expect(result.current.isChecking).toBe(false);
        });
      });

      it('should update status to "blocked" when API returns non-OK status', async () => {
        const mockResponse = {
          json: vi.fn().mockResolvedValue({
            status: 'ERROR',
            message: 'API error occurred',
          }),
        };
        vi.mocked(callApi).mockResolvedValue(mockResponse as any);

        const wrapper = ({ children }: { children: ReactNode }) => (
          <ApiHealthProvider>{children}</ApiHealthProvider>
        );

        const { result } = renderHook(() => useApiHealth(), { wrapper });

        await result.current.checkHealth();

        await waitFor(() => {
          expect(result.current.status).toBe('blocked');
          expect(result.current.message).toBe('API error occurred');
          expect(result.current.isChecking).toBe(false);
        });
      });

      it('should handle network errors', async () => {
        vi.mocked(callApi).mockRejectedValue(new Error('Network error'));

        const wrapper = ({ children }: { children: ReactNode }) => (
          <ApiHealthProvider>{children}</ApiHealthProvider>
        );

        const { result } = renderHook(() => useApiHealth(), { wrapper });

        await result.current.checkHealth();

        await waitFor(() => {
          expect(result.current.status).toBe('blocked');
          expect(result.current.message).toBe('Network error: Unable to check API health');
          expect(result.current.isChecking).toBe(false);
        });
      });

      it('should not update state when request is aborted', async () => {
        const abortError = new Error('AbortError');
        abortError.name = 'AbortError';
        vi.mocked(callApi).mockRejectedValue(abortError);

        const wrapper = ({ children }: { children: ReactNode }) => (
          <ApiHealthProvider>{children}</ApiHealthProvider>
        );

        const { result } = renderHook(() => useApiHealth(), { wrapper });

        const initialStatus = result.current.status;
        const initialMessage = result.current.message;

        await result.current.checkHealth();

        // Wait a bit to ensure state doesn't update
        await new Promise((resolve) => setTimeout(resolve, 100));

        expect(result.current.status).toBe(initialStatus);
        expect(result.current.message).toBe(initialMessage);
      });

      it('should set isChecking to true during health check', async () => {
        let resolveResponse: any;
        const pendingPromise = new Promise((resolve) => {
          resolveResponse = resolve;
        });

        const mockResponse = {
          json: vi.fn().mockResolvedValue({
            status: 'OK',
            message: 'API is healthy',
          }),
        };

        vi.mocked(callApi).mockReturnValue(
          pendingPromise.then(() => mockResponse) as any,
        );

        const wrapper = ({ children }: { children: ReactNode }) => (
          <ApiHealthProvider>{children}</ApiHealthProvider>
        );

        const { result } = renderHook(() => useApiHealth(), { wrapper });

        const checkPromise = result.current.checkHealth();

        // Should be checking immediately
        await waitFor(() => {
          expect(result.current.isChecking).toBe(true);
        });

        // Resolve the promise
        resolveResponse();
        await checkPromise;

        // Should no longer be checking
        await waitFor(() => {
          expect(result.current.isChecking).toBe(false);
        });
      });

      it('should call API with correct parameters', async () => {
        const mockResponse = {
          json: vi.fn().mockResolvedValue({
            status: 'OK',
            message: 'API is healthy',
          }),
        };
        vi.mocked(callApi).mockResolvedValue(mockResponse as any);

        const wrapper = ({ children }: { children: ReactNode }) => (
          <ApiHealthProvider>{children}</ApiHealthProvider>
        );

        const { result } = renderHook(() => useApiHealth(), { wrapper });

        await result.current.checkHealth();

        expect(callApi).toHaveBeenCalledWith('/remote-health', {
          cache: 'no-store',
          signal: expect.any(AbortSignal),
        });
      });

      it('should abort previous request when checkHealth is called multiple times', async () => {
        const mockResponse = {
          json: vi.fn().mockResolvedValue({
            status: 'OK',
            message: 'API is healthy',
          }),
        };

        let firstCallAborted = false;
        let secondCallAborted = false;

        vi.mocked(callApi).mockImplementation((url, options) => {
          const signal = options?.signal as AbortSignal;
          if (signal) {
            const abortHandler = () => {
              if (firstCallAborted === false) {
                firstCallAborted = true;
              } else {
                secondCallAborted = true;
              }
            };
            signal.addEventListener('abort', abortHandler);
          }
          return Promise.resolve(mockResponse as any);
        });

        const wrapper = ({ children }: { children: ReactNode }) => (
          <ApiHealthProvider>{children}</ApiHealthProvider>
        );

        const { result } = renderHook(() => useApiHealth(), { wrapper });

        // First call
        const promise1 = result.current.checkHealth();

        // Second call should abort the first
        const promise2 = result.current.checkHealth();

        await Promise.all([promise1, promise2]);

        expect(firstCallAborted).toBe(true);
        expect(callApi).toHaveBeenCalledTimes(2);
      });
    });
  });
});

