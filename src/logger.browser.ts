/**
 * Browser-compatible logger module.
 * Lightweight console-based implementation that mirrors the Node logger API.
 * Vite aliases this module in place of ./logger for browser builds.
 */

export const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 } as const;
type LogLevel = keyof typeof LOG_LEVELS;

let currentLogLevel: LogLevel = 'info';
let isShuttingDown = false;

export function getLogLevel(): LogLevel {
  return currentLogLevel;
}

export function setLogLevel(level: LogLevel): void {
  if (level in LOG_LEVELS) {
    currentLogLevel = level;
  }
}

export function isDebugEnabled(): boolean {
  return currentLogLevel === 'debug';
}

// Redact sensitive fields in objects
function sanitize(obj: unknown): unknown {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(sanitize);
  }
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const k = key.toLowerCase();
    result[key] =
      k.includes('key') ||
      k.includes('secret') ||
      k.includes('token') ||
      k.includes('password') ||
      k.includes('authorization')
        ? '[REDACTED]'
        : sanitize(value);
  }
  return result;
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] <= LOG_LEVELS[currentLogLevel];
}

function log(
  level: LogLevel,
  method: (...args: unknown[]) => void,
  message: string,
  context?: Record<string, unknown>,
): void {
  if (isShuttingDown || !shouldLog(level)) {
    return;
  }
  if (context) {
    method(`${message}\n${JSON.stringify(sanitize(context), null, 2)}`);
  } else {
    method(message);
  }
}

const logger = {
  error: (msg: string, ctx?: Record<string, unknown>) => log('error', console.error, msg, ctx),
  warn: (msg: string, ctx?: Record<string, unknown>) => log('warn', console.warn, msg, ctx),
  info: (msg: string, ctx?: Record<string, unknown>) => log('info', console.info, msg, ctx),
  debug: (msg: string, ctx?: Record<string, unknown>) => log('debug', console.debug, msg, ctx),
  add: () => undefined,
  remove: () => undefined,
  get transports() {
    return [];
  },
  get level() {
    return currentLogLevel;
  },
  set level(l: string) {
    if (l in LOG_LEVELS) {
      currentLogLevel = l as LogLevel;
    }
  },
};

// Exports to match Node logger API surface
export type SanitizedLogContext = Record<string, unknown>;
export let globalLogCallback: ((msg: string) => void) | null = null;
export let sourceMapSupportInitialized = false;
export function setLogCallback(cb: ((msg: string) => void) | null): void {
  globalLogCallback = cb;
}
export function setStructuredLogging(_enabled: boolean): void {}
export function setLoggerShuttingDown(value: boolean): void {
  isShuttingDown = value;
}
export function getLoggerShuttingDown(): boolean {
  return isShuttingDown;
}
export function getCallerLocation(): string {
  return '';
}
export async function initializeSourceMapSupport(): Promise<void> {
  sourceMapSupportInitialized = true;
}
export function initializeRunLogging(): void {}
export function setLogger(_customLogger: unknown): void {}
export async function logRequestResponse(opts: {
  url: string;
  requestBody: unknown;
  requestMethod: string;
  response?: Response | null;
  error?: boolean;
}): Promise<void> {
  const method = opts.error ? logger.error : logger.debug;
  method('API request', { url: opts.url, method: opts.requestMethod });
}
export async function closeLogger(): Promise<void> {
  isShuttingDown = true;
}

export default logger;
