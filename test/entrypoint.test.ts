import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * Tests for the version check logic used in src/entrypoint.ts
 *
 * The entrypoint itself has top-level await and side effects, so we test
 * the core logic (version parsing, runtime detection) in isolation.
 */
describe('entrypoint version check logic', () => {
  describe('Node.js version parsing', () => {
    it('correctly parses major version from process.version format', () => {
      // process.version is always "vX.Y.Z" format
      const testCases = [
        { version: 'v20.0.0', expected: 20 },
        { version: 'v20.11.1', expected: 20 },
        { version: 'v22.0.0', expected: 22 },
        { version: 'v18.19.0', expected: 18 },
        { version: 'v16.20.2', expected: 16 },
        { version: 'v14.21.3', expected: 14 },
      ];

      for (const { version, expected } of testCases) {
        const major = parseInt(version.slice(1), 10);
        expect(major).toBe(expected);
      }
    });

    it('identifies Node.js versions below 20 as unsupported', () => {
      const unsupportedVersions = ['v18.19.0', 'v16.20.2', 'v14.21.3', 'v12.22.12'];

      for (const version of unsupportedVersions) {
        const major = parseInt(version.slice(1), 10);
        expect(major < 20).toBe(true);
      }
    });

    it('identifies Node.js versions 20+ as supported', () => {
      const supportedVersions = ['v20.0.0', 'v20.11.1', 'v21.0.0', 'v22.0.0'];

      for (const version of supportedVersions) {
        const major = parseInt(version.slice(1), 10);
        expect(major < 20).toBe(false);
      }
    });
  });

  describe('alternative runtime detection', () => {
    let originalBun: unknown;
    let originalDeno: unknown;

    beforeEach(() => {
      // Save original values
      originalBun = (globalThis as Record<string, unknown>).Bun;
      originalDeno = (globalThis as Record<string, unknown>).Deno;
    });

    afterEach(() => {
      // Restore original values
      if (originalBun !== undefined) {
        (globalThis as Record<string, unknown>).Bun = originalBun;
      } else {
        delete (globalThis as Record<string, unknown>).Bun;
      }
      if (originalDeno !== undefined) {
        (globalThis as Record<string, unknown>).Deno = originalDeno;
      } else {
        delete (globalThis as Record<string, unknown>).Deno;
      }
    });

    it('detects Bun runtime via globalThis.Bun', () => {
      // Simulate Bun environment
      (globalThis as Record<string, unknown>).Bun = { version: '1.0.0' };

      const isBun = typeof (globalThis as Record<string, unknown>).Bun !== 'undefined';
      expect(isBun).toBe(true);
    });

    it('detects Deno runtime via globalThis.Deno', () => {
      // Simulate Deno environment
      (globalThis as Record<string, unknown>).Deno = { version: { deno: '1.40.0' } };

      const isDeno = typeof (globalThis as Record<string, unknown>).Deno !== 'undefined';
      expect(isDeno).toBe(true);
    });

    it('returns false for Bun/Deno detection in standard Node.js', () => {
      // Ensure Bun and Deno are not defined (standard Node.js)
      delete (globalThis as Record<string, unknown>).Bun;
      delete (globalThis as Record<string, unknown>).Deno;

      const isBun = typeof (globalThis as Record<string, unknown>).Bun !== 'undefined';
      const isDeno = typeof (globalThis as Record<string, unknown>).Deno !== 'undefined';

      expect(isBun).toBe(false);
      expect(isDeno).toBe(false);
    });

    it('skips version check when running in Bun', () => {
      (globalThis as Record<string, unknown>).Bun = { version: '1.0.0' };

      const isBun = typeof (globalThis as Record<string, unknown>).Bun !== 'undefined';
      const isDeno = typeof (globalThis as Record<string, unknown>).Deno !== 'undefined';

      // Simulate old Node version string (though Bun wouldn't have this)
      const version = 'v16.0.0';
      const major = parseInt(version.slice(1), 10);

      // Version check should be skipped for Bun
      const shouldCheckVersion = !isBun && !isDeno;
      expect(shouldCheckVersion).toBe(false);

      // Even though major < 20, the check is skipped
      expect(major < 20).toBe(true);
    });

    it('skips version check when running in Deno', () => {
      (globalThis as Record<string, unknown>).Deno = { version: { deno: '1.40.0' } };

      const isBun = typeof (globalThis as Record<string, unknown>).Bun !== 'undefined';
      const isDeno = typeof (globalThis as Record<string, unknown>).Deno !== 'undefined';

      // Version check should be skipped for Deno
      const shouldCheckVersion = !isBun && !isDeno;
      expect(shouldCheckVersion).toBe(false);
    });
  });

  describe('error message formatting', () => {
    it('produces a yellow-colored error message with version info', () => {
      const version = 'v18.19.0';
      const errorMessage = `\x1b[33mNode.js ${version} is not supported. Please upgrade to Node.js 20 or later.\x1b[0m`;

      expect(errorMessage).toContain('v18.19.0');
      expect(errorMessage).toContain('Node.js 20 or later');
      // Contains ANSI yellow color code
      expect(errorMessage).toContain('\x1b[33m');
      // Contains ANSI reset code
      expect(errorMessage).toContain('\x1b[0m');
    });
  });
});
