import { z } from 'zod';

import type { TransformFunction } from '../transform';

export const NunjucksFilterMapSchema = z.record(
  z.string(),
  z.custom<(...args: any[]) => string>((v) => typeof v === 'function'),
);

/**
 * Zod schema accepting a string or a function.
 * Used for transform fields that accept inline JS expressions, file:// references,
 * or direct functions when using the Node.js package.
 */
export const StringOrFunctionSchema = z.union([
  z.string(),
  z.custom<TransformFunction>((val) => typeof val === 'function', {
    message: 'Transform must be a string expression, file:// path, or a function (Node.js package)',
  }),
]);
