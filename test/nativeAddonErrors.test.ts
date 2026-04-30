import { describe, expect, it } from 'vitest';
import {
  formatNativeAddonVersionMismatchMessage,
  getNativeAddonVersionMismatchDetails,
  isNativeAddonVersionMismatchError,
} from '../src/util/nativeAddonErrors';

describe('native addon errors', () => {
  const versionMismatchError = new Error(
    [
      "The module '/tmp/node_modules/better-sqlite3/build/Release/better_sqlite3.node'",
      'was compiled against a different Node.js version using',
      'NODE_MODULE_VERSION 115. This version of Node.js requires',
      'NODE_MODULE_VERSION 137. Please try re-compiling or re-installing',
      'the module (for instance, using `npm rebuild` or `npm install`).',
    ].join('\n'),
  );

  it('extracts better-sqlite3 ABI mismatch details', () => {
    expect(getNativeAddonVersionMismatchDetails(versionMismatchError)).toEqual({
      addonAbi: '115',
      nodeAbi: '137',
    });
    expect(isNativeAddonVersionMismatchError(versionMismatchError)).toBe(true);
  });

  it('formats actionable repair instructions for supported mismatch errors', () => {
    const message = formatNativeAddonVersionMismatchMessage(versionMismatchError);

    expect(message).toContain('promptfoo could not load its SQLite dependency');
    expect(message).toContain('Current Node.js ABI: 137');
    expect(message).toContain('Installed better-sqlite3 ABI: 115');
    expect(message).toContain('npm rebuild better-sqlite3');
    expect(message).toContain('npm install -g promptfoo@latest');
    expect(message).toContain('npx -y promptfoo@latest');
    expect(message).toContain('troubleshooting/#nodejs-version-mismatch-error');
  });

  it('ignores unrelated errors', () => {
    const error = new Error('Database connection failed');

    expect(getNativeAddonVersionMismatchDetails(error)).toBeUndefined();
    expect(isNativeAddonVersionMismatchError(error)).toBe(false);
    expect(formatNativeAddonVersionMismatchMessage(error)).toBeUndefined();
  });
});
