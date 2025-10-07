/**
 * Provider configuration schemas
 * Defines the configuration fields for each provider type
 */

// FIX #15: Better TypeScript types - structured error objects
export interface ValidationError {
  field: string;
  message: string;
}

export interface FieldSchema {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  label: string;
  description?: string;
  required?: boolean;
  defaultValue?: any;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    enum?: any[];
  };
  sensitive?: boolean; // For API keys, secrets
}

export interface ProviderSchema {
  fields: FieldSchema[];
  validate?: (config: Record<string, any>) => string | null; // Returns error message or null
}

// Common field definitions that can be reused
const commonFields = {
  apiKey: {
    name: 'apiKey',
    type: 'string' as const,
    label: 'API Key',
    description: 'Authentication key for the provider',
    required: true,
    sensitive: true,
  },
  apiBaseUrl: {
    name: 'apiBaseUrl',
    type: 'string' as const,
    label: 'API Base URL',
    description: 'Base URL for API requests',
    validation: {
      pattern: '^https?://',
    },
  },
  temperature: {
    name: 'temperature',
    type: 'number' as const,
    label: 'Temperature',
    description: 'Controls randomness (0-2)',
    defaultValue: 0.7,
    validation: {
      min: 0,
      max: 2,
    },
  },
  maxTokens: {
    name: 'max_tokens',
    type: 'number' as const,
    label: 'Max Tokens',
    description: 'Maximum tokens in response',
    validation: {
      min: 1,
      max: 128000,
    },
  },
};

// Provider-specific schemas
export const providerSchemas: Record<string, ProviderSchema> = {
  openai: {
    fields: [
      commonFields.apiKey,
      commonFields.apiBaseUrl,
      {
        name: 'organization',
        type: 'string',
        label: 'Organization ID',
        description: 'Optional OpenAI organization ID',
      },
      commonFields.temperature,
      commonFields.maxTokens,
      {
        name: 'model',
        type: 'string',
        label: 'Model',
        description: 'Model name (e.g., gpt-4)',
        required: true,
      },
    ],
  },
  azure: {
    fields: [
      {
        name: 'deployment_id',
        type: 'string',
        label: 'Deployment ID',
        description: 'Azure OpenAI deployment name',
        required: true,
      },
      commonFields.apiKey,
      {
        name: 'apiVersion',
        type: 'string',
        label: 'API Version',
        description: 'Azure OpenAI API version',
        defaultValue: '2024-02-01',
        required: true,
      },
      {
        name: 'endpoint',
        type: 'string',
        label: 'Endpoint',
        description: 'Azure OpenAI endpoint URL',
        required: true,
        validation: {
          pattern: '^https://.*\\.openai\\.azure\\.com',
        },
      },
      commonFields.temperature,
      commonFields.maxTokens,
    ],
    validate: (config) => {
      if (config.endpoint) {
        try {
          const url = new URL(config.endpoint);
          // Check if the host ends with the allowed Azure OpenAI domain
          if (!url.hostname.endsWith('.openai.azure.com')) {
            return 'Invalid Azure OpenAI endpoint format';
          }
        } catch (_e) {
          return 'Invalid Azure OpenAI endpoint format';
        }
      }
      return null;
    },
  },
  anthropic: {
    fields: [
      commonFields.apiKey,
      commonFields.apiBaseUrl,
      commonFields.temperature,
      {
        name: 'max_tokens',
        type: 'number',
        label: 'Max Tokens',
        description: 'Maximum tokens in response',
        defaultValue: 4096,
        validation: {
          min: 1,
          max: 200000,
        },
      },
      {
        name: 'model',
        type: 'string',
        label: 'Model',
        description: 'Model name (e.g., claude-3-opus-20240229)',
        required: true,
      },
    ],
  },
};

// Get schema for a provider ID
export function getProviderSchema(providerId: string): ProviderSchema | null {
  // Extract provider type from ID (e.g., "openai:gpt-4" -> "openai")
  const providerType = providerId.split(':')[0];
  return providerSchemas[providerType] || null;
}

// Validate config against schema
export function validateProviderConfig(
  providerId: string,
  config: Record<string, any>,
): { valid: boolean; errors: ValidationError[] } {
  const schema = getProviderSchema(providerId);
  if (!schema) {
    return { valid: true, errors: [] }; // No schema = no validation
  }

  const errors: ValidationError[] = [];

  // Check required fields
  schema.fields.forEach((field) => {
    const value = config[field.name];

    // Required field check (FIX #7: null is treated as empty, but empty string is valid)
    if (field.required && (value === undefined || value === null)) {
      errors.push({ field: field.name, message: `${field.label} is required` });
      return;
    }

    // Type validation
    if (value !== undefined && value !== null && value !== '') {
      const actualType = Array.isArray(value) ? 'array' : typeof value;
      if (actualType !== field.type && !(field.type === 'number' && !isNaN(Number(value)))) {
        errors.push({ field: field.name, message: `${field.label} must be a ${field.type}` });
      }

      // Additional validation rules
      if (field.validation) {
        if (field.type === 'number') {
          const numValue = Number(value);
          if (field.validation.min !== undefined && numValue < field.validation.min) {
            errors.push({
              field: field.name,
              message: `${field.label} must be at least ${field.validation.min}`,
            });
          }
          if (field.validation.max !== undefined && numValue > field.validation.max) {
            errors.push({
              field: field.name,
              message: `${field.label} must be at most ${field.validation.max}`,
            });
          }
        }
        if (field.type === 'string' && field.validation.pattern) {
          const regex = new RegExp(field.validation.pattern);
          if (!regex.test(value)) {
            errors.push({ field: field.name, message: `${field.label} has invalid format` });
          }
        }
        if (field.validation.enum && !field.validation.enum.includes(value)) {
          errors.push({
            field: field.name,
            message: `${field.label} must be one of: ${field.validation.enum.join(', ')}`,
          });
        }
      }
    }
  });

  // Run custom validation if provided
  if (schema.validate) {
    const customError = schema.validate(config);
    if (customError) {
      errors.push({ field: '__custom__', message: customError });
    }
  }

  return { valid: errors.length === 0, errors };
}
