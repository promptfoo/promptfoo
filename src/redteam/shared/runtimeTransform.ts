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

import type { TestCaseWithPlugin } from '../../types';
// Import type only to avoid circular dependency - actual Strategies loaded dynamically
import type { Strategy } from '../strategies/types';

/**
 * Layer configuration - can be a simple string ID or an object with config.
 */
export type LayerConfig = string | { id: string; config?: Record<string, unknown> };

/** Media data (audio or image) */
export interface MediaData {
  data: string;
  format: string;
}

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
 * @returns TransformResult with transformed prompt and audio metadata
 *
 * @example
 * ```typescript
 * // In Hydra provider:
 * const result = await applyRuntimeTransforms(
 *   attackPrompt,
 *   'query',
 *   ['audio', 'base64'],
 *   Strategies
 * );
 * // result.prompt = transformed, result.audio = { data, format } if audio
 * ```
 */
export async function applyRuntimeTransforms(
  prompt: string,
  injectVar: string,
  layerConfigs: LayerConfig[],
  strategies: Strategy[],
): Promise<TransformResult> {
  const originalPrompt = prompt;

  if (!layerConfigs?.length) {
    return { prompt, originalPrompt };
  }

  logger.debug(`[RuntimeTransform] Applying ${layerConfigs.length} transforms to prompt`);

  // Create a pseudo test case to run through existing strategy actions
  // This reuses the exact same code path as pre-eval transforms
  let testCase: TestCaseWithPlugin = {
    vars: { [injectVar]: prompt },
    assert: [],
    metadata: { pluginId: 'runtime-transform' },
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
        // Preserve the pluginId while updating the test case
        testCase = {
          ...transformed,
          metadata: {
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

  // Build result with media metadata
  const result: TransformResult = {
    prompt: transformedPrompt,
    originalPrompt,
  };

  // If audio layer was applied, extract audio data
  if (audioApplied && transformedPrompt !== originalPrompt) {
    // Check if it's a data URL or raw base64
    const dataUrlMatch = transformedPrompt.match(/^data:audio\/([^;]+);base64,(.+)$/);
    if (dataUrlMatch) {
      // Already a data URL - extract format and raw data
      result.audio = {
        data: dataUrlMatch[2], // Just the base64 part
        format: dataUrlMatch[1],
      };
    } else {
      // Raw base64 - assume MP3 format (Google Cloud TTS default)
      result.audio = {
        data: transformedPrompt,
        format: 'mp3',
      };
    }
  }

  // If image layer was applied, extract image data
  if (imageApplied && transformedPrompt !== originalPrompt) {
    // Check if it's a data URL or raw base64
    const dataUrlMatch = transformedPrompt.match(/^data:image\/([^;]+);base64,(.+)$/);
    if (dataUrlMatch) {
      // Already a data URL - extract format and raw data
      result.image = {
        data: dataUrlMatch[2], // Just the base64 part
        format: dataUrlMatch[1],
      };
    } else {
      // Raw base64 - assume PNG format
      result.image = {
        data: transformedPrompt,
        format: 'png',
      };
    }
  }

  return result;
}
