import { z } from 'zod';

/**
 * Primitive field schemas - reusable building blocks
 * These are the atomic units that compose into larger schemas
 */
export const Field = {
  id: z.string().min(1),
  email: z.string().email(),
  message: z.string(),
  boolean: z.boolean(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
} as const;

/**
 * Common composite schemas - frequently used patterns
 * These reduce duplication across the API
 */
export const Schema = {
  // Common param patterns
  id: z.object({ id: Field.id }),
  evalId: z.object({ id: Field.id }),
  traceId: z.object({ traceId: Field.id }),

  // Common response patterns
  message: z.object({ message: Field.message }),
  success: z.object({
    success: Field.boolean,
    message: Field.message,
  }),
  error: z.object({ error: Field.message }),
} as const;
