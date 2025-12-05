import { act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRedteamJobStore } from './redteamJobStore';

describe('useRedteamJobStore', () => {
  const initialState = useRedteamJobStore.getState();

  beforeEach(() => {
    vi.clearAllMocks();
    useRedteamJobStore.setState(initialState, true);
  });

  describe('initial state', () => {
    it('should have null jobId and startedAt', () => {
      const state = useRedteamJobStore.getState();
      expect(state.jobId).toBeNull();
      expect(state.startedAt).toBeNull();
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
