/**
 * Runtime transform utility for applying strategy transforms per-turn.
 *
 * This module enables multi-turn attack providers (Hydra, Crescendo, etc.)
 * to apply layer transforms (audio, base64, etc.) to each turn's prompt
 * before sending to the target.
 *
 * It reuses existing strategy implementations, avoiding code duplication.
 */

import logger from '../../logger';

import type { MediaData } from '../../storage/types';
import type { TestCaseWithPlugin } from '../../types';
// Import type only to avoid circular dependency - actual Strategies loaded dynamically
import type { Strategy } from '../strategies/types';

// Re-export MediaData for backward compatibility
export type { MediaData };

/**
 * Layer configuration - can be a simple string ID or an object with config.
 */
export type LayerConfig = string | { id: string; config?: Record<string, unknown> };

/**
 * Result of runtime transform, including original prompt and any media data.
 */
export interface TransformResult {
  /** The transformed prompt (may be audio/image base64) */
  prompt: string;
  /** Original text before transform */
  originalPrompt: string;
  /** Audio data if audio layer was applied */
  audio?: MediaData;
  /** Image data if image layer was applied */
  image?: MediaData;
  /** Error message if transform failed - caller should skip the turn */
  error?: string;
  /** Additional display vars from the transform (e.g., fetchPrompt, embeddedInjection) */
  displayVars?: Record<string, string>;
  /** Metadata from the transform (e.g., webPageUuid, webPageUrl from indirect-web-pwn) */
  metadata?: Record<string, unknown>;
}

/**
 * Context metadata to pass to runtime transforms.
 * This allows multi-turn providers to pass evaluation context to layer strategies.
 */
export interface RuntimeTransformContext {
  /** The evaluation ID (for server-side tracking) */
  evaluationId?: string;
  /** The test case ID */
  testCaseId?: string;
  /** The purpose/objective of the test */
  purpose?: string;
  /** The goal/target of the attack */
  goal?: string;
}

/**
 * Applies strategy transforms to a prompt at runtime (per-turn).
 * This is used by multi-turn attack providers to transform each turn's
 * output before sending to the target.
 *
 * @param prompt - The text prompt to transform
 * @param injectVar - The variable name used for injection (e.g., 'query')
 * @param layerConfigs - Array of layer configurations to apply in order
 * @param strategies - The loaded strategies array (to avoid circular imports)
 * @param context - Optional context metadata to pass to layer strategies
 * @returns TransformResult with transformed prompt and audio metadata
 *
 * @example
 * ```typescript
 * // In Hydra provider:
 * const result = await applyRuntimeTransforms(
 *   attackPrompt,
 *   'query',
 *   ['audio', 'base64'],
 *   Strategies,
 *   { evaluationId: context?.evaluationId, purpose: context?.test?.metadata?.purpose }
 * );
 * // result.prompt = transformed, result.audio = { data, format } if audio
 * ```
 */
export async function applyRuntimeTransforms(
  prompt: string,
  injectVar: string,
  layerConfigs: LayerConfig[],
  strategies: Strategy[],
  context?: RuntimeTransformContext,
): Promise<TransformResult> {
  const originalPrompt = prompt;

  if (!layerConfigs?.length) {
    return { prompt, originalPrompt };
  }

  logger.debug(`[RuntimeTransform] Applying ${layerConfigs.length} transforms to prompt`, {
    hasContext: !!context,
    hasEvaluationId: !!context?.evaluationId,
    hasPurpose: !!context?.purpose,
  });

  // Create a pseudo test case to run through existing strategy actions
  // This reuses the exact same code path as pre-eval transforms
  // Include context metadata so layer strategies (like indirect-web-pwn) can access evalId, purpose, etc.
  let testCase: TestCaseWithPlugin = {
    vars: { [injectVar]: prompt },
    assert: [],
    metadata: {
      pluginId: 'runtime-transform',
      // Pass through context for server-side tracking
      evaluationId: context?.evaluationId,
      testCaseId: context?.testCaseId,
      purpose: context?.purpose,
      goal: context?.goal,
    },
  };

  let audioApplied = false;
  let imageApplied = false;

  for (const layer of layerConfigs) {
    const layerId = typeof layer === 'string' ? layer : layer.id;
    const layerConfig = typeof layer === 'string' ? {} : layer.config || {};

    // Find the strategy by ID
    const strategy = strategies.find((s) => s.id === layerId);
    if (!strategy) {
      logger.warn(`[RuntimeTransform] Unknown layer strategy: ${layerId}, skipping`);
      continue;
    }

    logger.debug(`[RuntimeTransform] Applying layer: ${layerId}`);

    // Track which media layers were applied
    if (layerId === 'audio') {
      audioApplied = true;
    } else if (layerId === 'image') {
      imageApplied = true;
    }

    try {
      // Call existing strategy action - this REUSES all existing implementation
      // The strategy expects an array of test cases and returns transformed test cases
      const result = await strategy.action([testCase], injectVar, layerConfig);
      const transformed = result[0];

      if (transformed) {
        // Preserve context metadata (evaluationId, testCaseId, purpose, goal) across transforms
        // by merging original metadata first, then transformed metadata on top
        testCase = {
          ...transformed,
          metadata: {
            ...testCase.metadata,
            ...transformed.metadata,
            pluginId: testCase.metadata.pluginId,
          },
        };
      } else {
        logger.warn(`[RuntimeTransform] Layer ${layerId} returned no test cases`);
      }
    } catch (error) {
      const errorMsg = `Transform ${layerId} failed: ${(error as Error).message || 'Unknown error'}`;
      logger.error(`[RuntimeTransform] ${errorMsg}`, { error });
      // Return error so caller can skip the turn
      return {
        prompt: originalPrompt,
        originalPrompt,
        error: errorMsg,
      };
    }
  }

  // Extract the transformed prompt
  const transformedPrompt = String(testCase.vars?.[injectVar] ?? prompt);

  logger.debug(`[RuntimeTransform] Transform complete`, {
    originalLength: prompt.length,
    resultLength: transformedPrompt.length,
    layersApplied: layerConfigs.length,
    audioApplied,
    imageApplied,
  });

  // Extract additional display vars (excluding the main injectVar)
  const displayVars: Record<string, string> = {};
  if (testCase.vars) {
    for (const [key, value] of Object.entries(testCase.vars)) {
      if (key !== injectVar && typeof value === 'string') {
        displayVars[key] = value;
      }
    }
  }

  // Build result with media metadata
  const result: TransformResult = {
    prompt: transformedPrompt,
    originalPrompt,
    ...(Object.keys(displayVars).length > 0 && { displayVars }),
    // Include metadata from the transform (e.g., webPageUuid from indirect-web-pwn)
    metadata: testCase.metadata,
  };

  // Check for storage keys in metadata (set by strategies that store to file system)
  const audioStorageKey = testCase.metadata?.audioStorageKey as string | undefined;
  const imageStorageKey = testCase.metadata?.imageStorageKey as string | undefined;

  // If audio layer was applied, extract audio data
  // IMPORTANT: Keep base64 in result.audio.data for API calls
  // The sanitizer will replace base64 with storageRef before saving to DB
  if (audioApplied && transformedPrompt !== originalPrompt) {
    const dataUrlMatch = transformedPrompt.match(/^data:audio\/([^;]+);base64,(.+)$/);
    if (dataUrlMatch) {
      result.audio = {
        data: dataUrlMatch[2], // Raw base64 for API
        format: dataUrlMatch[1],
      };
    } else {
      result.audio = {
        data: transformedPrompt, // Raw base64 for API
        format: 'mp3',
      };
    }
    // Log if storage key exists (will be used by sanitizer later)
    if (audioStorageKey) {
      logger.debug(
        `[RuntimeTransform] Audio stored to: ${audioStorageKey} (will be sanitized before DB save)`,
      );
    }
  }

  // If image layer was applied, extract image data
  // IMPORTANT: Keep base64 in result.image.data for API calls
  if (imageApplied && transformedPrompt !== originalPrompt) {
    const dataUrlMatch = transformedPrompt.match(/^data:image\/([^;]+);base64,(.+)$/);
    if (dataUrlMatch) {
      result.image = {
        data: dataUrlMatch[2], // Raw base64 for API
        format: dataUrlMatch[1],
      };
    } else {
      result.image = {
        data: transformedPrompt, // Raw base64 for API
        format: 'png',
      };
    }
    // Log if storage key exists (will be used by sanitizer later)
    if (imageStorageKey) {
      logger.debug(
        `[RuntimeTransform] Image stored to: ${imageStorageKey} (will be sanitized before DB save)`,
      );
    }
  }

  return result;
}
