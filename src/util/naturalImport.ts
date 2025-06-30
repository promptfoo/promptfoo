// Utility for conditionally importing 'natural' module
import type { Stemmer, WordNetStatic } from '../types/natural';

let naturalModule: {
  PorterStemmer: Stemmer;
  WordNet: WordNetStatic;
} | null = null;

/**
 * Conditionally imports the 'natural' module
 * @returns Promise resolving to natural module exports or throws if not available
 */
export async function getNaturalModule(): Promise<{
  PorterStemmer: Stemmer;
  WordNet: WordNetStatic;
}> {
  if (naturalModule) {
    return naturalModule;
  }

  try {
    // Try to import the actual 'natural' module using dynamic import
    const getModuleName = () => 'natural';
    const natural = await import(getModuleName());
    naturalModule = {
      PorterStemmer: natural.PorterStemmer,
      WordNet: natural.WordNet,
    };
    return naturalModule;
  } catch {
    throw new Error(
      'The "natural" package is required for METEOR score calculations. Please install it with: npm install natural'
    );
  }
}

/**
 * Check if natural module is available without importing it
 * This is useful for conditional functionality
 */
export function isNaturalAvailable(): Promise<boolean> {
  return getNaturalModule()
    .then(() => true)
    .catch(() => false);
}