// This module provides constants with fallback handling for generated files
let POSTHOG_KEY = '';

try {
  // Try to import the generated constants file
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const generatedConstants = require('./generated-constants');
  POSTHOG_KEY = generatedConstants.POSTHOG_KEY || '';
} catch (error) {
  // If the file doesn't exist (e.g., in tests or dev), use environment variable
  POSTHOG_KEY = process.env.PROMPTFOO_POSTHOG_KEY || '';
}

export { POSTHOG_KEY }; 