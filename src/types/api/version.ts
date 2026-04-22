import { z } from 'zod';

// GET /api/version

export const VersionResponseSchema = z.object({
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

export type VersionResponse = z.infer<typeof VersionResponseSchema>;

/** Grouped schemas for server-side validation. */
export const VersionSchemas = {
  Response: VersionResponseSchema,
} as const;
