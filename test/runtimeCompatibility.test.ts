import { describe, expect, it } from 'vitest';
import {
  NODE_20_SUPPORT_END_DATE,
  RuntimeCompatibilityNoticeSchema,
  VersionSchemas,
} from '../src/contracts';
import {
  getRuntimeCompatibilityNotice,
  getRuntimeNoticeReminderIntervalMs,
  isLatestUpdateBlockedByRuntime,
  isUpdateBlockedByRuntime,
  parseNodeMajor,
  shouldShowRuntimeNotice,
} from '../src/runtimeCompatibility';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('runtime compatibility policy', () => {
  it('keeps the runtime producer aligned with the public version policy schemas', () => {
    const notice = getRuntimeCompatibilityNotice('v20.20.2');
    expect(notice).not.toBeNull();
    expect(RuntimeCompatibilityNoticeSchema.parse(notice)).toEqual(notice);

    const versionResponse = VersionSchemas.Response.parse({
      currentVersion: '0.121.18',
      latestVersion: '0.121.18',
      updateAvailable: false,
      updateBlockedByRuntime: false,
      runtimeNotice: notice,
      blockedUpdateNotice: null,
      runtimePolicy: { supportEndDate: NODE_20_SUPPORT_END_DATE },
      selfHosted: true,
      isNpx: false,
      updateCommands: {
        primary: 'npm install -g promptfoo',
        alternative: null,
        commandType: 'npm',
      },
      commandType: 'npm',
    });

    expect(versionResponse.runtimeNotice).toEqual(notice);
    expect(versionResponse.runtimePolicy).toEqual({
      supportEndDate: NODE_20_SUPPORT_END_DATE,
    });
  });

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

  it('keeps only official Docker image updates available after the host runtime cutoff', () => {
    const cutoff = new Date('2026-07-30T00:00:00.000Z');

    expect(isUpdateBlockedByRuntime('docker', 'v20.20.2', cutoff)).toBe(false);
    expect(isUpdateBlockedByRuntime('npm', 'v20.20.2', cutoff)).toBe(true);
    expect(isUpdateBlockedByRuntime('npx', 'v20.20.2', cutoff)).toBe(true);
  });

  it('reminds weekly before the final phase and daily starting exactly 14 days before cutoff', () => {
    expect(getRuntimeNoticeReminderIntervalMs(new Date('2026-07-01T00:00:00.000Z'))).toBe(
      7 * DAY_MS,
    );
    expect(getRuntimeNoticeReminderIntervalMs(new Date('2026-07-15T23:59:59.999Z'))).toBe(
      7 * DAY_MS,
    );
    expect(getRuntimeNoticeReminderIntervalMs(new Date('2026-07-16T00:00:00.000Z'))).toBe(DAY_MS);
    expect(getRuntimeNoticeReminderIntervalMs(new Date('2026-08-01T00:00:00.000Z'))).toBe(DAY_MS);
  });

  it('shows again at the active cadence boundary and fails open for malformed or future state', () => {
    const weeklyBoundary = new Date('2026-07-02T00:00:00.000Z');

    expect(
      shouldShowRuntimeNotice('2026-06-25T00:00:00.000Z', new Date(weeklyBoundary.getTime() - 1)),
    ).toBe(false);
    expect(shouldShowRuntimeNotice('2026-06-25T00:00:00.000Z', weeklyBoundary)).toBe(true);
    expect(shouldShowRuntimeNotice('invalid', weeklyBoundary)).toBe(true);
    expect(shouldShowRuntimeNotice('2026-08-01T00:00:00.000Z', weeklyBoundary)).toBe(true);
  });

  it('lets the daily final-phase cadence shorten an in-flight weekly snooze', () => {
    expect(
      shouldShowRuntimeNotice('2026-07-13T00:00:00.000Z', new Date('2026-07-15T23:59:59.999Z')),
    ).toBe(false);
    expect(
      shouldShowRuntimeNotice('2026-07-13T00:00:00.000Z', new Date('2026-07-16T00:00:00.000Z')),
    ).toBe(true);
  });
});
