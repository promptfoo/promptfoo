/**
 * Unit tests for EvalLockManager
 *
 * Tests the in-memory mutex functionality used to prevent
 * concurrent bulk operations on the same eval.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// We need to reset module between tests to get fresh singleton
let evalLockManager: typeof import('../../../src/services/bulkGrade/lock').evalLockManager;

describe('EvalLockManager', () => {
  beforeEach(async () => {
    vi.resetModules();
    // Re-import to get fresh singleton
    const lockModule = await import('../../../src/services/bulkGrade/lock');
    evalLockManager = lockModule.evalLockManager;
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('acquire', () => {
    it('should acquire lock for unlocked eval', () => {
      const result = evalLockManager.acquire('eval-123', 'bulk-rating');
      expect(result).toBe(true);
    });

    it('should fail to acquire lock for already locked eval', () => {
      // First acquire succeeds
      const first = evalLockManager.acquire('eval-123', 'bulk-rating');
      expect(first).toBe(true);

      // Second acquire fails
      const second = evalLockManager.acquire('eval-123', 'another-operation');
      expect(second).toBe(false);
    });

    it('should allow locks on different evals', () => {
      const first = evalLockManager.acquire('eval-123', 'bulk-rating');
      const second = evalLockManager.acquire('eval-456', 'bulk-rating');

      expect(first).toBe(true);
      expect(second).toBe(true);
    });

    it('should store operation name with lock', () => {
      evalLockManager.acquire('eval-123', 'test-operation');
      expect(evalLockManager.isLocked('eval-123')).toBe(true);
    });
  });

  describe('release', () => {
    it('should release an acquired lock', () => {
      evalLockManager.acquire('eval-123', 'bulk-rating');
      expect(evalLockManager.isLocked('eval-123')).toBe(true);

      evalLockManager.release('eval-123');
      expect(evalLockManager.isLocked('eval-123')).toBe(false);
    });

    it('should allow re-acquisition after release', () => {
      // Acquire
      evalLockManager.acquire('eval-123', 'first-operation');

      // Release
      evalLockManager.release('eval-123');

      // Re-acquire
      const result = evalLockManager.acquire('eval-123', 'second-operation');
      expect(result).toBe(true);
    });

    it('should not throw when releasing non-existent lock', () => {
      // Should not throw
      expect(() => evalLockManager.release('non-existent')).not.toThrow();
    });
  });

  describe('isLocked', () => {
    it('should return true for locked eval', () => {
      evalLockManager.acquire('eval-123', 'bulk-rating');
      expect(evalLockManager.isLocked('eval-123')).toBe(true);
    });

    it('should return false for unlocked eval', () => {
      expect(evalLockManager.isLocked('eval-123')).toBe(false);
    });

    it('should return false after release', () => {
      evalLockManager.acquire('eval-123', 'bulk-rating');
      evalLockManager.release('eval-123');
      expect(evalLockManager.isLocked('eval-123')).toBe(false);
    });
  });

  describe('getLockCount', () => {
    it('should return 0 when no locks', () => {
      expect(evalLockManager.getLockCount()).toBe(0);
    });

    it('should return correct count after acquiring locks', () => {
      evalLockManager.acquire('eval-1', 'op1');
      evalLockManager.acquire('eval-2', 'op2');
      evalLockManager.acquire('eval-3', 'op3');

      expect(evalLockManager.getLockCount()).toBe(3);
    });

    it('should decrement count after releasing locks', () => {
      evalLockManager.acquire('eval-1', 'op1');
      evalLockManager.acquire('eval-2', 'op2');

      evalLockManager.release('eval-1');

      expect(evalLockManager.getLockCount()).toBe(1);
    });
  });

  describe('concurrent access simulation', () => {
    it('should handle rapid acquire/release cycles', () => {
      for (let i = 0; i < 100; i++) {
        const evalId = `eval-${i % 10}`;
        if (evalLockManager.isLocked(evalId)) {
          evalLockManager.release(evalId);
        }
        const acquired = evalLockManager.acquire(evalId, `op-${i}`);
        expect(acquired).toBe(true);
      }
    });

    it('should maintain lock integrity across multiple evals', () => {
      const evals = ['eval-a', 'eval-b', 'eval-c', 'eval-d', 'eval-e'];

      // Acquire all locks
      for (const evalId of evals) {
        expect(evalLockManager.acquire(evalId, 'test')).toBe(true);
      }

      expect(evalLockManager.getLockCount()).toBe(5);

      // All should be locked
      for (const evalId of evals) {
        expect(evalLockManager.isLocked(evalId)).toBe(true);
      }

      // Release half
      for (let i = 0; i < 3; i++) {
        evalLockManager.release(evals[i]);
      }

      expect(evalLockManager.getLockCount()).toBe(2);

      // Check state
      expect(evalLockManager.isLocked('eval-a')).toBe(false);
      expect(evalLockManager.isLocked('eval-b')).toBe(false);
      expect(evalLockManager.isLocked('eval-c')).toBe(false);
      expect(evalLockManager.isLocked('eval-d')).toBe(true);
      expect(evalLockManager.isLocked('eval-e')).toBe(true);
    });
  });
});
