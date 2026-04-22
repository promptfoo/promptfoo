/**
 * Test utility for creating mock ChildProcess objects
 *
 * This utility standardizes mock ChildProcess creation across tests,
 * ensuring all required properties (killed, kill, etc.) are included
 * and event handlers are properly set up.
 */
import type { ChildProcess } from 'child_process';

import { vi } from 'vitest';

export interface MockChildProcessOptions {
  /** Exit code to return on 'close' event (default: 0) */
  exitCode?: number | null;
  /** Error to emit on 'error' event (if set, close won't fire) */
  error?: Error;
  /** Data to emit on stdout 'data' event */
  stdoutData?: string | Buffer;
  /** Data to emit on stderr 'data' event */
  stderrData?: string | Buffer;
  /** Whether the process is killed (default: false) */
  killed?: boolean;
  /** Custom event handlers for advanced scenarios */
  customEventHandlers?: Record<string, (callback: (...args: any[]) => void) => void>;
}

export interface MockChildProcess {
  stdout: { on: ReturnType<typeof vi.fn> };
  stderr: { on: ReturnType<typeof vi.fn> };
  killed: boolean;
  kill: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
}

/**
 * Creates a mock ChildProcess object with proper event simulation.
 *
 * By default, the mock:
 * - Has `killed: false` and `kill: vi.fn()` for signal handling
 * - Emits 'close' event with exitCode 0
 * - Has empty stdout/stderr handlers
 *
 * @example Basic usage - successful process
 * ```typescript
 * const mock = createMockChildProcess({ exitCode: 0 });
 * (spawn as Mock).mockReturnValue(mock);
 * ```
 *
 * @example Process with output
 * ```typescript
 * const mock = createMockChildProcess({
 *   exitCode: 0,
 *   stdoutData: JSON.stringify({ result: 'success' }),
 * });
 * ```
 *
 * @example Process that errors
 * ```typescript
 * const mock = createMockChildProcess({
 *   error: new Error('spawn failed'),
 * });
 * ```
 *
 * @example Process with non-zero exit
 * ```typescript
 * const mock = createMockChildProcess({
 *   exitCode: 1,
 *   stderrData: 'Error: something went wrong',
 * });
 * ```
 */
export function createMockChildProcess(options: MockChildProcessOptions = {}): MockChildProcess {
  const {
    exitCode = 0,
    error,
    stdoutData,
    stderrData,
    killed = false,
    customEventHandlers,
  } = options;

  const mockProcess: MockChildProcess = {
    stdout: {
      on: vi.fn().mockImplementation((event: string, callback: (data: Buffer) => void) => {
        if (event === 'data' && stdoutData) {
          const data = typeof stdoutData === 'string' ? Buffer.from(stdoutData) : stdoutData;
          // Use setImmediate to simulate async event emission
          setImmediate(() => callback(data));
        }
      }),
    },
    stderr: {
      on: vi.fn().mockImplementation((event: string, callback: (data: Buffer) => void) => {
        if (event === 'data' && stderrData) {
          const data = typeof stderrData === 'string' ? Buffer.from(stderrData) : stderrData;
          setImmediate(() => callback(data));
        }
      }),
    },
    killed,
    kill: vi.fn(),
    on: vi.fn().mockImplementation(function (
      this: MockChildProcess,
      event: string,
      callback: (...args: any[]) => void,
    ) {
      // Check for custom event handlers first
      if (customEventHandlers?.[event]) {
        customEventHandlers[event](callback);
        return mockProcess;
      }

      // Default event handling
      if (event === 'error' && error) {
        // Error event fires immediately
        setImmediate(() => callback(error));
      } else if (event === 'close' && !error) {
        // Close event fires after data events
        setImmediate(() => callback(exitCode));
      }
      return mockProcess;
    }),
  };

  return mockProcess;
}

/**
 * Type assertion helper to cast mock to ChildProcess
 */
export function asMockChildProcess(mock: MockChildProcess): ChildProcess {
  return mock as unknown as ChildProcess;
}
