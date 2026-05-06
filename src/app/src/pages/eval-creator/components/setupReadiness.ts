import type { ProviderOptions, UnifiedConfig } from '@promptfoo/types';

const PROVIDER_OPTION_KEYS = new Set([
  'id',
  'label',
  'config',
  'prompts',
  'transform',
  'delay',
  'env',
  'inputs',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isProviderOptionsShape(value: Record<string, unknown>): boolean {
  const keys = Object.keys(value);
  return keys.length > 0 && keys.every((key) => PROVIDER_OPTION_KEYS.has(key));
}

function hasRunnableProviderId(
  provider: ProviderOptions,
): provider is ProviderOptions & { id: string } {
  return typeof provider.id === 'string' && provider.id.trim() !== '';
}

export function normalizeProviders(providers: UnifiedConfig['providers']): ProviderOptions[] {
  const providerList = Array.isArray(providers) ? providers : providers ? [providers] : [];

  return providerList.flatMap((provider) => {
    if (typeof provider === 'string') {
      return provider.trim() === '' ? [] : [{ id: provider }];
    }

    if (!isRecord(provider)) {
      return [];
    }

    if (isProviderOptionsShape(provider)) {
      const providerOptions = provider as ProviderOptions;
      return hasRunnableProviderId(providerOptions) ? [providerOptions] : [];
    }

    return Object.entries(provider).flatMap(([id, providerOptions]) => {
      if (!isRecord(providerOptions)) {
        return [];
      }

      const normalizedProvider = {
        ...(providerOptions as ProviderOptions),
        id:
          typeof providerOptions.id === 'string' && providerOptions.id.trim() !== ''
            ? providerOptions.id
            : id,
      };

      return hasRunnableProviderId(normalizedProvider) ? [normalizedProvider] : [];
    });
  });
}

export function normalizePrompts(prompts: UnifiedConfig['prompts']): string[] {
  if (typeof prompts === 'string') {
    return prompts.trim() === '' ? [] : [prompts];
  }

  if (Array.isArray(prompts)) {
    return prompts
      .map((prompt) => {
        if (typeof prompt === 'string') {
          return prompt;
        }
        if (isRecord(prompt) && typeof prompt.raw === 'string') {
          return prompt.raw;
        }
        return '';
      })
      .filter((prompt): prompt is string => prompt.trim() !== '');
  }

  if (isRecord(prompts)) {
    return Object.values(prompts).filter(
      (prompt): prompt is string => typeof prompt === 'string' && prompt.trim() !== '',
    );
  }

  return [];
}

export function normalizePromptsForJob(
  prompts: UnifiedConfig['prompts'],
): Array<string | Record<string, unknown>> {
  if (Array.isArray(prompts)) {
    return prompts as Array<string | Record<string, unknown>>;
  }

  if (typeof prompts === 'string') {
    return prompts.trim() === '' ? [] : [prompts];
  }

  if (isRecord(prompts)) {
    return Object.entries(prompts)
      .filter(
        (entry): entry is [string, string] =>
          entry[0].trim() !== '' && typeof entry[1] === 'string' && entry[1].trim() !== '',
      )
      .map(([raw, label]) => ({ raw, label }));
  }

  return [];
}

export function countTests(tests: UnifiedConfig['tests']): number {
  if (Array.isArray(tests)) {
    return tests.length;
  }

  if (typeof tests === 'string') {
    return tests.trim() === '' ? 0 : 1;
  }

  return tests ? 1 : 0;
}
