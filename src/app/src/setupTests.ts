import '@testing-library/jest-dom';
// Ensure Prism is initialized before any language components are loaded
import 'prismjs';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-http';

// We can mock the environment variables. For example:
// process.env.PROMPTFOO_VERSION = '1.0.0';

/**
 * Global console.error suppression for known test noise patterns.
 * This filters out expected errors that flood the test output but preserves
 * actual unexpected errors that indicate real problems.
 *
 * Note: Warning suppressions are handled in vite.config.ts at the test runner level.
 */
const originalConsoleError = console.error;

const SUPPRESSED_ERROR_PATTERNS = [
  // Expected parsing errors from test scenarios (49 occurrences across tests)
  /Failed to parse prompt as JSON/,
];

console.error = (...args: any[]) => {
  const errorMessage = args.join(' ');

  // Check if this error matches any suppressed patterns
  const shouldSuppress = SUPPRESSED_ERROR_PATTERNS.some((pattern) => pattern.test(errorMessage));

  // Only log if not suppressed
  if (!shouldSuppress) {
    originalConsoleError(...args);
  }
};
