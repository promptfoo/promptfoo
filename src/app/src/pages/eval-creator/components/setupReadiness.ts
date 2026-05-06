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

function isProviderMapShape(value: Record<string, unknown>): boolean {
  const entries = Object.entries(value);
  if (entries.length === 0) {
    return false;
  }

  return entries.every(([, nestedValue]) => {
    if (!isRecord(nestedValue)) {
      return false;
    }

    return (
      typeof nestedValue.id === 'string' ||
      Object.keys(nestedValue).some((nestedKey) => PROVIDER_OPTION_KEYS.has(nestedKey))
    );
  });
}

function isProviderOptionsShape(value: Record<string, unknown>): boolean {
  const keys = Object.keys(value);
  return keys.some((key) => PROVIDER_OPTION_KEYS.has(key));
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

    if (isProviderMapShape(provider)) {
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

export function normalizePrompts(prompts: UnifiedConfig['prompts'] | undefined): string[] {
  if (typeof prompts === 'string') {
    return prompts.trim() === '' ? [] : [prompts];
  }

  if (Array.isArray(prompts)) {
    return prompts
      .map((prompt) => {
        if (typeof prompt === 'string') {
          return prompt;
        }
        if (isRecord(prompt)) {
          if (typeof prompt.raw === 'string' && prompt.raw.trim() !== '') {
            return prompt.raw;
          }
          if (typeof prompt.id === 'string') {
            return prompt.id;
          }
        }
        return '';
      })
      .filter((prompt): prompt is string => prompt.trim() !== '');
  }

  if (isRecord(prompts)) {
    return Object.keys(prompts).filter((prompt) => prompt.trim() !== '');
  }

  return [];
}

export function normalizePromptsForJob(
  prompts: UnifiedConfig['prompts'] | undefined,
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

export function countTests(tests: UnifiedConfig['tests'] | undefined): number {
  if (Array.isArray(tests)) {
    return tests.length;
  }

  if (typeof tests === 'string') {
    return tests.trim() === '' ? 0 : 1;
  }

  return tests ? 1 : 0;
}
