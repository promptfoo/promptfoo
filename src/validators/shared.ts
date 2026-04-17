import { z } from 'zod';

export const NunjucksFilterMapSchema = z.record(
  z.string(),
  z.custom<(...args: unknown[]) => string>((v) => typeof v === 'function'),
);
