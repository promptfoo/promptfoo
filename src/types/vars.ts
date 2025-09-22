import { z } from 'zod';

export const VarsSchema = z.record(
  z.string(),
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(z.union([z.string(), z.number(), z.boolean()])),
    z.record(z.string(), z.any()),
    z.array(z.any()),
  ]),
);

export type Vars = z.infer<typeof VarsSchema>;