import type { UnifiedConfig } from '../../../types';

/**
 * Removes empty arrays, empty objects, null, and undefined values from config
 * This keeps the config clean and avoids saving unnecessary empty keys
 */
export function cleanConfig(config: Partial<UnifiedConfig>): Partial<UnifiedConfig> {
  const cleaned: Partial<UnifiedConfig> = {};

  for (const key in config) {
    const value = config[key as keyof UnifiedConfig];
    
    // Skip null or undefined
    if (value === null || value === undefined) {
      continue;
    }

    // Skip empty arrays
    if (Array.isArray(value) && value.length === 0) {
      continue;
    }

    // Skip empty objects (but keep defaultTest and evaluateOptions even if empty)
    if (
      typeof value === 'object' && 
      !Array.isArray(value) && 
      Object.keys(value).length === 0 &&
      key !== 'defaultTest' && 
      key !== 'evaluateOptions' &&
      key !== 'env'
    ) {
      continue;
    }

    // Skip empty strings for description
    if (key === 'description' && value === '') {
      continue;
    }

    // Keep the value
    cleaned[key as keyof UnifiedConfig] = value as any;
  }

  return cleaned;
}