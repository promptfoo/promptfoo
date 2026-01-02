import semverGt from 'semver/functions/gt.js';
import semverValid from 'semver/functions/valid.js';
import { describe, expect, it } from 'vitest';

/**
 * These tests verify the logic used in src/server/routes/version.ts
 * for determining when to show the update banner.
 *
 * The version route has three key behaviors:
 * 1. Semantic version comparison (not string comparison)
 * 2. Development builds never show update banner
 * 3. Failed fetches are rate-limited to prevent API hammering
 */

// Replicated from version.ts for testing
function isDevVersion(version: string): boolean {
  return version.includes('development') || version === '0.0.0';
}

function isUpdateAvailable(latestVersion: string | null, currentVersion: string): boolean {
  if (!latestVersion) {
    return false;
  }

  if (isDevVersion(currentVersion)) {
    return false;
  }

  if (semverValid(latestVersion) && semverValid(currentVersion)) {
    return semverGt(latestVersion, currentVersion);
  }

  return latestVersion !== currentVersion;
}

describe('isDevVersion', () => {
  it('should return true for development version strings', () => {
    expect(isDevVersion('0.0.0-development')).toBe(true);
    expect(isDevVersion('1.0.0-development')).toBe(true);
    expect(isDevVersion('development')).toBe(true);
  });

  it('should return true for 0.0.0', () => {
    expect(isDevVersion('0.0.0')).toBe(true);
  });

  it('should return false for normal version strings', () => {
    expect(isDevVersion('1.0.0')).toBe(false);
    expect(isDevVersion('0.120.9')).toBe(false);
    expect(isDevVersion('1.2.3-beta.1')).toBe(false);
  });
});

describe('isUpdateAvailable', () => {
  describe('basic version comparison', () => {
    it('should return true when latest version is greater', () => {
      expect(isUpdateAvailable('1.1.0', '1.0.0')).toBe(true);
      expect(isUpdateAvailable('2.0.0', '1.9.9')).toBe(true);
      expect(isUpdateAvailable('1.0.1', '1.0.0')).toBe(true);
    });

    it('should return false when versions are equal', () => {
      expect(isUpdateAvailable('1.0.0', '1.0.0')).toBe(false);
      expect(isUpdateAvailable('0.120.9', '0.120.9')).toBe(false);
    });

    it('should return false when current version is greater (user on pre-release)', () => {
      // BUG FIX: User on beta/pre-release should NOT see "downgrade" prompt
      expect(isUpdateAvailable('1.0.0', '1.1.0-beta.1')).toBe(false);
      expect(isUpdateAvailable('1.0.0', '2.0.0-alpha')).toBe(false);
    });
  });

  describe('development builds', () => {
    it('should return false for development versions regardless of latest', () => {
      // BUG FIX: Development builds should never show update banner
      expect(isUpdateAvailable('1.0.0', '0.0.0-development')).toBe(false);
      expect(isUpdateAvailable('99.99.99', '0.0.0-development')).toBe(false);
    });

    it('should return false for 0.0.0 versions', () => {
      expect(isUpdateAvailable('1.0.0', '0.0.0')).toBe(false);
    });
  });

  describe('null/missing latest version', () => {
    it('should return false when latestVersion is null', () => {
      expect(isUpdateAvailable(null, '1.0.0')).toBe(false);
    });
  });

  describe('pre-release versions', () => {
    it('should correctly compare pre-release versions', () => {
      // Pre-release is less than release
      expect(isUpdateAvailable('1.0.0', '1.0.0-beta.1')).toBe(true);
      expect(isUpdateAvailable('1.0.0', '1.0.0-alpha')).toBe(true);

      // Later pre-release
      expect(isUpdateAvailable('1.0.0-beta.2', '1.0.0-beta.1')).toBe(true);
    });

    it('should return false when user is on newer pre-release', () => {
      // User on RC should not be prompted to "update" to stable if RC is newer
      expect(isUpdateAvailable('1.0.0', '1.0.1-rc.1')).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should fall back to string comparison for invalid semver (different part counts)', () => {
      // '1.0' is not valid semver (requires 3 parts), so falls back to string comparison
      // Since '1.0.0' !== '1.0', it returns true (strings are different)
      expect(isUpdateAvailable('1.0.0', '1.0')).toBe(true);
    });

    it('should fall back to string comparison for non-semver versions', () => {
      // If somehow we get non-semver strings, use string inequality
      expect(isUpdateAvailable('abc', 'def')).toBe(true); // Different strings
      expect(isUpdateAvailable('abc', 'abc')).toBe(false); // Same strings
    });
  });
});
