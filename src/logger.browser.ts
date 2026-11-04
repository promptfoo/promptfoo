/**
 * Browser-compatible logger module.
 * Console-based logging for browser application consumers.
 * Vite aliases this module in place of ./logger for browser builds.
 */

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

function log(
  method: (...args: unknown[]) => void,
  message: string,
  context?: Record<string, unknown>,
): void {
  if (context) {
    method(`${message}\n${JSON.stringify(sanitize(context), null, 2)}`);
  } else {
    method(message);
  }
}

const logger = {
  error: (msg: string, ctx?: Record<string, unknown>) => log(console.error, msg, ctx),
  warn: (msg: string, ctx?: Record<string, unknown>) => log(console.warn, msg, ctx),
  // Debug stays suppressed; preserve the console method lookup at call time.
  debug: (_msg: string, _ctx?: Record<string, unknown>) => void console.debug,
};

export default logger;
