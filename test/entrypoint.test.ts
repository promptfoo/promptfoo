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

    it('identifies Node.js versions below minimum as unsupported', () => {
      const minNodeVersion = 20;
      const unsupportedVersions = ['v18.19.0', 'v16.20.2', 'v14.21.3', 'v12.22.12'];

      for (const version of unsupportedVersions) {
        const major = parseInt(version.slice(1), 10);
        expect(major < minNodeVersion).toBe(true);
      }
    });

    it('identifies Node.js versions at or above minimum as supported', () => {
      const minNodeVersion = 20;
      const supportedVersions = ['v20.0.0', 'v20.11.1', 'v21.0.0', 'v22.0.0'];

      for (const version of supportedVersions) {
        const major = parseInt(version.slice(1), 10);
        expect(major < minNodeVersion).toBe(false);
      }
    });

    it('works with different minimum version thresholds', () => {
      // Simulates if engines.node was bumped to >=22
      const minNodeVersion = 22;

      expect(parseInt('v20.0.0'.slice(1), 10) < minNodeVersion).toBe(true); // 20 < 22
      expect(parseInt('v21.0.0'.slice(1), 10) < minNodeVersion).toBe(true); // 21 < 22
      expect(parseInt('v22.0.0'.slice(1), 10) < minNodeVersion).toBe(false); // 22 >= 22
      expect(parseInt('v23.0.0'.slice(1), 10) < minNodeVersion).toBe(false); // 23 >= 22
    });
  });

  describe('NaN handling for malformed versions', () => {
    it('returns NaN for malformed version strings', () => {
      const malformedVersions = ['vX.Y.Z', 'v', '', 'node-20.0.0', 'invalid'];

      for (const version of malformedVersions) {
        const major = parseInt(version.slice(1), 10);
        expect(Number.isNaN(major)).toBe(true);
      }
    });

    it('treats NaN as unsupported (fails safely)', () => {
      const version = 'vX.Y.Z'; // malformed
      const major = parseInt(version.slice(1), 10);

      // entrypoint.ts checks NaN separately and shows a distinct error message
      expect(Number.isNaN(major)).toBe(true);
      // This would trigger the "Unexpected Node.js version format" error
    });

    it('NaN comparison would incorrectly pass without explicit check', () => {
      // This demonstrates why we need the explicit NaN check
      const major = NaN;
      // NaN < 20 is false! (NaN comparisons always return false)
      expect(major < 20).toBe(false);
      // So without Number.isNaN check, malformed versions would pass through
      expect(Number.isNaN(major)).toBe(true);
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
    it('produces a yellow-colored error message for unsupported versions', () => {
      const version = 'v18.19.0';
      const minNodeVersion = 20;
      const errorMessage = `\x1b[33mNode.js ${version} is not supported. Please upgrade to Node.js ${minNodeVersion} or later.\x1b[0m`;

      expect(errorMessage).toContain('v18.19.0');
      expect(errorMessage).toContain('is not supported');
      expect(errorMessage).toContain('Node.js 20 or later');
      // Contains ANSI yellow color code
      expect(errorMessage).toContain('\x1b[33m');
      // Contains ANSI reset code
      expect(errorMessage).toContain('\x1b[0m');
    });

    it('produces a distinct error message for malformed versions', () => {
      const version = 'vX.Y.Z';
      const minNodeVersion = 20;
      const errorMessage = `\x1b[33mUnexpected Node.js version format: ${version}. Please use Node.js ${minNodeVersion} or later.\x1b[0m`;

      expect(errorMessage).toContain('Unexpected Node.js version format');
      expect(errorMessage).toContain('vX.Y.Z');
      expect(errorMessage).toContain('Node.js 20 or later');
    });

    it('uses dynamic minimum version in error message', () => {
      const version = 'v20.0.0';
      const minNodeVersion = 22; // Simulates bumped engines requirement
      const errorMessage = `\x1b[33mNode.js ${version} is not supported. Please upgrade to Node.js ${minNodeVersion} or later.\x1b[0m`;

      expect(errorMessage).toContain('Node.js 22 or later');
    });
  });

  describe('build-time constant behavior', () => {
    it('uses fallback when __PROMPTFOO_MIN_NODE_VERSION__ is undefined', () => {
      // In development/testing, the constant is undefined
      const __PROMPTFOO_MIN_NODE_VERSION__: number | undefined = undefined;
      const minNodeVersion =
        typeof __PROMPTFOO_MIN_NODE_VERSION__ !== 'undefined' ? __PROMPTFOO_MIN_NODE_VERSION__ : 20;

      expect(minNodeVersion).toBe(20);
    });

    it('uses injected value when __PROMPTFOO_MIN_NODE_VERSION__ is defined', () => {
      // At build time, the constant is replaced with the actual value
      const __PROMPTFOO_MIN_NODE_VERSION__: number | undefined = 22;
      const minNodeVersion =
        typeof __PROMPTFOO_MIN_NODE_VERSION__ !== 'undefined' ? __PROMPTFOO_MIN_NODE_VERSION__ : 20;

      expect(minNodeVersion).toBe(22);
    });
  });
});
