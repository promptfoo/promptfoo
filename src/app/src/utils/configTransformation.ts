import type { UnifiedConfig } from '../../../types';

/**
 * Validation error interface
 */
interface ValidationError {
  field: string;
  message: string;
}

/**
 * Validation result interface
 */
interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

/**
 * Safely transforms a results config to a setup config, handling potential data loss.
 * This ensures that the edit-and-rerun functionality maintains data integrity.
 */
export function transformResultsConfigToSetupConfig(
  resultsConfig: Partial<UnifiedConfig>,
): Partial<UnifiedConfig> {
  // Create a clean copy of the config
  const setupConfig: Partial<UnifiedConfig> = {
    description: resultsConfig.description || '',
    providers: Array.isArray(resultsConfig.providers)
      ? resultsConfig.providers.filter((provider) => provider !== null && provider !== undefined)
      : [],
    prompts: Array.isArray(resultsConfig.prompts)
      ? resultsConfig.prompts.filter((prompt) => prompt !== null && prompt !== undefined)
      : [],
    tests: Array.isArray(resultsConfig.tests)
      ? resultsConfig.tests.filter((test) => test !== null && test !== undefined)
      : [],
    defaultTest: resultsConfig.defaultTest || {},
    derivedMetrics: Array.isArray(resultsConfig.derivedMetrics)
      ? resultsConfig.derivedMetrics.filter((metric) => metric !== null && metric !== undefined)
      : [],
    env: resultsConfig.env || {},
    evaluateOptions: resultsConfig.evaluateOptions || {},
    scenarios: Array.isArray(resultsConfig.scenarios)
      ? resultsConfig.scenarios.filter((scenario) => scenario !== null && scenario !== undefined)
      : [],
    extensions: Array.isArray(resultsConfig.extensions)
      ? resultsConfig.extensions.filter(
          (extension) => extension !== null && extension !== undefined,
        )
      : [],
  };

  return setupConfig;
}

/**
 * Validates a config for completeness and correctness
 */
export function validateConfigCompleteness(config: Partial<UnifiedConfig>): ValidationResult {
  const errors: ValidationError[] = [];

  // Check for required fields
  if (!config.providers || !Array.isArray(config.providers) || config.providers.length === 0) {
    errors.push({
      field: 'providers',
      message: 'At least one provider must be configured',
    });
  }

  if (!config.prompts || !Array.isArray(config.prompts) || config.prompts.length === 0) {
    errors.push({
      field: 'prompts',
      message: 'At least one prompt must be configured',
    });
  }

  // Validate provider structure
  if (config.providers && Array.isArray(config.providers)) {
    config.providers.forEach((provider, index) => {
      if (typeof provider === 'object' && provider !== null) {
        // Basic validation for provider objects
        if (!('id' in provider) && !('name' in provider)) {
          errors.push({
            field: `providers[${index}]`,
            message: 'Provider must have either an id or name',
          });
        }
      } else if (typeof provider === 'string') {
        // String providers are valid
      } else {
        errors.push({
          field: `providers[${index}]`,
          message: 'Provider must be a string or object',
        });
      }
    });
  }

  // Validate prompts structure
  if (config.prompts && Array.isArray(config.prompts)) {
    config.prompts.forEach((prompt, index) => {
      if (typeof prompt === 'string') {
        if (prompt.trim().length === 0) {
          errors.push({
            field: `prompts[${index}]`,
            message: 'Prompt cannot be empty',
          });
        }
      } else if (typeof prompt === 'object' && prompt !== null) {
        // Object prompts need validation
        if (!('raw' in prompt) && !('content' in prompt)) {
          errors.push({
            field: `prompts[${index}]`,
            message: 'Prompt object must have either raw or content field',
          });
        }
      } else {
        errors.push({
          field: `prompts[${index}]`,
          message: 'Prompt must be a string or object',
        });
      }
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Checks if a config has the minimum required fields for a valid evaluation
 */
export function hasMinimumRequiredFields(config: Partial<UnifiedConfig>): boolean {
  return (
    Boolean(config.providers) &&
    Array.isArray(config.providers) &&
    config.providers.length > 0 &&
    Boolean(config.prompts) &&
    Array.isArray(config.prompts) &&
    config.prompts.length > 0
  );
}

/**
 * Creates a minimal valid config from a potentially incomplete one
 */
export function createMinimalValidConfig(
  baseConfig: Partial<UnifiedConfig>,
): Partial<UnifiedConfig> {
  const minimal: Partial<UnifiedConfig> = {
    description: baseConfig.description || 'Imported configuration',
    providers: [],
    prompts: [],
    tests: baseConfig.tests || [],
    defaultTest: baseConfig.defaultTest || {},
    derivedMetrics: baseConfig.derivedMetrics || [],
    env: baseConfig.env || {},
    evaluateOptions: baseConfig.evaluateOptions || {},
    scenarios: baseConfig.scenarios || [],
    extensions: baseConfig.extensions || [],
  };

  // Try to preserve valid providers
  if (baseConfig.providers && Array.isArray(baseConfig.providers)) {
    minimal.providers = baseConfig.providers.filter(
      (provider) => provider !== null && provider !== undefined,
    );
  }

  // Try to preserve valid prompts
  if (baseConfig.prompts && Array.isArray(baseConfig.prompts)) {
    minimal.prompts = baseConfig.prompts.filter(
      (prompt) => prompt !== null && prompt !== undefined,
    );
  }

  // If no valid providers, add a placeholder
  if (minimal.providers && minimal.providers.length === 0) {
    minimal.providers = ['openai:gpt-3.5-turbo'];
  }

  // If no valid prompts, add a placeholder
  if (minimal.prompts && minimal.prompts.length === 0) {
    minimal.prompts = ['Please respond to: {{input}}'];
  }

  return minimal;
}
