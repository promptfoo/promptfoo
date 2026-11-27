import { z } from 'zod';

export const ViewerTableDefaultsSchema = z.object({
  prettifyJson: z.boolean().optional(),
  showPassFail: z.boolean().optional(),
});

export type ViewerTableDefaults = z.infer<typeof ViewerTableDefaultsSchema>;
