import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePendingRecon } from './usePendingRecon';

// Mock dependencies
const mockNavigate = vi.fn();
const mockSearchParams = new URLSearchParams();
const mockSetFullConfig = vi.fn();
const mockSetReconContext = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useSearchParams: () => [mockSearchParams],
}));

vi.mock('@app/utils/api', () => ({
  callApi: vi.fn(),
}));

vi.mock('./useRedTeamConfig', () => ({
  useRedTeamConfig: () => ({
    setFullConfig: mockSetFullConfig,
    setReconContext: mockSetReconContext,
  }),
  DEFAULT_HTTP_TARGET: {
    id: 'http',
    label: 'HTTP/HTTPS Endpoint',
    config: {},
  },
}));

import { callApi } from '@app/utils/api';

const mockCallApi = vi.mocked(callApi);

describe('usePendingRecon', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams.delete('source');
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('when source=recon is not present', () => {
    it('should not fetch pending config', () => {
      renderHook(() => usePendingRecon());

      expect(mockCallApi).not.toHaveBeenCalled();
    });

    it('should return initial state', () => {
      const { result } = renderHook(() => usePendingRecon());

      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.reconApplied).toBe(false);
      expect(result.current.reconContext).toBeNull();
    });
  });

  describe('when source=recon is present', () => {
    beforeEach(() => {
      mockSearchParams.set('source', 'recon');
    });

    it('should fetch pending recon config', async () => {
      mockCallApi.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            config: {
              description: 'Test config',
              redteam: {
                purpose: 'Test purpose',
                plugins: ['pii:direct'],
                strategies: ['basic'],
              },
            },
            metadata: {
              source: 'recon-cli',
              timestamp: Date.now(),
              codebaseDirectory: '/path/to/project',
              keyFilesAnalyzed: 10,
            },
          }),
      } as Response);

      // Mock the DELETE call
      mockCallApi.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true }),
      } as Response);

      renderHook(() => usePendingRecon());

      await waitFor(() => {
        expect(mockCallApi).toHaveBeenCalledWith('/redteam/recon/pending');
      });
    });

    it('should apply config and navigate to review tab on success', async () => {
      const mockData = {
        config: {
          description: 'Recon config',
          redteam: {
            purpose: 'Healthcare app',
            plugins: ['pii:direct', 'sql-injection'],
            strategies: ['basic', 'jailbreak'],
            entities: ['Acme Corp'],
          },
        },
        metadata: {
          source: 'recon-cli' as const,
          timestamp: 1703692800000,
          codebaseDirectory: '/path/to/project',
          keyFilesAnalyzed: 25,
          applicationDefinition: {
            purpose: 'Healthcare app',
            industry: 'Healthcare',
            hasAccessTo: 'Patient records',
          },
        },
      };

      mockCallApi
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockData),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ success: true }),
        } as Response);

      const onReconApplied = vi.fn();
      const { result } = renderHook(() => usePendingRecon(onReconApplied));

      await waitFor(() => {
        expect(result.current.reconApplied).toBe(true);
      });

      // Should have called setFullConfig with the config
      expect(mockSetFullConfig).toHaveBeenCalled();
      const [appliedConfig] = mockSetFullConfig.mock.calls[0];
      expect(appliedConfig.plugins).toEqual(['pii:direct', 'sql-injection']);
      expect(appliedConfig.purpose).toBe('Healthcare app');

      // Should have deleted the pending file
      expect(mockCallApi).toHaveBeenCalledWith('/redteam/recon/pending', { method: 'DELETE' });

      // Should navigate to review tab
      expect(mockNavigate).toHaveBeenCalledWith('/redteam/setup#5', { replace: true });

      // Should call the callback
      expect(onReconApplied).toHaveBeenCalledWith(5);

      // Should have recon context
      expect(result.current.reconContext).toEqual({
        source: 'recon-cli',
        timestamp: 1703692800000,
        codebaseDirectory: '/path/to/project',
        keyFilesAnalyzed: 25,
        fieldsPopulated: expect.any(Number),
      });
    });

    it('should handle 404 (no pending config)', async () => {
      mockCallApi.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: 'No pending recon configuration' }),
      } as Response);

      const { result } = renderHook(() => usePendingRecon());

      await waitFor(() => {
        expect(result.current.error).toBe(
          'No pending recon configuration found. Run `promptfoo redteam recon` first.',
        );
      });

      expect(mockNavigate).toHaveBeenCalledWith('/redteam/setup', { replace: true });
      expect(mockSetFullConfig).not.toHaveBeenCalled();
    });

    it('should handle fetch errors gracefully', async () => {
      mockCallApi.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => usePendingRecon());

      await waitFor(() => {
        expect(result.current.error).toBe('Network error');
      });

      expect(result.current.isLoading).toBe(false);
      expect(mockNavigate).toHaveBeenCalledWith('/redteam/setup', { replace: true });
    });

    it('should set stateful flag from reconContext', async () => {
      const mockData = {
        config: {
          redteam: {
            purpose: 'Stateful app',
            plugins: ['cross-session-leak'],
          },
        },
        metadata: {
          source: 'recon-cli' as const,
          timestamp: Date.now(),
          reconDetails: {
            stateful: true,
          },
        },
      };

      mockCallApi
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockData),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ success: true }),
        } as Response);

      renderHook(() => usePendingRecon());

      await waitFor(() => {
        expect(mockSetFullConfig).toHaveBeenCalled();
      });

      const [appliedConfig] = mockSetFullConfig.mock.calls[0];
      expect(appliedConfig.target.config.stateful).toBe(true);
    });

    it('should only attempt to load once per mount', async () => {
      mockCallApi.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            config: { redteam: { purpose: 'Test' } },
            metadata: { source: 'recon-cli', timestamp: Date.now() },
          }),
      } as Response);

      const { rerender } = renderHook(() => usePendingRecon());

      // Re-render multiple times
      rerender();
      rerender();
      rerender();

      await waitFor(() => {
        // Should only call API once for the GET request
        expect(mockCallApi).toHaveBeenCalledTimes(2); // GET + DELETE
      });
    });
  });
});
