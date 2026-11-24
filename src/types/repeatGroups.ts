import { z } from 'zod';

const repeatGroupSchema = z.object({
  id: z.string(),
  description: z.string().nullable(),
  firstTestIdx: z.number(),
  prompts: z.array(
    z.object({
      promptIdx: z.number(),
      passed: z.number(),
      failed: z.number(),
      errors: z.number(),
    }),
  ),
});

export type RepeatGroup = z.infer<typeof repeatGroupSchema>;
export const RepeatGroupsResponseSchema = z.object({
  groups: z.array(repeatGroupSchema),
  hasMore: z.boolean(),
});
export type RepeatGroupsResponse = z.infer<typeof RepeatGroupsResponseSchema>;
