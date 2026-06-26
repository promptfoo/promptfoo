import { z } from 'zod';
import {
  NODE_20_RUNTIME_NOTICE_ID,
  NODE_20_SUPPORT_END_DATE,
  NODE_MINIMUM_UPGRADE_VERSION,
  NODE_RECOMMENDED_VERSION,
  NODE_RUNTIME_UPGRADE_GUIDE_URL,
} from '../runtimeCompatibility';

// GET /api/version

export const RuntimeCompatibilityNoticeSchema = z.object({
  id: z.literal(NODE_20_RUNTIME_NOTICE_ID),
  kind: z.literal('runtime_deprecation'),
  runtime: z.literal('node'),
  currentVersion: z.string(),
  currentMajor: z.literal(20),
  removalDate: z.literal(NODE_20_SUPPORT_END_DATE),
  minimumVersion: z.literal(NODE_MINIMUM_UPGRADE_VERSION),
  recommendedVersion: z.literal(NODE_RECOMMENDED_VERSION),
  // Locked to the announced constant so the response can't drift from the published upgrade guide,
  // matching the policy-drift guard on the other notice fields.
  documentationUrl: z.literal(NODE_RUNTIME_UPGRADE_GUIDE_URL),
});

export const RuntimeCompatibilityPolicySchema = z.object({
  supportEndDate: z.literal(NODE_20_SUPPORT_END_DATE),
});

export const VersionResponseSchema = z.object({
  currentVersion: z.string(),
  latestVersion: z.string(),
  updateAvailable: z.boolean(),
  updateBlockedByRuntime: z.boolean().optional(),
  runtimeNotice: RuntimeCompatibilityNoticeSchema.nullable().optional(),
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
