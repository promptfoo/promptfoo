import type { ImageStrategyConfig } from './imageTypes';

export const IMAGE_PRESETS: Record<string, ImageStrategyConfig> = {
  // Subtle distortions - tests if models maintain safety with minor visual noise
  subtle: {
    width: 800,
    height: 400,
    fontSize: 20,
    format: 'png',
    background: '#ffffff',
    textColor: '#000000',
    perChar: {
      enabled: true,
      rotateDegrees: { min: -5, max: 5 },
      jitterX: { min: -1, max: 1 },
      jitterY: { min: -1, max: 1 },
      scale: { min: 0.95, max: 1.05 },
      charSpacing: 1,
    },
    overlays: {
      clutterLines: { min: 2, max: 5 },
      lineWidth: { min: 1, max: 1 },
      lineOpacity: { min: 0.1, max: 0.2 },
      backgroundPattern: 'none',
    },
    transformations: {
      blur: 0.2,
      noiseOpacity: 0.05,
    },
  },

  // Moderate distortions - tests model robustness with visible perturbations
  moderate: {
    width: 800,
    height: 400,
    fontSize: 22,
    format: 'png',
    background: '#ffffff',
    textColor: '#000000',
    perChar: {
      enabled: true,
      rotateDegrees: { min: -10, max: 10 },
      jitterX: { min: -2, max: 2 },
      jitterY: { min: -2, max: 2 },
      scale: { min: 0.9, max: 1.1 },
      charSpacing: 2,
      waveBaseline: {
        amplitude: 5,
        frequency: 0.3,
      },
    },
    overlays: {
      clutterLines: { min: 5, max: 10 },
      lineWidth: { min: 1, max: 2 },
      lineOpacity: { min: 0.2, max: 0.4 },
      speckles: { min: 50, max: 100 },
      speckleRadius: { min: 0.5, max: 1.5 },
      backgroundPattern: 'gradient',
      backgroundPatternOpacity: 0.15,
    },
    color: {
      multicolorLetters: false,
      channelShift: {
        dxR: 1,
        dyR: 0,
        dxB: -1,
        dyB: 0,
        opacity: 0.3,
      },
    },
    transformations: {
      rotateDegrees: { min: -3, max: 3 },
      blur: 0.4,
      noiseOpacity: 0.1,
    },
    occlusion: {
      patches: { min: 1, max: 2 },
      patchSize: { min: 10, max: 20 },
      patchOpacity: 0.9,
    },
  },

  // Aggressive distortions - pushes model boundaries with heavy visual noise
  aggressive: {
    width: 800,
    height: 400,
    fontSize: 24,
    format: 'png',
    background: '#ffffff',
    textColor: '#000000',
    perChar: {
      enabled: true,
      rotateDegrees: { min: -15, max: 15 },
      jitterX: { min: -3, max: 3 },
      jitterY: { min: -3, max: 3 },
      scale: { min: 0.8, max: 1.2 },
      charSpacing: 3,
      fontPerChar: true,
      waveBaseline: {
        amplitude: 8,
        frequency: 0.5,
      },
    },
    overlays: {
      clutterLines: { min: 10, max: 15 },
      lineWidth: { min: 1, max: 3 },
      lineColor: '#666666',
      lineOpacity: { min: 0.3, max: 0.5 },
      speckles: { min: 100, max: 150 },
      speckleRadius: { min: 0.5, max: 2 },
      backgroundPattern: 'grid',
      backgroundPatternOpacity: 0.2,
    },
    color: {
      multicolorLetters: true,
      channelShift: {
        dxR: 2,
        dyR: 1,
        dxB: -2,
        dyB: -1,
        opacity: 0.5,
      },
    },
    transformations: {
      rotateDegrees: { min: -5, max: 5 },
      blur: 0.6,
      noiseOpacity: 0.15,
      perspectiveSkew: {
        xDeg: { min: -5, max: 5 },
        yDeg: { min: -3, max: 3 },
      },
    },
    occlusion: {
      patches: { min: 2, max: 4 },
      patchSize: { min: 15, max: 25 },
      patchOpacity: 0.95,
      substituteChars: true,
      substitutionProbability: 0.15,
    },
    hidden: {
      lowContrast: true,
      lowContrastOpacity: 0.06,
      microtext: true,
      microtextOpacity: 0.05,
    },
  },

  // Extreme distortions - maximum adversarial stress testing for edge cases
  extreme: {
    width: 800,
    height: 400,
    fontSize: 26,
    format: 'png',
    background: '#ffffff',
    textColor: '#000000',
    perChar: {
      enabled: true,
      rotateDegrees: { min: -20, max: 20 },
      jitterX: { min: -5, max: 5 },
      jitterY: { min: -5, max: 5 },
      scale: { min: 0.7, max: 1.3 },
      charSpacing: 4,
      fontPerChar: true,
      waveBaseline: {
        amplitude: 10,
        frequency: 0.8,
        phase: 0,
      },
    },
    overlays: {
      clutterLines: { min: 15, max: 25 },
      lineWidth: { min: 1, max: 4 },
      lineColor: '#666666',
      lineOpacity: { min: 0.4, max: 0.6 },
      speckles: { min: 200, max: 300 },
      speckleRadius: { min: 0.5, max: 3 },
      backgroundPattern: 'noise',
      backgroundPatternOpacity: 0.25,
    },
    color: {
      multicolorLetters: true,
      channelShift: {
        dxR: 3,
        dyR: 1,
        dxB: -3,
        dyB: -1,
        opacity: 0.6,
      },
    },
    transformations: {
      rotateDegrees: { min: -8, max: 8 },
      blur: 0.8,
      noiseOpacity: 0.2,
      perspectiveSkew: {
        xDeg: { min: -8, max: 8 },
        yDeg: { min: -6, max: 6 },
      },
      deepFry: {
        intensity: 3,
        jpegQuality: 25,
        pixelate: true,
        vignette: true,
        hue: 20,
      },
    },
    occlusion: {
      patches: { min: 3, max: 6 },
      patchSize: { min: 20, max: 30 },
      patchOpacity: 0.95,
      substituteChars: true,
      substitutionProbability: 0.25,
    },
    hidden: {
      lowContrast: true,
      lowContrastOpacity: 0.08,
      exif: true,
      microtext: true,
      microtextOpacity: 0.06,
    },
  },
};

/**
 * Get a preset configuration by name
 * @param presetName The name of the preset (subtle, moderate, aggressive, extreme)
 * @returns The preset configuration or undefined if not found
 */
export function getImagePreset(presetName: string): ImageStrategyConfig | undefined {
  return IMAGE_PRESETS[presetName];
}

/**
 * Merge a preset with custom configuration
 * @param presetName The name of the preset to use as base
 * @param customConfig Custom configuration to override preset values
 * @returns Merged configuration
 */
export function mergeImageConfig(
  presetName: string | undefined,
  customConfig?: ImageStrategyConfig,
): ImageStrategyConfig {
  const preset = presetName ? getImagePreset(presetName) : {};

  if (!preset && presetName) {
    console.warn(`Unknown image preset: ${presetName}. Using default configuration.`);
  }

  // Deep merge the configurations
  return deepMerge(preset || {}, customConfig || {});
}

/**
 * Deep merge two objects
 */
function deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
  const result = { ...target };

  for (const key in source) {
    if (source[key] !== undefined) {
      if (typeof source[key] === 'object' && !Array.isArray(source[key]) && source[key] !== null) {
        result[key] = deepMerge(
          result[key] || {},
          source[key] as Record<string, any>,
        ) as T[typeof key];
      } else {
        result[key] = source[key] as T[typeof key];
      }
    }
  }

  return result;
}