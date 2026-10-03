import { act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRedteamJobStore } from './redteamJobStore';

describe('useRedteamJobStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to clean state before each test
    useRedteamJobStore.setState({
      jobId: null,
      _hasHydrated: false,
    });
  });

  describe('initial state', () => {
    it('should have null jobId after reset', () => {
      const state = useRedteamJobStore.getState();
      expect(state.jobId).toBeNull();
      // Note: _hasHydrated is set by onRehydrateStorage callback
      // In tests it may be true immediately since there's no localStorage delay
    });
  });

  describe('setJob', () => {
    it('should set jobId when called', () => {
      const testJobId = 'test-job-123';

      act(() => {
        useRedteamJobStore.getState().setJob(testJobId);
      });

      const state = useRedteamJobStore.getState();
      expect(state.jobId).toBe(testJobId);
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
  });

  it('recovers a persisted older-client job and saves later job changes', async () => {
    localStorage.setItem(
      'promptfoo-redteam-job',
      JSON.stringify({ state: { jobId: 'saved-job', startedAt: 123 }, version: 0 }),
    );

    await useRedteamJobStore.persist.rehydrate();
    expect(useRedteamJobStore.getState()).toMatchObject({
      jobId: 'saved-job',
      _hasHydrated: true,
    });

    act(() => useRedteamJobStore.getState().setJob('replacement-job'));
    expect(JSON.parse(localStorage.getItem('promptfoo-redteam-job')!).state.jobId).toBe(
      'replacement-job',
    );

    act(() => useRedteamJobStore.getState().clearJob());
    expect(JSON.parse(localStorage.getItem('promptfoo-redteam-job')!).state.jobId).toBeNull();
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
    it('should clear jobId', () => {
      // Set a job first
      act(() => {
        useRedteamJobStore.getState().setJob('test-job-456');
      });

      expect(useRedteamJobStore.getState().jobId).toBe('test-job-456');

      // Clear it
      act(() => {
        useRedteamJobStore.getState().clearJob();
      });

      const state = useRedteamJobStore.getState();
      expect(state.jobId).toBeNull();
    });

    it('should be safe to call when no job is set', () => {
      expect(useRedteamJobStore.getState().jobId).toBeNull();

      act(() => {
        useRedteamJobStore.getState().clearJob();
      });

      expect(useRedteamJobStore.getState().jobId).toBeNull();
    });
  });
});
