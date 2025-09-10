import { CIProgressReporter } from '../../src/progress/ciProgressReporter';
import logger from '../../src/logger';

// Mock the logger
jest.mock('../../src/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
}));

// Mock console.log for GitHub Actions annotations
const originalConsoleLog = console.log;
const consoleLogMock = jest.fn();

describe('CIProgressReporter - Edge Cases', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    console.log = consoleLogMock;
  });

  afterEach(() => {
    jest.useRealTimers();
    console.log = originalConsoleLog;
    delete process.env.GITHUB_ACTIONS;
  });

  describe('Zero and Single Test Cases', () => {
    it('should handle zero tests gracefully', () => {
      const reporter = new CIProgressReporter(0);
      reporter.start();

      expect(logger.info).toHaveBeenCalledWith('[Evaluation] Starting 1 test cases...');

      // Should not crash on update
      reporter.update(0);
      reporter.finish();

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('[Evaluation] ✓ Complete! 0/1 tests in'),
      );
    });

    it('should handle single test', () => {
      const reporter = new CIProgressReporter(1);
      reporter.start();
      jest.clearAllMocks();

      reporter.update(1);

      // Should log 100% milestone
      expect(logger.info).toHaveBeenCalledTimes(0); // 100% is not in milestones array

      reporter.finish();
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('[Evaluation] ✓ Complete! 1/1 tests in'),
      );
    });
  });

  describe('Out of Order and Invalid Updates', () => {
    it('should handle updates out of order', () => {
      const reporter = new CIProgressReporter(100);
      reporter.start();
      jest.clearAllMocks();

      // Update to 50% first
      reporter.update(50);
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('[Evaluation] ✓ 50% complete'),
      );

      jest.clearAllMocks();

      // Then update to 25% - should not log again
      reporter.update(25);
      expect(logger.info).not.toHaveBeenCalledWith(
        expect.stringContaining('[Evaluation] ✓ 25% complete'),
      );
    });

    it('should handle updates beyond total tests', () => {
      const reporter = new CIProgressReporter(100);
      reporter.start();

      // Update beyond 100%
      reporter.update(150);

      // Should handle gracefully
      reporter.finish();
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('[Evaluation] ✓ Complete! 150/100 tests in'),
      );
    });

    it('should handle negative updates', () => {
      const reporter = new CIProgressReporter(100);
      reporter.start();

      // Negative update
      reporter.update(-10);

      // Advance time for periodic update
      jest.advanceTimersByTime(30000);

      // Should not crash - periodic update should handle negative completed count
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('[CI Progress] Evaluation running for'),
      );
    });

    it('should handle multiple updates to same percentage', () => {
      const reporter = new CIProgressReporter(100);
      reporter.start();
      jest.clearAllMocks();

      // Multiple updates that result in 25%
      reporter.update(25);
      expect(logger.info).toHaveBeenCalledTimes(1);

      jest.clearAllMocks();
      reporter.update(25);
      reporter.update(25);

      // Should not log milestone again
      expect(logger.info).not.toHaveBeenCalled();
    });
  });

  describe('Timing Edge Cases', () => {
    it('should handle very fast completion (< 1 second)', () => {
      const reporter = new CIProgressReporter(100, 100); // 100ms interval
      reporter.start();

      // Fast progress but not complete
      jest.advanceTimersByTime(50); // 50ms
      reporter.update(30);

      // Trigger periodic update
      jest.advanceTimersByTime(100);

      // Should handle very small elapsed time gracefully
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('[CI Progress] Evaluation running for'),
      );
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('[CI Progress] Rate:'));
    });

    it('should handle very long running tests (> 24 hours)', () => {
      const reporter = new CIProgressReporter(100000, 1000);
      reporter.start();

      // Very slow progress: 1 test per minute
      jest.advanceTimersByTime(60000); // 1 minute
      reporter.update(1);
      jest.clearAllMocks();

      // Trigger periodic update
      jest.advanceTimersByTime(1000);

      // 99,999 tests remaining at 1 test/minute = 99,999 minutes > 24 hours
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('ETA: >24 hours'));
    });

    it('should handle zero progress after long time', () => {
      const reporter = new CIProgressReporter(100, 1000);
      reporter.start();

      // Don't update progress
      jest.advanceTimersByTime(5000);

      // Should not log periodic update with 0 completed tests
      expect(logger.info).toHaveBeenCalledTimes(1); // Only start message
    });
  });

  describe('Robustness Tests', () => {
    it('should handle multiple start calls without leaking intervals', () => {
      const reporter = new CIProgressReporter(100);
      reporter.start();
      reporter.start();
      reporter.start();

      // Should only have one interval (previous ones cleared)
      expect(jest.getTimerCount()).toBe(1);

      reporter.finish();

      // Should clear the interval
      expect(jest.getTimerCount()).toBe(0);
    });

    it('should handle finish without start', () => {
      const reporter = new CIProgressReporter(100);

      // Should not crash
      expect(() => reporter.finish()).not.toThrow();

      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('[Evaluation] ✓ Complete!'));
    });

    it('should handle update after finish', () => {
      const reporter = new CIProgressReporter(100);
      reporter.start();
      reporter.finish();

      jest.clearAllMocks();

      // Update after finish
      reporter.update(50);

      // Should still log milestone
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('[Evaluation] ✓ 50% complete'),
      );
    });

    it('should handle periodic update after finish', () => {
      const reporter = new CIProgressReporter(100, 1000);
      reporter.start();
      reporter.update(50);
      reporter.finish();

      jest.clearAllMocks();

      // Advance time - interval should be cleared
      jest.advanceTimersByTime(2000);

      // Should not log periodic update
      expect(logger.info).not.toHaveBeenCalled();
    });
  });

  describe('Rate Calculation Edge Cases', () => {
    it('should handle very slow rate (< 0.1 tests/minute)', () => {
      const reporter = new CIProgressReporter(1000, 1000);
      reporter.start();

      // Very slow progress: 1 test in 20 minutes = 0.05 tests/minute
      jest.advanceTimersByTime(1200000); // 20 minutes
      reporter.update(1);

      jest.clearAllMocks();
      jest.advanceTimersByTime(1000);

      // Should show "calculating..." for very slow rates (< 0.1 tests/minute)
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('ETA: calculating...'));
    });

    it('should handle non-integer test counts', () => {
      const reporter = new CIProgressReporter(99);
      reporter.start();

      // 25% of 99 = 24.75
      reporter.update(24);
      expect(logger.info).not.toHaveBeenCalledWith(
        expect.stringContaining('[Evaluation] ✓ 25% complete'),
      );

      reporter.update(25);
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('[Evaluation] ✓ 25% complete'),
      );
    });
  });

  describe('GitHub Actions Special Characters', () => {
    it('should escape newlines and :: in error messages', () => {
      process.env.GITHUB_ACTIONS = 'true';
      const reporter = new CIProgressReporter(100);

      reporter.error('Error with\nnewline and :: annotation');

      expect(consoleLogMock).toHaveBeenCalledWith('::error::Error with newline and   annotation');
    });

    it('should handle very long error messages', () => {
      process.env.GITHUB_ACTIONS = 'true';
      const reporter = new CIProgressReporter(100);

      const longError = 'A'.repeat(1000);
      reporter.error(longError);

      expect(consoleLogMock).toHaveBeenCalledWith(expect.stringContaining('::error::'));
    });
  });

  describe('Memory and Performance', () => {
    it('should not accumulate memory with many updates', () => {
      const reporter = new CIProgressReporter(10000);
      reporter.start();

      // Simulate many updates
      for (let i = 0; i <= 10000; i++) {
        reporter.update(i);
      }

      // Should only have logged 3 milestones
      const milestoneLogs = (logger.info as jest.Mock).mock.calls.filter((call) =>
        call[0].includes('[Evaluation] ✓'),
      );
      expect(milestoneLogs.length).toBe(3); // 25%, 50%, 75%
    });

    it('should handle rapid periodic updates', () => {
      const reporter = new CIProgressReporter(100, 100); // 100ms interval
      reporter.start();
      reporter.update(50);

      jest.clearAllMocks();

      // Trigger multiple intervals rapidly
      for (let i = 0; i < 10; i++) {
        jest.advanceTimersByTime(100);
      }

      // Should log 10 periodic updates
      expect(logger.info).toHaveBeenCalledTimes(20); // 10 * 2 (progress + rate)
    });
  });
});
