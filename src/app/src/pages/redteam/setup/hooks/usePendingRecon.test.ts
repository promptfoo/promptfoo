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
  callSameOriginApi: vi.fn(),
}));

vi.mock('./useRedTeamConfig', () => ({
  useRedTeamConfig: () => ({
    setFullConfig: mockSetFullConfig,
    setReconContext: mockSetReconContext,
  }),
  DEFAULT_HTTP_TARGET: {
    id: 'http',
    label: 'HTTP/HTTPS Endpoint',
    config: { stateful: true },
  },
}));

import { callSameOriginApi } from '@app/utils/api';

const mockCallSameOriginApi = vi.mocked(callSameOriginApi);

describe('usePendingRecon', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams.delete('source');
    mockSearchParams.delete('token');
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('when source=recon is not present', () => {
    it('should not fetch pending config', () => {
      renderHook(() => usePendingRecon());

      expect(mockCallSameOriginApi).not.toHaveBeenCalled();
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
      mockSearchParams.set('token', 'browser-handoff-token');
    });

    it('should fetch pending recon config', async () => {
      mockCallSameOriginApi.mockResolvedValueOnce({
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

      renderHook(() => usePendingRecon());

      await waitFor(() => {
        expect(mockCallSameOriginApi).toHaveBeenCalledWith(
          '/redteam/recon/pending?token=browser-handoff-token',
        );
      });
    });

    it('should apply config and navigate to target config tab on success', async () => {
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

      mockCallSameOriginApi.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockData),
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

      // Should navigate to target config tab before review/run
      expect(mockNavigate).toHaveBeenCalledWith('/redteam/setup#1', { replace: true });

      // Should call the callback
      expect(onReconApplied).toHaveBeenCalledWith(1);

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
      mockCallSameOriginApi.mockResolvedValueOnce({
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

    it('should reject a manually constructed recon URL without a handoff token', async () => {
      mockSearchParams.delete('token');

      const { result } = renderHook(() => usePendingRecon());

      await waitFor(() => {
        expect(result.current.error).toContain('Missing recon handoff token');
      });

      expect(mockCallSameOriginApi).not.toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith('/redteam/setup', { replace: true });
    });

    it('should handle fetch errors gracefully', async () => {
      mockCallSameOriginApi.mockRejectedValueOnce(new Error('Network error'));

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

      mockCallSameOriginApi.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockData),
      } as Response);

      renderHook(() => usePendingRecon());

      await waitFor(() => {
        expect(mockSetFullConfig).toHaveBeenCalled();
      });

      const [appliedConfig] = mockSetFullConfig.mock.calls[0];
      expect(appliedConfig.target.config.stateful).toBe(true);
    });

    it('should clear the stateful default when recon identifies a stateless app', async () => {
      mockCallSameOriginApi.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            config: { redteam: { purpose: 'Stateless app' } },
            metadata: {
              source: 'recon-cli' as const,
              timestamp: Date.now(),
              reconDetails: {
                stateful: false,
              },
            },
          }),
      } as Response);

      renderHook(() => usePendingRecon());

      await waitFor(() => {
        expect(mockSetFullConfig).toHaveBeenCalled();
      });

      const [appliedConfig] = mockSetFullConfig.mock.calls[0];
      expect(appliedConfig.target.config.stateful).toBe(false);
    });

    it('should default unknown recon statefulness to stateless for browser handoff', async () => {
      mockCallSameOriginApi.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            config: { redteam: { purpose: 'Unknown statefulness app' } },
            metadata: {
              source: 'recon-cli' as const,
              timestamp: Date.now(),
            },
          }),
      } as Response);

      renderHook(() => usePendingRecon());

      await waitFor(() => {
        expect(mockSetFullConfig).toHaveBeenCalled();
      });

      const [appliedConfig] = mockSetFullConfig.mock.calls[0];
      expect(appliedConfig.target.config.stateful).toBe(false);
    });

    it('should only attempt to load once per mount', async () => {
      mockCallSameOriginApi.mockResolvedValue({
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
        expect(mockCallSameOriginApi).toHaveBeenCalledTimes(1);
      });
    });
  });
});
