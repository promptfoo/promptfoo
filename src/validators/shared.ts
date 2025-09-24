import { z } from 'zod';

export const NunjucksFilterMapSchema = z.record(
  z.string(),
  z.function({ input: z.tuple([z.any()]).rest(z.any()), output: z.string() }),
);
