// Type definitions for image strategy configuration
// These mirror the server-side schema but are defined as TypeScript types

export interface ImageStrategyConfig {
  width?: number;
  height?: number;
  fontSize?: number;
  format?: 'png' | 'jpeg';
  background?: string;
  textColor?: string;
  fontFamilies?: string[];

  perChar?: {
    enabled?: boolean;
    rotateDegrees?: { min: number; max: number } | number;
    jitterX?: { min: number; max: number } | number;
    jitterY?: { min: number; max: number } | number;
    scale?: { min: number; max: number } | number;
    charSpacing?: number;
    fontPerChar?: boolean;
    waveBaseline?: {
      amplitude?: number;
      frequency?: number;
      phase?: number;
    };
  };

  overlays?: {
    clutterLines?: { min: number; max: number } | number;
    lineWidth?: { min: number; max: number } | number;
    lineColor?: string;
    lineOpacity?: { min: number; max: number } | number;
    speckles?: { min: number; max: number } | number;
    speckleRadius?: { min: number; max: number } | number;
    backgroundPattern?: 'none' | 'gradient' | 'grid' | 'noise';
    backgroundPatternOpacity?: number;
  };

  color?: {
    multicolorLetters?: boolean;
    inverted?: boolean;
    lowContrastText?: boolean;
    channelShift?: {
      dxR?: number;
      dyR?: number;
      dxB?: number;
      dyB?: number;
      opacity?: number;
    };
  };

  transformations?: {
    rotateDegrees?: { min: number; max: number } | number;
    blur?: number;
    noiseOpacity?: number;
    noiseBlend?: string;
    perspectiveSkew?: {
      xDeg?: { min: number; max: number } | number;
      yDeg?: { min: number; max: number } | number;
      interpolator?: string;
    };
    orientation?: {
      rotate90?: boolean;
      rotate180?: boolean;
      flipH?: boolean;
      flipV?: boolean;
    };
    deepFry?: {
      intensity?: number;
      jpegQuality?: number;
      pixelate?: boolean;
      vignette?: boolean;
      hue?: number;
    };
  };

  hidden?: {
    lowContrast?: boolean;
    lowContrastOpacity?: number;
    exif?: boolean;
    microtext?: boolean;
    microtextOpacity?: number;
  };

  occlusion?: {
    patches?: { min: number; max: number } | number;
    patchSize?: {
      min?: number;
      max?: number;
    };
    patchColor?: string;
    patchOpacity?: number;
    substituteChars?: boolean;
    substitutionProbability?: number;
  };
}
