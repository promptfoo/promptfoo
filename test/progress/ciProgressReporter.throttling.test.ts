import { CIProgressReporter } from '../../src/progress/ciProgressReporter';
import logger from '../../src/logger';

// Mock the logger
jest.mock('../../src/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
}));

describe('CIProgressReporter - Error Throttling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should throttle rapid error messages', () => {
    const reporter = new CIProgressReporter(100);

    // First error should be logged
    reporter.error('Error 1');
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith('[Evaluation Error] Error 1');

    // Rapid errors should be throttled
    reporter.error('Error 2');
    reporter.error('Error 3');
    reporter.error('Error 4');

    // Still only 1 error logged
    expect(logger.error).toHaveBeenCalledTimes(1);

    // Advance time by 5 seconds (throttle period)
    jest.advanceTimersByTime(5000);

    // Next error should be logged
    reporter.error('Error 5');
    expect(logger.error).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenLastCalledWith('[Evaluation Error] Error 5');
  });

  it('should handle errors during long-running evaluations', () => {
    const reporter = new CIProgressReporter(1000, 30000);
    reporter.start();

    // Simulate long-running evaluation
    jest.advanceTimersByTime(900000); // 15 minutes
    reporter.update(500);

    // First error logged
    reporter.error('Timeout error');
    expect(logger.error).toHaveBeenCalledTimes(1);

    // Rapid subsequent errors throttled
    reporter.error('Another error');
    reporter.error('Yet another error');
    expect(logger.error).toHaveBeenCalledTimes(1);

    // Advance past throttle period
    jest.advanceTimersByTime(5000);
    reporter.error('Final error');
    expect(logger.error).toHaveBeenCalledTimes(2);
  });
});
