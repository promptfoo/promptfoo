import { act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRedteamJobStore } from './redteamJobStore';

describe('useRedteamJobStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to clean state before each test
    useRedteamJobStore.setState({
      jobId: null,
      startedAt: null,
      _hasHydrated: false,
    });
  });

  describe('initial state', () => {
    it('should have null jobId and startedAt after reset', () => {
      const state = useRedteamJobStore.getState();
      expect(state.jobId).toBeNull();
      expect(state.startedAt).toBeNull();
      // Note: _hasHydrated is set by onRehydrateStorage callback
      // In tests it may be true immediately since there's no localStorage delay
    });
  });

  describe('setJob', () => {
    it('should set jobId and startedAt when called', () => {
      const testJobId = 'test-job-123';
      const beforeTime = Date.now();

      act(() => {
        useRedteamJobStore.getState().setJob(testJobId);
      });

      const state = useRedteamJobStore.getState();
      expect(state.jobId).toBe(testJobId);
      expect(state.startedAt).toBeGreaterThanOrEqual(beforeTime);
      expect(state.startedAt).toBeLessThanOrEqual(Date.now());
    });

    it('should overwrite previous job when called again', () => {
      act(() => {
        useRedteamJobStore.getState().setJob('job-1');
      });

      expect(useRedteamJobStore.getState().jobId).toBe('job-1');

      act(() => {
        useRedteamJobStore.getState().setJob('job-2');
      });

      expect(useRedteamJobStore.getState().jobId).toBe('job-2');
    });

    it('should update startedAt when overwriting a job', async () => {
      act(() => {
        useRedteamJobStore.getState().setJob('job-1');
      });

      const firstStartedAt = useRedteamJobStore.getState().startedAt;
      expect(firstStartedAt).not.toBeNull();

      // Wait a small amount of time to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 10));

      act(() => {
        useRedteamJobStore.getState().setJob('job-2');
      });

      const secondStartedAt = useRedteamJobStore.getState().startedAt;
      expect(secondStartedAt).not.toBeNull();
      expect(secondStartedAt).toBeGreaterThan(firstStartedAt!);
    });
  });

  describe('setHasHydrated', () => {
    it('should update _hasHydrated state', () => {
      // First set to false explicitly
      act(() => {
        useRedteamJobStore.getState().setHasHydrated(false);
      });
      expect(useRedteamJobStore.getState()._hasHydrated).toBe(false);

      // Then set to true
      act(() => {
        useRedteamJobStore.getState().setHasHydrated(true);
      });
      expect(useRedteamJobStore.getState()._hasHydrated).toBe(true);
    });
  });

  describe('clearJob', () => {
    it('should clear jobId and startedAt', () => {
      // Set a job first
      act(() => {
        useRedteamJobStore.getState().setJob('test-job-456');
      });

      expect(useRedteamJobStore.getState().jobId).toBe('test-job-456');
      expect(useRedteamJobStore.getState().startedAt).not.toBeNull();

      // Clear it
      act(() => {
        useRedteamJobStore.getState().clearJob();
      });

      const state = useRedteamJobStore.getState();
      expect(state.jobId).toBeNull();
      expect(state.startedAt).toBeNull();
    });

    it('should be safe to call when no job is set', () => {
      expect(useRedteamJobStore.getState().jobId).toBeNull();

      act(() => {
        useRedteamJobStore.getState().clearJob();
      });

      expect(useRedteamJobStore.getState().jobId).toBeNull();
      expect(useRedteamJobStore.getState().startedAt).toBeNull();
    });
  });
});
