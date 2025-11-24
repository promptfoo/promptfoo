// This file provides constants for development and testing.
// During build, this file is regenerated with hardcoded values for production.
// DO NOT manually edit the generated values - they will be overwritten.

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

// Read package.json at runtime for development/testing
// In production builds, these are replaced with hardcoded values by generate-constants.cjs
function getPackageJson(): { version: string; engines: { node: string } } {
  try {
    // Try ESM path resolution first
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const packagePath = join(currentDir, '../../package.json');
    return JSON.parse(readFileSync(packagePath, 'utf8'));
  } catch {
    // Fallback for CJS or if file not found
    try {
      // Try relative to process.cwd() as fallback
      return JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'));
    } catch {
      // Ultimate fallback
      return {
        version: '0.0.0-development',
        engines: { node: '>=20.0.0' },
      };
    }
  }
}

const pkg = getPackageJson();

export const VERSION = pkg.version;
export const POSTHOG_KEY = process.env.PROMPTFOO_POSTHOG_KEY || '';
export const ENGINES = pkg.engines as { readonly node: string };
