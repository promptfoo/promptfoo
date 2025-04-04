import { z } from 'zod';
import { CompletionTokenDetailsSchema, TokenUsageSchema } from '../types/shared';

// Export the schemas to maintain backward compatibility
export { CompletionTokenDetailsSchema, TokenUsageSchema };

export const NunjucksFilterMapSchema = z.record(
  z.string(),
  z.function(z.tuple([z.any()]).rest(z.any()), z.string()),
);
