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
    // Replace CSS variables with placeholder values to avoid parsing errors
    if (typeof value === 'string' && value.includes('var(--')) {
      // Replace common CSS variables that cause parsing issues
      value = value
        .replace(/var\(--[\w-]+\)/g, 'transparent') // Replace CSS variables with a safe fallback
        .replace(/1px solid var\(--[\w-]+\)/g, '1px solid transparent'); // Specific fix for border values
    }

    try {
      return originalSetProperty.call(this, property, value, priority);
    } catch (error) {
      // Silently ignore any remaining CSS parsing errors
      if (error instanceof TypeError && (
        error.message.includes('border') ||
        error.message.includes('Cannot create property')
      )) {
        return;
      }
      throw error;
    }
  };

  // Patch all border-related property setters to handle CSS variables
  const borderProperties = [
    'border', 'borderTop', 'borderRight', 'borderBottom', 'borderLeft',
    'borderWidth', 'borderStyle', 'borderColor'
  ];

  borderProperties.forEach(prop => {
    const descriptor = Object.getOwnPropertyDescriptor(CSSStyleDeclaration.prototype, prop);
    if (descriptor?.set) {
      Object.defineProperty(CSSStyleDeclaration.prototype, prop, {
        set: function (value) {
          if (typeof value === 'string' && value.includes('var(--')) {
            value = value.replace(/var\(--[\w-]+\)/g, 'transparent');
          }
          try {
            return descriptor.set.call(this, value);
          } catch (error) {
            // Ignore CSS parsing errors for border properties
            return;
          }
        },
        get: descriptor.get,
        configurable: true,
        enumerable: true
      });
    }
  });
}
