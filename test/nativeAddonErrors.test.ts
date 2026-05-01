import { describe, expect, it } from 'vitest';
import {
  formatNativeAddonVersionMismatchMessage,
  getNativeAddonVersionMismatchDetails,
} from '../src/util/nativeAddonErrors';
import { createNativeAddonVersionMismatchError } from './factories/nativeAddonErrors';

describe('native addon errors', () => {
  const versionMismatchError = createNativeAddonVersionMismatchError();

  it('extracts better-sqlite3 ABI mismatch details', () => {
    expect(getNativeAddonVersionMismatchDetails(versionMismatchError)).toEqual({
      addonAbi: '115',
      nodeAbi: '137',
    });
  });

  it('formats actionable repair instructions for supported mismatch errors', () => {
    const message = formatNativeAddonVersionMismatchMessage(versionMismatchError);

    // Verify ABI numbers are dynamically interpolated
    expect(message).toContain('Current Node.js ABI: 137');
    expect(message).toContain('Installed better-sqlite3 ABI: 115');
    // Verify the call-to-action URL is present
    expect(message).toContain('troubleshooting/#nodejs-version-mismatch-error');
  });

  it('ignores unrelated errors', () => {
    const error = new Error('Database connection failed');

    expect(getNativeAddonVersionMismatchDetails(error)).toBeUndefined();
    expect(formatNativeAddonVersionMismatchMessage(error)).toBeUndefined();
  });
});
