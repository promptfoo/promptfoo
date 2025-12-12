/**
 * Custom Winston transport for capturing logs in the Ink UI.
 *
 * This transport intercepts log messages and routes them to the Ink UI
 * for display in the LogPanel component.
 */

import Transport from 'winston-transport';

export interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  timestamp: number;
}

export type LogCallback = (entry: LogEntry) => void;

/**
 * Winston transport that captures logs for the Ink UI.
 */
export class InkUITransport extends Transport {
  private callback: LogCallback;
  private minLevel: number;

  // Winston log levels (lower number = higher priority)
  private static readonly LEVELS: Record<string, number> = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
  };

  constructor(options: { callback: LogCallback; level?: string }) {
    super(options);
    this.callback = options.callback;
    this.minLevel = InkUITransport.LEVELS[options.level || 'info'] ?? 2;
  }

  /**
   * Update the minimum log level for filtering.
   */
  setLevel(level: string): void {
    this.minLevel = InkUITransport.LEVELS[level] ?? 2;
  }

  /**
   * Winston calls this method for each log message.
   */
  log(
    info: { level: string; message: string; [key: string]: unknown },
    callback: () => void,
  ): void {
    setImmediate(() => {
      const levelNum = InkUITransport.LEVELS[info.level] ?? 2;

      // Only process logs at or below the configured level
      if (levelNum <= this.minLevel) {
        // Extract the actual message, handling nested message objects
        let message = info.message;
        if (typeof info.message === 'object' && info.message !== null) {
          message = (info.message as { message?: string }).message || JSON.stringify(info.message);
        }

        // Clean up ANSI codes from the message for cleaner display
        const cleanMessage = String(message).replace(/\x1b\[[0-9;]*m/g, '');

        this.callback({
          level: info.level as LogEntry['level'],
          message: cleanMessage,
          timestamp: Date.now(),
        });
      }
    });

    callback();
  }
}

/**
 * Global reference to the active InkUITransport instance.
 * Only one instance should be active at a time.
 */
let activeTransport: InkUITransport | null = null;

/**
 * Create and register the Ink UI transport with the logger.
 *
 * @param callback - Function to call with each log entry
 * @param level - Minimum log level to capture (default: 'warn')
 * @returns The created transport instance
 */
export function registerInkUITransport(
  logger: { add: (transport: Transport) => void; remove: (transport: Transport) => void },
  callback: LogCallback,
  level: string = 'warn',
): InkUITransport {
  // Remove any existing transport first
  if (activeTransport) {
    unregisterInkUITransport(logger);
  }

  activeTransport = new InkUITransport({ callback, level });
  logger.add(activeTransport);
  return activeTransport;
}

/**
 * Remove the Ink UI transport from the logger.
 */
export function unregisterInkUITransport(logger: { remove: (transport: Transport) => void }): void {
  if (activeTransport) {
    const transport = activeTransport;
    activeTransport = null; // Clear reference first to prevent further callbacks

    try {
      // End the transport stream gracefully
      transport.end?.();
    } catch {
      // Ignore stream end errors
    }

    try {
      logger.remove(transport);
    } catch {
      // Ignore errors when removing transport
    }
  }
}

/**
 * Update the log level filter on the active transport.
 */
export function setInkUITransportLevel(level: string): void {
  if (activeTransport) {
    activeTransport.setLevel(level);
  }
}

/**
 * Check if the Ink UI transport is currently active.
 */
export function isInkUITransportActive(): boolean {
  return activeTransport !== null;
}
