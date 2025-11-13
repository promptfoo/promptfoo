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
 */
const originalConsoleError = console.error;

const SUPPRESSED_ERROR_PATTERNS = [
  // useCloudConfig hook errors - occurs when components render without API mocks
  /Error fetching cloud config:/,
  // Expected parsing errors from test scenarios
  /Failed to parse prompt as JSON/,
  // Expected API failure tests
  /Failed to check share domain/,
  /Failed to generate share URL/,
  // Expected error handling tests
  /Error during target purpose discovery/,
  /Invalid JSON configuration/,
  /Error parsing file:/,
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

/**
 * Global console.warn suppression for known MUI and React testing warnings.
 * MUI components (Tabs, TouchRipple, FormControl, etc.) trigger async state updates
 * during initialization that React Testing Library detects as unwrapped act() calls.
 * These are cosmetic warnings that don't affect test validity.
 */
const originalConsoleWarn = console.warn;

const SUPPRESSED_WARNING_PATTERNS = [
  // MUI component internal state updates during testing
  /An update to ForwardRef\(Tabs\) inside a test was not wrapped in act/,
  /An update to ForwardRef\(TouchRipple\) inside a test was not wrapped in act/,
  /An update to ForwardRef\(FormControl\) inside a test was not wrapped in act/,
  /An update to ForwardRef\(Tooltip\) inside a test was not wrapped in act/,
  /An update to TransitionGroup inside a test was not wrapped in act/,

  // React Testing Library configuration messages
  /The current testing environment is not configured to support act/,

  // DOM nesting warnings - informational only, doesn't affect functionality
  /validateDOMNesting/,

  // MUI prop validation warnings from intentional test scenarios
  /MUI: You have provided an out-of-range value/,
  /MUI: The `value` provided to the Tabs component is invalid/,
  /Failed prop type: MUI: The `anchorEl` prop/,

  // React 18 deprecation warnings - will be addressed in migration
  /ReactDOM\.render is no longer supported/,
  /unmountComponentAtNode is deprecated/,

  // Controlled/uncontrolled component warnings during test transitions
  /A component is changing an uncontrolled input to be controlled/,

  // Function component ref warnings
  /Function components cannot be given refs/,
];

console.warn = (...args: any[]) => {
  const warnMessage = args.join(' ');

  // Check if this warning matches any suppressed patterns
  const shouldSuppress = SUPPRESSED_WARNING_PATTERNS.some((pattern) => pattern.test(warnMessage));

  // Only log if not suppressed
  if (!shouldSuppress) {
    originalConsoleWarn(...args);
  }
};
