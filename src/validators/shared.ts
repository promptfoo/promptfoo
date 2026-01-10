import { z } from 'zod';

export const NunjucksFilterMapSchema = z.record(
  z.string(),
  z.custom<(...args: any[]) => string>(),
);
