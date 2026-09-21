import { z } from 'zod';
import {
  CONFIG_PROVIDER_INPUT_ERROR,
  hasValidConfigProviders,
  normalizeConfigProviderAlias,
} from './configAliases';
import { UnifiedConfigSchema } from './index';

export type ConfigDraft = Partial<z.infer<typeof UnifiedConfigSchema>>;

// Reuse the runtime's input fields while allowing a draft to omit required top-level fields.
export const UnifiedConfigDraftSchema = z
  .object(UnifiedConfigSchema.in.shape)
  .partial()
  .refine((data) => hasValidConfigProviders(data, true), {
    message: CONFIG_PROVIDER_INPUT_ERROR,
    path: ['providers'],
  });

export function normalizeConfigDraft(config: ConfigDraft): ConfigDraft {
  return normalizeConfigProviderAlias(config);
}
