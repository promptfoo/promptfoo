import yaml from 'js-yaml';
import type { ProviderOptions, UnifiedConfig } from '@promptfoo/types';

export function normalizeProviders(
  providers: Partial<UnifiedConfig>['providers'],
): ProviderOptions[] {
  if (!Array.isArray(providers)) {
    return [];
  }

  return providers.filter(
    (provider): provider is ProviderOptions =>
      typeof provider === 'object' && provider !== null && !Array.isArray(provider),
  );
}

export function normalizePrompts(prompts: Partial<UnifiedConfig>['prompts']): string[] {
  if (!Array.isArray(prompts)) {
    return [];
  }

  return prompts
    .map((prompt) => {
      if (typeof prompt === 'string') {
        return prompt;
      }

      if (
        typeof prompt === 'object' &&
        prompt !== null &&
        'raw' in prompt &&
        typeof prompt.raw === 'string'
      ) {
        return prompt.raw;
      }

      return '';
    })
    .filter((prompt): prompt is string => prompt !== '');
}

export function extractVarsFromPrompts(prompts: string[]): string[] {
  const varRegex = /{{\s*(\w+)\s*}}/g;
  const varsSet = new Set<string>();

  prompts.forEach((prompt) => {
    let match;
    while ((match = varRegex.exec(prompt)) !== null) {
      varsSet.add(match[1]);
    }
  });

  return Array.from(varsSet);
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result;
      if (typeof content === 'string') {
        resolve(content);
        return;
      }

      reject(new Error('Invalid file contents'));
    };
    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };
    reader.readAsText(file);
  });
}

export async function parseUploadedConfig(file: File): Promise<Partial<UnifiedConfig> | null> {
  const content = await readFileAsText(file);
  const parsedConfig = yaml.load(content) as Record<string, unknown>;

  if (!parsedConfig || typeof parsedConfig !== 'object') {
    return null;
  }

  return parsedConfig as Partial<UnifiedConfig>;
}
