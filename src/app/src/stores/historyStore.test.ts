import { act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useHistoryStore } from './historyStore';

describe('useHistoryStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to clean state before each test
    useHistoryStore.setState({
      lastEvalCompletedAt: null,
    });
  });

  describe('initial state', () => {
    it('should have null lastEvalCompletedAt after reset', () => {
      const state = useHistoryStore.getState();
      expect(state.lastEvalCompletedAt).toBeNull();
    });
  });

  describe('signalEvalCompleted', () => {
    it('should set lastEvalCompletedAt to current timestamp', () => {
      const beforeTime = Date.now();

      act(() => {
        useHistoryStore.getState().signalEvalCompleted();
      });

      const state = useHistoryStore.getState();
      expect(state.lastEvalCompletedAt).toBeGreaterThanOrEqual(beforeTime);
      expect(state.lastEvalCompletedAt).toBeLessThanOrEqual(Date.now());
    });

    it('should update lastEvalCompletedAt when called multiple times', async () => {
      act(() => {
        useHistoryStore.getState().signalEvalCompleted();
      });

      const firstTimestamp = useHistoryStore.getState().lastEvalCompletedAt;
      expect(firstTimestamp).not.toBeNull();

      // Wait a small amount of time to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 10));

      act(() => {
        useHistoryStore.getState().signalEvalCompleted();
      });

      const secondTimestamp = useHistoryStore.getState().lastEvalCompletedAt;
      expect(secondTimestamp).not.toBeNull();
      expect(secondTimestamp).toBeGreaterThan(firstTimestamp!);
    });
  });
});
