import { z } from 'zod';

/** Standard email validation schema. */
export const EmailSchema = z.string().email();

/** Response containing a single message field. */
export const MessageResponseSchema = z.object({
  message: z.string(),
});

export type MessageResponse = z.infer<typeof MessageResponseSchema>;
