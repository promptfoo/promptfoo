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
  // Expected parsing/configuration errors from test scenarios
  /Failed to parse prompt as JSON/, // 49 occurrences
  /Invalid JSON configuration:/, // 1 occurrence
  /Error parsing file:/, // 2 occurrences

  // Expected API/network errors from intentional test failures
  /Error fetching cloud config:/, // 39 occurrences
  /Failed to check share domain:/, // 6 occurrences
  /Failed to generate share URL:/, // 1 occurrence
  /Error during target purpose discovery:/, // 2 occurrences
  /Error fetching user email:/, // 3 occurrences
  /Error during logout:/, // 1 occurrence
  /Logout failed/, // 1 occurrence

  // Expected operation errors from intentional test failures
  /Failed to submit test suite/, // 1 occurrence
  /Failed to copy text:/, // 1 occurrence
  /Failed to delete eval:/, // 2 occurrences
  /Failed to fetch datasets:/, // From DatasetsPage test
  /Error loading eval:/, // From Eval component test

  // Expected context provider errors from tests (testing components outside providers)
  /must be used within a.*Provider/, // 8 occurrences (ToastProvider, ShiftKeyProvider, etc.)
  /Uncaught.*must be used within/, // Wrapped version of above

  // Error boundary messages  /Consider adding an error boundary to your tree/, // React suggestion message
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
