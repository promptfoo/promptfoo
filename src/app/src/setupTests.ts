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

// Fix jsdom CSS custom properties parsing issues with DataGrid
// This handles the border CSS parsing error with CSS variables
if (typeof window !== 'undefined') {
  // Comprehensive fix for cssstyle library CSS variable parsing issues
  const originalSetProperty = CSSStyleDeclaration.prototype.setProperty;
  CSSStyleDeclaration.prototype.setProperty = function (property, value, priority) {
    // Only replace CSS variables that cause parsing errors (border-related)
    // Leave other CSS variables intact for tests that expect them
    if (typeof value === 'string' && value.includes('var(--')) {
      // Only replace border-related CSS variables that cause cssstyle parsing errors
      if (
        value.includes('1px solid var(--') ||
        value.includes('border') ||
        value.match(/var\(--[\w-]*border[\w-]*\)/i)
      ) {
        value = value
          .replace(/1px solid var\(--[\w-]*border[\w-]*\)/gi, '1px solid transparent')
          .replace(/var\(--[\w-]*border[\w-]*\)/gi, 'transparent');
      }
    }

    try {
      return originalSetProperty.call(this, property, value, priority);
    } catch (error) {
      // Silently ignore CSS parsing errors for border properties only
      if (
        error instanceof TypeError &&
        (error.message.includes('border') || error.message.includes('Cannot create property'))
      ) {
        return;
      }
      throw error;
    }
  };

  // Patch border-related property setters to handle CSS variables that cause parsing errors
  const borderProperties = [
    'border',
    'borderTop',
    'borderRight',
    'borderBottom',
    'borderLeft',
    'borderWidth',
    'borderStyle',
    'borderColor',
  ];

  borderProperties.forEach((prop) => {
    const descriptor = Object.getOwnPropertyDescriptor(CSSStyleDeclaration.prototype, prop);
    if (descriptor?.set) {
      Object.defineProperty(CSSStyleDeclaration.prototype, prop, {
        set: function (value) {
          // Only replace border-related CSS variables that cause parsing errors
          if (typeof value === 'string' && value.includes('var(--')) {
            if (value.match(/var\(--[\w-]*border[\w-]*\)/i) || value.includes('1px solid var(--')) {
              value = value
                .replace(/1px solid var\(--[\w-]*border[\w-]*\)/gi, '1px solid transparent')
                .replace(/var\(--[\w-]*border[\w-]*\)/gi, 'transparent');
            }
          }
          try {
            return descriptor.set.call(this, value);
          } catch (_error) {
            // Ignore CSS parsing errors for border properties
            return;
          }
        },
        get: descriptor.get,
        configurable: true,
        enumerable: true,
      });
    }
  });
}
