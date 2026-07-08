import { z } from 'zod';

// GET /api/version

export const RuntimeCompatibilityNoticeSchema = z.object({
  id: z.literal('node20-removal-2026-07-30'),
  kind: z.literal('runtime_deprecation'),
  runtime: z.literal('node'),
  currentVersion: z.string(),
  currentMajor: z.literal(20),
  removalDate: z.literal('2026-07-30'),
  minimumVersion: z.literal('22.22.0'),
  recommendedVersion: z.literal('24 LTS'),
  // Lock this to the published upgrade guide alongside the other policy fields.
  documentationUrl: z.literal(
    'https://www.promptfoo.dev/docs/installation/#nodejs-runtime-support',
  ),
});

export const RuntimeCompatibilityPolicySchema = z.object({
  supportEndDate: z.literal('2026-07-30'),
});

export const VersionResponseSchema = z.object({
  currentVersion: z.string(),
  latestVersion: z.string(),
  updateAvailable: z.boolean(),
  updateBlockedByRuntime: z.boolean().optional(),
  runtimeNotice: RuntimeCompatibilityNoticeSchema.nullable().optional(),
  blockedUpdateNotice: RuntimeCompatibilityNoticeSchema.nullable().optional(),
  runtimePolicy: RuntimeCompatibilityPolicySchema.nullable().optional(),
  selfHosted: z.boolean(),
  isNpx: z.boolean(),
  updateCommands: z.object({
    primary: z.string(),
    alternative: z.string().nullable(),
    commandType: z.enum(['docker', 'npx', 'npm']),
    isCustomContainer: z.boolean().optional(),
  }),
  commandType: z.enum(['docker', 'npx', 'npm']),
});

export type VersionResponse = z.infer<typeof VersionResponseSchema>;

/** Grouped schemas for server-side validation. */
export const VersionSchemas = {
  Response: VersionResponseSchema,
} as const;
