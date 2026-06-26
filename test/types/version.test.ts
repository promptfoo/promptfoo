import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { VersionSchemas } from '../../src/types/api/version';

const baseResponse = {
  currentVersion: '0.121.13',
  latestVersion: '0.121.14',
  updateAvailable: true,
  updateBlockedByRuntime: false,
  selfHosted: false,
  isNpx: true,
  updateCommands: {
    primary: 'npx promptfoo@latest',
    alternative: 'npm install -g promptfoo@latest',
    commandType: 'npx' as const,
  },
  commandType: 'npx' as const,
};

const LegacyVersionResponseSchema = z.object({
  currentVersion: z.string(),
  latestVersion: z.string(),
  updateAvailable: z.boolean(),
  selfHosted: z.boolean(),
  isNpx: z.boolean(),
  updateCommands: z.object({
    primary: z.string(),
    alternative: z.string().nullable(),
    commandType: z.enum(['docker', 'npx', 'npm']),
  }),
  commandType: z.enum(['docker', 'npx', 'npm']),
});

describe('VersionSchemas.Response', () => {
  it('accepts legacy responses without runtime compatibility fields', () => {
    const { updateBlockedByRuntime: _updateBlockedByRuntime, ...legacyResponse } = baseResponse;

    expect(VersionSchemas.Response.parse(legacyResponse)).toEqual(legacyResponse);
  });

  it('accepts a response without an active runtime notice', () => {
    expect(
      VersionSchemas.Response.parse({
        ...baseResponse,
        runtimeNotice: null,
      }),
    ).toMatchObject({ runtimeNotice: null, updateBlockedByRuntime: false });
  });

  it('accepts cutoff policy metadata without an active runtime notice', () => {
    expect(
      VersionSchemas.Response.parse({
        ...baseResponse,
        runtimeNotice: null,
        runtimePolicy: { supportEndDate: '2026-07-30' },
      }),
    ).toMatchObject({
      runtimeNotice: null,
      runtimePolicy: { supportEndDate: '2026-07-30' },
    });
  });

  it('keeps custom-container guidance compatible with the legacy response schema', () => {
    const customContainerResponse = VersionSchemas.Response.parse({
      ...baseResponse,
      commandType: 'npm',
      updateCommands: {
        primary: '',
        alternative: null,
        commandType: 'npm',
        isCustomContainer: true,
      },
    });

    expect(customContainerResponse).toMatchObject({
      commandType: 'npm',
      updateCommands: { primary: '', commandType: 'npm', isCustomContainer: true },
    });
    expect(LegacyVersionResponseSchema.safeParse(customContainerResponse).success).toBe(true);
  });

  it('accepts the Node.js 20 compatibility notice', () => {
    expect(
      VersionSchemas.Response.parse({
        ...baseResponse,
        runtimeNotice: {
          id: 'node20-removal-2026-07-30',
          kind: 'runtime_deprecation',
          runtime: 'node',
          currentVersion: 'v20.20.2',
          currentMajor: 20,
          removalDate: '2026-07-30',
          minimumVersion: '22.22.0',
          recommendedVersion: '24 LTS',
          documentationUrl: 'https://www.promptfoo.dev/docs/installation/#nodejs-runtime-support',
        },
      }).runtimeNotice,
    ).toMatchObject({ currentMajor: 20, removalDate: '2026-07-30' });
  });

  it('rejects runtime notices that drift from the announced policy', () => {
    expect(
      VersionSchemas.Response.safeParse({
        ...baseResponse,
        runtimeNotice: {
          id: 'node20-removal-2026-07-30',
          kind: 'runtime_deprecation',
          runtime: 'node',
          currentVersion: 'v20.20.2',
          currentMajor: 20,
          removalDate: '2026-08-31',
          minimumVersion: '22.22.0',
          recommendedVersion: '24 LTS',
          documentationUrl: 'https://www.promptfoo.dev/docs/installation/#nodejs-runtime-support',
        },
      }).success,
    ).toBe(false);
  });

  it('rejects a runtime notice whose documentation URL drifts from the upgrade guide', () => {
    expect(
      VersionSchemas.Response.safeParse({
        ...baseResponse,
        runtimeNotice: {
          id: 'node20-removal-2026-07-30',
          kind: 'runtime_deprecation',
          runtime: 'node',
          currentVersion: 'v20.20.2',
          currentMajor: 20,
          removalDate: '2026-07-30',
          minimumVersion: '22.22.0',
          recommendedVersion: '24 LTS',
          documentationUrl: 'https://malicious.example.com/upgrade',
        },
      }).success,
    ).toBe(false);
  });
});
