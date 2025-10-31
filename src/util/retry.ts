/**
 * Simple retry utility for transient async operations.
 * Usage:
 *   await withRetry(() => fetch(...), { retries: 3, delayMs: 500 })
 */

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { retries?: number; delayMs?: number } = {},
): Promise<T> {
  const { retries = 2, delayMs = 500 } = opts;
  let lastErr: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      // Don’t sleep after final attempt
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }

  throw lastErr;
}
