/**
 * LLM Cascading support for ElevenLabs Agents
 *
 * Enables fallback LLM selection for cost/performance optimization
 */

import logger from '../../../logger';
import type { LLMCascadeConfig } from './types';

/**
 * Build LLM cascade configuration for API request
 */
export function buildLLMCascadeConfig(config: LLMCascadeConfig): Record<string, any> {
  logger.debug('[ElevenLabs LLM Cascade] Building cascade configuration', {
    primary: config.primary,
    fallbackCount: config.fallback.length,
  });

  const cascade: Record<string, any> = {
    models: [config.primary, ...config.fallback],
    cascade_on_error: config.cascadeOnError !== false,
  };

  // Add latency-based cascading
  if (config.cascadeOnLatency?.enabled) {
    cascade.cascade_on_latency = true;
    cascade.max_latency_ms = config.cascadeOnLatency.maxLatencyMs;

    logger.debug('[ElevenLabs LLM Cascade] Latency-based cascading enabled', {
      maxLatencyMs: config.cascadeOnLatency.maxLatencyMs,
    });
  }

  // Add cost-based cascading
  if (config.cascadeOnCost?.enabled) {
    cascade.cascade_on_cost = true;
    cascade.max_cost_per_request = config.cascadeOnCost.maxCostPerRequest;

    logger.debug('[ElevenLabs LLM Cascade] Cost-based cascading enabled', {
      maxCost: config.cascadeOnCost.maxCostPerRequest,
    });
  }

  return cascade;
}

/**
 * Validate LLM cascade configuration
 */
export function validateLLMCascadeConfig(config: LLMCascadeConfig): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Validate primary model
  if (!config.primary || config.primary.trim().length === 0) {
    errors.push('Primary LLM model is required');
  }

  // Validate fallback models
  if (!config.fallback || config.fallback.length === 0) {
    errors.push('At least one fallback LLM model is required');
  }

  // Check for duplicate models
  const allModels = [config.primary, ...config.fallback];
  const uniqueModels = new Set(allModels);
  if (uniqueModels.size !== allModels.length) {
    errors.push('Duplicate models detected in cascade configuration');
  }

  // Validate latency config
  if (config.cascadeOnLatency?.enabled) {
    if (!config.cascadeOnLatency.maxLatencyMs || config.cascadeOnLatency.maxLatencyMs <= 0) {
      errors.push('Max latency must be positive when latency cascading is enabled');
    }
  }

  // Validate cost config
  if (config.cascadeOnCost?.enabled) {
    if (!config.cascadeOnCost.maxCostPerRequest || config.cascadeOnCost.maxCostPerRequest <= 0) {
      errors.push('Max cost must be positive when cost cascading is enabled');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Predefined LLM cascade configurations
 */
export const LLM_CASCADE_PRESETS: Record<string, LLMCascadeConfig> = {
  // Quality-first: Start with best model, fall back to cheaper
  qualityFirst: {
    primary: 'gpt-4o',
    fallback: ['gpt-4o-mini', 'gpt-3.5-turbo'],
    cascadeOnError: true,
  },

  // Cost-optimized: Start with cheaper model, fall back if quality issues
  costOptimized: {
    primary: 'gpt-4o-mini',
    fallback: ['gpt-4o'],
    cascadeOnError: true,
  },

  // Balanced: Mid-tier model with both directions
  balanced: {
    primary: 'gpt-4o-mini',
    fallback: ['gpt-4o', 'gpt-3.5-turbo'],
    cascadeOnError: true,
  },

  // Latency-sensitive: Fast models with backup
  latencySensitive: {
    primary: 'gpt-3.5-turbo',
    fallback: ['gpt-4o-mini'],
    cascadeOnError: true,
    cascadeOnLatency: {
      enabled: true,
      maxLatencyMs: 2000, // 2 seconds
    },
  },

  // Claude-focused
  claudeFocused: {
    primary: 'claude-sonnet-4-5-20250929',
    fallback: ['claude-sonnet-3-5-20241022', 'claude-haiku-3-5-20241022'],
    cascadeOnError: true,
  },

  // Multi-provider fallback
  multiProvider: {
    primary: 'gpt-4o',
    fallback: ['claude-sonnet-4-5-20250929', 'gemini-2.0-flash-exp'],
    cascadeOnError: true,
  },
};

/**
 * Get LLM cascade preset by name
 */
export function getLLMCascadePreset(
  presetName: keyof typeof LLM_CASCADE_PRESETS,
): LLMCascadeConfig {
  const preset = LLM_CASCADE_PRESETS[presetName];

  if (!preset) {
    throw new Error(`Unknown LLM cascade preset: ${presetName}`);
  }

  return preset;
}

/**
 * Analyze cascade usage from conversation metadata
 */
export function analyzeCascadeUsage(metadata?: {
  llm_cascade_hits?: Array<{
    model: string;
    reason: 'error' | 'latency' | 'cost';
    fallback_model: string;
  }>;
}): {
  cascadesTriggered: number;
  cascadesByReason: Map<string, number>;
  modelUsage: Map<string, number>;
} {
  const cascadesByReason = new Map<string, number>();
  const modelUsage = new Map<string, number>();
  let cascadesTriggered = 0;

  if (!metadata?.llm_cascade_hits) {
    return {
      cascadesTriggered: 0,
      cascadesByReason,
      modelUsage,
    };
  }

  for (const hit of metadata.llm_cascade_hits) {
    cascadesTriggered++;

    // Count by reason
    cascadesByReason.set(hit.reason, (cascadesByReason.get(hit.reason) || 0) + 1);

    // Track model usage
    modelUsage.set(hit.model, (modelUsage.get(hit.model) || 0) + 1);
    modelUsage.set(hit.fallback_model, (modelUsage.get(hit.fallback_model) || 0) + 1);
  }

  return {
    cascadesTriggered,
    cascadesByReason,
    modelUsage,
  };
}
