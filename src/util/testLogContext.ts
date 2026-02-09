import { AsyncLocalStorage } from 'async_hooks';

/**
 * Represents a single log entry captured during test execution
 */
export interface TestLogEntry {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  timestamp: number;
}

/**
 * Context stored in AsyncLocalStorage for each test execution
 */
export interface TestLogContext {
  testIdx: number;
  promptIdx: number;
  logs: TestLogEntry[];
  maxEntries: number;
}

// Default maximum log entries per test
const DEFAULT_MAX_ENTRIES = 50;

// The AsyncLocalStorage instance for test context
const testLogStorage = new AsyncLocalStorage<TestLogContext>();

/**
 * Run a function within a test log context.
 * All log entries captured during execution will be associated with this test.
 *
 * @param testIdx - The test case index
 * @param promptIdx - The prompt index
 * @param fn - The async function to execute within the context
 * @returns The result of the function
 */
export function runWithTestLogContext<T>(
  testIdx: number,
  promptIdx: number,
  fn: () => T | Promise<T>,
): T | Promise<T> {
  const context: TestLogContext = {
    testIdx,
    promptIdx,
    logs: [],
    maxEntries: DEFAULT_MAX_ENTRIES,
  };

  return testLogStorage.run(context, fn);
}

/**
 * Add a log entry to the current test context (if one exists).
 * This is called by the logger to capture logs during test execution.
 *
 * @param level - The log level
 * @param message - The log message
 * @returns true if the log was captured, false if no context or limit reached
 */
export function addLogToTestContext(
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
): boolean {
  const context = testLogStorage.getStore();
  if (!context) {
    return false; // No active test context
  }

  // Check entry limit
  if (context.logs.length >= context.maxEntries) {
    return false; // Max entries reached
  }

  context.logs.push({
    level,
    message,
    timestamp: Date.now(),
  });

  return true;
}

/**
 * Get all logs from the current test context.
 * Returns an empty array if no context is active.
 */
export function getTestLogs(): TestLogEntry[] {
  const context = testLogStorage.getStore();
  return context?.logs ?? [];
}

/**
 * Check if there's an active test log context.
 */
export function hasTestLogContext(): boolean {
  return testLogStorage.getStore() !== undefined;
}
