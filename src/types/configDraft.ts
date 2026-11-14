import { z } from 'zod';
import {
  CONFIG_PROVIDER_INPUT_ERROR,
  hasValidConfigProviders,
  normalizeConfigProviderAlias,
} from './configAliases';
import { UnifiedConfigSchema } from './index';

export type ConfigDraft = Omit<Partial<z.infer<typeof UnifiedConfigSchema>>, 'basePath'> & {
  basePath?: never;
};

// Reuse the runtime's input fields while allowing a draft to omit required top-level fields.
export const UnifiedConfigDraftSchema = z
  .object(UnifiedConfigSchema.in.shape)
  .partial()
  .extend({
    // Web jobs deliberately do not trust a caller-supplied directory on the server.
    basePath: z
      .never({
        error:
          'The web editor cannot set a base directory. Remove basePath and use inline content, or run this configuration with the CLI.',
      })
      .optional(),
  })
  .refine((data) => hasValidConfigProviders(data, true), {
    message: CONFIG_PROVIDER_INPUT_ERROR,
    path: ['providers'],
  });

export function normalizeConfigDraft(config: ConfigDraft): ConfigDraft {
  return normalizeConfigProviderAlias(config);
}
