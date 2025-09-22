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

describe('CIProgressReporter', () => {
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

  it('should log start message', () => {
    const reporter = new CIProgressReporter(100);
    reporter.start();

    expect(logger.info).toHaveBeenCalledWith('[Evaluation] Starting 100 test cases...');
  });

  it('should log milestone updates at 25%, 50%, 75%', () => {
    const reporter = new CIProgressReporter(100);
    reporter.start();
    jest.clearAllMocks();

    // Update to 25%
    reporter.update(25);
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('[Evaluation] ✓ 25% complete (25/100)'),
    );

    // Update to 50%
    reporter.update(50);
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('[Evaluation] ✓ 50% complete (50/100)'),
    );

    // Update to 75%
    reporter.update(75);
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('[Evaluation] ✓ 75% complete (75/100)'),
    );
  });

  it('should log periodic updates at intervals', () => {
    const reporter = new CIProgressReporter(100, 1000); // 1 second interval
    reporter.start();
    reporter.update(30);
    jest.clearAllMocks();

    // Advance time by 1 second
    jest.advanceTimersByTime(1000);

    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('[CI Progress] Evaluation running for'),
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Completed 30/100 tests (30%)'),
    );
  });

  it('should log finish message', () => {
    const reporter = new CIProgressReporter(100);
    reporter.start();
    reporter.update(100);
    jest.clearAllMocks();

    reporter.finish();

    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('[Evaluation] ✓ Complete! 100/100 tests in'),
    );
  });

  it('should emit GitHub Actions annotations when GITHUB_ACTIONS is set', () => {
    process.env.GITHUB_ACTIONS = 'true';
    const reporter = new CIProgressReporter(100);

    reporter.update(25);
    expect(consoleLogMock).toHaveBeenCalledWith('::notice::Evaluation 25% complete');

    reporter.finish();
    expect(consoleLogMock).toHaveBeenCalledWith(
      expect.stringContaining('::notice::Evaluation completed: 25/100 tests in'),
    );
  });

  it('should handle errors', () => {
    const reporter = new CIProgressReporter(100);
    reporter.error('Test error message');

    expect(logger.error).toHaveBeenCalledWith('[Evaluation Error] Test error message');
  });

  it('should emit GitHub Actions error annotation', () => {
    process.env.GITHUB_ACTIONS = 'true';
    const reporter = new CIProgressReporter(100);

    reporter.error('Test error');
    expect(consoleLogMock).toHaveBeenCalledWith('::error::Test error');
  });

  it('should clear interval on finish', () => {
    const reporter = new CIProgressReporter(100, 1000);
    reporter.start();

    // Verify interval is set
    expect(jest.getTimerCount()).toBe(1);

    reporter.finish();

    // Verify interval is cleared
    expect(jest.getTimerCount()).toBe(0);
  });

  it('should format elapsed time correctly', () => {
    const reporter = new CIProgressReporter(100);
    reporter.start();

    // Advance time by 65 seconds
    jest.advanceTimersByTime(65000);

    reporter.finish();

    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('1m 5s'));
  });
});
