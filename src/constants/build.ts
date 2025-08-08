// This file provides build-time constants with fallbacks for development
// In production builds, these values come from src/generated/constants.ts
// In development, they fall back to environment variables

let POSTHOG_KEY: string;

try {
  // Try to import from generated constants (created during build)
  const generated = require('../generated/constants');
  POSTHOG_KEY = generated.POSTHOG_KEY;
} catch {
  // Fallback to environment variables for development
  POSTHOG_KEY = process.env.PROMPTFOO_POSTHOG_KEY || '';
}

export { POSTHOG_KEY };
