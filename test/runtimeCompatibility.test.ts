import { describe, expect, it } from 'vitest';
import {
  getRuntimeCompatibilityNotice,
  isLatestUpdateBlockedByRuntime,
  isUpdateBlockedByRuntime,
  parseNodeMajor,
} from '../src/runtimeCompatibility';

describe('runtime compatibility policy', () => {
  it('detects Node.js 20 and returns the dated compatibility notice', () => {
    expect(
      getRuntimeCompatibilityNotice('v20.20.2', {
        isBun: false,
        isDeno: false,
      }),
    ).toEqual(
      expect.objectContaining({
        id: 'node20-removal-2026-07-30',
        currentVersion: 'v20.20.2',
        currentMajor: 20,
        removalDate: '2026-07-30',
        minimumVersion: '22.22.0',
        recommendedVersion: '24 LTS',
      }),
    );
  });

  it('does not return a Node.js notice for supported newer or alternative runtimes', () => {
    expect(getRuntimeCompatibilityNotice('v22.22.0', { isBun: false, isDeno: false })).toBeNull();
    expect(getRuntimeCompatibilityNotice('v24.1.0', { isBun: false, isDeno: false })).toBeNull();
    expect(getRuntimeCompatibilityNotice('v20.20.2', { isBun: true, isDeno: false })).toBeNull();
    expect(getRuntimeCompatibilityNotice('v20.20.2', { isBun: false, isDeno: true })).toBeNull();
  });

  it('parses Node.js major versions without accepting unrelated strings', () => {
    expect(parseNodeMajor('v20.20.2')).toBe(20);
    expect(parseNodeMajor('24.0.0')).toBe(24);
    expect(parseNodeMajor('node-20.20.2')).toBeNull();
  });

  it('blocks latest-version advice for Node.js 20 at the support cutoff', () => {
    expect(isLatestUpdateBlockedByRuntime('v20.20.2', new Date('2026-07-29T23:59:59.999Z'))).toBe(
      false,
    );
    expect(isLatestUpdateBlockedByRuntime('v20.20.2', new Date('2026-07-30T00:00:00.000Z'))).toBe(
      true,
    );
    expect(isLatestUpdateBlockedByRuntime('v24.0.0', new Date('2026-08-01T00:00:00.000Z'))).toBe(
      false,
    );
  });

  it('keeps Docker image updates available after the host runtime cutoff', () => {
    const cutoff = new Date('2026-07-30T00:00:00.000Z');

    expect(isUpdateBlockedByRuntime('docker', 'v20.20.2', cutoff)).toBe(false);
    expect(isUpdateBlockedByRuntime('npm', 'v20.20.2', cutoff)).toBe(true);
    expect(isUpdateBlockedByRuntime('npx', 'v20.20.2', cutoff)).toBe(true);
  });
});
