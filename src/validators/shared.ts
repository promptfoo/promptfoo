import { z } from 'zod';

export const NunjucksFilterMapSchema = z.record(
  z.string(),
  z.custom<(value: any, ...args: any[]) => string>(),
);
