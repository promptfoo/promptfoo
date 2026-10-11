import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { VersionSchemas } from '../../src/types/api/version';

const baseResponse = {
  currentVersion: '0.121.13',
  latestVersion: '0.121.14',
  updateAvailable: true,
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
  it('accepts a baseline version response', () => {
    expect(VersionSchemas.Response.parse(baseResponse)).toEqual(baseResponse);
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
});
