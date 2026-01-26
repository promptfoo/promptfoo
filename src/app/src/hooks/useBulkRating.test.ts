import { callApi } from '@app/utils/api';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BULK_RATING_CONSTANTS, useBulkRating } from './useBulkRating';

// Mock the API call
vi.mock('@app/utils/api', () => ({
  callApi: vi.fn(),
}));

describe('useBulkRating', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('initializes with correct default values', () => {
      const { result } = renderHook(() => useBulkRating('eval-123'));

      expect(result.current.isLoading).toBe(false);
      expect(result.current.isLoadingPreview).toBe(false);
      expect(result.current.previewCount).toBeNull();
      expect(result.current.previewError).toBeNull();
    });

    it('returns 0 preview count when evalId is null', async () => {
      const { result } = renderHook(() => useBulkRating(null));

      const count = await result.current.fetchPreviewCount('all');
      expect(count).toBe(0);
      expect(callApi).not.toHaveBeenCalled();
    });
  });

  describe('fetchPreviewCount', () => {
    it('fetches preview count successfully', async () => {
      vi.mocked(callApi).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ count: 42 }),
      } as Response);

      const { result } = renderHook(() => useBulkRating('eval-123'));

      let count: number;
      await act(async () => {
        count = await result.current.fetchPreviewCount('all');
      });

      expect(count!).toBe(42);
      expect(result.current.previewCount).toBe(42);
      expect(result.current.previewError).toBeNull();
      expect(callApi).toHaveBeenCalledWith(
        '/eval/eval-123/results/bulk-rating/preview?filterMode=all',
      );
    });

    it('includes filters in query params', async () => {
      vi.mocked(callApi).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ count: 10 }),
      } as Response);

      const { result } = renderHook(() => useBulkRating('eval-123'));

      await act(async () => {
        await result.current.fetchPreviewCount('failures', ['filter1', 'filter2'], 'search');
      });

      expect(callApi).toHaveBeenCalledWith(expect.stringContaining('filterMode=failures'));
      expect(callApi).toHaveBeenCalledWith(
        expect.stringContaining('filters=%5B%22filter1%22%2C%22filter2%22%5D'),
      );
      expect(callApi).toHaveBeenCalledWith(expect.stringContaining('searchQuery=search'));
    });

    it('handles fetch error and sets previewError', async () => {
      vi.mocked(callApi).mockResolvedValueOnce({
        ok: false,
        text: () => Promise.resolve('Server error'),
      } as Response);

      const { result } = renderHook(() => useBulkRating('eval-123'));

      await act(async () => {
        try {
          await result.current.fetchPreviewCount('all');
        } catch {
          // Expected to throw
        }
      });

      expect(result.current.previewCount).toBeNull();
      expect(result.current.previewError).toBe('Server error');
    });

    it('handles network error', async () => {
      vi.mocked(callApi).mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useBulkRating('eval-123'));

      await act(async () => {
        try {
          await result.current.fetchPreviewCount('all');
        } catch {
          // Expected to throw
        }
      });

      expect(result.current.previewError).toBe('Network error');
    });

    it('sets loading state during fetch', async () => {
      let resolvePromise: (value: Response) => void;
      const slowPromise = new Promise<Response>((resolve) => {
        resolvePromise = resolve;
      });
      vi.mocked(callApi).mockReturnValue(slowPromise);

      const { result } = renderHook(() => useBulkRating('eval-123'));

      // Start fetch but don't await
      let fetchPromise: Promise<number>;
      act(() => {
        fetchPromise = result.current.fetchPreviewCount('all');
      });

      // Should be loading
      await waitFor(() => {
        expect(result.current.isLoadingPreview).toBe(true);
      });

      // Resolve the promise
      await act(async () => {
        resolvePromise!({
          ok: true,
          json: () => Promise.resolve({ count: 5 }),
        } as Response);
        await fetchPromise!;
      });

      expect(result.current.isLoadingPreview).toBe(false);
    });
  });

  describe('clearPreviewError', () => {
    it('clears preview error', async () => {
      vi.mocked(callApi).mockRejectedValueOnce(new Error('Error'));

      const { result } = renderHook(() => useBulkRating('eval-123'));

      // Create an error
      await act(async () => {
        try {
          await result.current.fetchPreviewCount('all');
        } catch {
          // Expected
        }
      });

      expect(result.current.previewError).not.toBeNull();

      // Clear the error
      act(() => {
        result.current.clearPreviewError();
      });

      expect(result.current.previewError).toBeNull();
    });
  });

  describe('bulkRate', () => {
    it('returns error when evalId is null', async () => {
      const { result } = renderHook(() => useBulkRating(null));

      const response = await result.current.bulkRate({
        pass: true,
        reason: 'test',
        filterMode: 'all',
      });

      expect(response.success).toBe(false);
      expect(response.error).toBe('No eval ID provided');
      expect(callApi).not.toHaveBeenCalled();
    });

    it('performs bulk rating successfully', async () => {
      vi.mocked(callApi).mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            matched: 100,
            updated: 95,
            skipped: 5,
          }),
      } as Response);

      const { result } = renderHook(() => useBulkRating('eval-123'));

      let response: Awaited<ReturnType<typeof result.current.bulkRate>>;
      await act(async () => {
        response = await result.current.bulkRate({
          pass: true,
          reason: 'test reason',
          filterMode: 'failures',
          confirmBulk: true,
        });
      });

      expect(response!.success).toBe(true);
      expect(response!.updated).toBe(95);
      expect(response!.skipped).toBe(5);
      expect(callApi).toHaveBeenCalledWith('/eval/eval-123/results/bulk-rating', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pass: true,
          reason: 'test reason',
          filterMode: 'failures',
          confirmBulk: true,
        }),
      });
    });

    it('handles API error response', async () => {
      vi.mocked(callApi).mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () =>
          Promise.resolve({
            success: false,
            matched: 50,
            error: 'Validation error',
          }),
      } as Response);

      const { result } = renderHook(() => useBulkRating('eval-123'));

      let response: Awaited<ReturnType<typeof result.current.bulkRate>>;
      await act(async () => {
        response = await result.current.bulkRate({
          pass: false,
          reason: '',
          filterMode: 'all',
        });
      });

      expect(response!.success).toBe(false);
      expect(response!.error).toBe('Validation error');
      expect(response!.matched).toBe(50);
    });

    it('handles network error', async () => {
      vi.mocked(callApi).mockRejectedValueOnce(new Error('Connection failed'));

      const { result } = renderHook(() => useBulkRating('eval-123'));

      let response: Awaited<ReturnType<typeof result.current.bulkRate>>;
      await act(async () => {
        response = await result.current.bulkRate({
          pass: true,
          reason: 'test',
          filterMode: 'all',
        });
      });

      expect(response!.success).toBe(false);
      expect(response!.error).toBe('Connection failed');
    });

    it('sets loading state during bulk rate', async () => {
      let resolvePromise: (value: Response) => void;
      const slowPromise = new Promise<Response>((resolve) => {
        resolvePromise = resolve;
      });
      vi.mocked(callApi).mockReturnValue(slowPromise);

      const { result } = renderHook(() => useBulkRating('eval-123'));

      // Start bulk rate but don't await
      let ratePromise: Promise<unknown>;
      act(() => {
        ratePromise = result.current.bulkRate({
          pass: true,
          reason: 'test',
          filterMode: 'all',
        });
      });

      // Should be loading
      await waitFor(() => {
        expect(result.current.isLoading).toBe(true);
      });

      // Resolve the promise
      await act(async () => {
        resolvePromise!({
          ok: true,
          json: () =>
            Promise.resolve({
              success: true,
              matched: 10,
              updated: 10,
              skipped: 0,
            }),
        } as Response);
        await ratePromise!;
      });

      expect(result.current.isLoading).toBe(false);
    });

    it('handles 409 conflict error for concurrent operations', async () => {
      vi.mocked(callApi).mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: () =>
          Promise.resolve({
            success: false,
            matched: 0,
            error: 'Another bulk operation is in progress',
          }),
      } as Response);

      const { result } = renderHook(() => useBulkRating('eval-123'));

      let response: Awaited<ReturnType<typeof result.current.bulkRate>>;
      await act(async () => {
        response = await result.current.bulkRate({
          pass: true,
          reason: 'test',
          filterMode: 'all',
        });
      });

      expect(response!.success).toBe(false);
      expect(response!.error).toBe('Another bulk operation is in progress');
    });
  });

  describe('BULK_RATING_CONSTANTS', () => {
    it('exports the confirmation threshold', () => {
      expect(BULK_RATING_CONSTANTS.CONFIRMATION_THRESHOLD).toBe(50);
    });

    it('exports the max reason length', () => {
      expect(BULK_RATING_CONSTANTS.MAX_REASON_LENGTH).toBe(10000);
    });
  });
});
