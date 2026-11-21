import type { GoogleProviderConfig } from './types';

export function isGeminiEmbedding2(model: string): boolean {
  return /^gemini-embedding-2(?:$|-)/.test(model);
}

export function getEmbedding2OptionError(config: GoogleProviderConfig, model: string) {
  for (const key of ['taskType', 'title'] as const) {
    if (config[key] !== undefined) {
      return `${model} does not support ${key}. Include the task or title in the input text instead.`;
    }
  }
  if (config.autoTruncate !== undefined) {
    return `${model} does not support autoTruncate. Omit this option when using embedContent.`;
  }
  return undefined;
}

export function isEmbeddingVector(values: unknown): values is number[] {
  return Array.isArray(values) && values.length > 0 && values.every(Number.isFinite);
}
